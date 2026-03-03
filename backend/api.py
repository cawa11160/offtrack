from __future__ import annotations

import base64
import os
import time
import uuid
import mimetypes
import re
from typing import List, Optional, Dict, Any
from urllib.parse import quote
from functools import lru_cache
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from db import get_db, SessionLocal, engine, wait_for_db
from models import Track, Interaction, User, TrackAudio, UploadedTrack, LyricReel, Base
from recommender import get_recommender
from analytics import get_analytics

from fastapi.responses import RedirectResponse, StreamingResponse

load_dotenv()

app = FastAPI(title="Offtrack API")

try:
    from spotify_auth import router as spotify_router
    app.include_router(spotify_router)
except Exception:
    # Spotify auth endpoints are optional in local/dev environments.
    pass

# -----------------------------
# Media storage (full-song uploads)
# -----------------------------
# For local Docker: mounted as a named volume.
# For Render: set MEDIA_DIR to a persistent disk mount (recommended) or use S3/R2 later.
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", "/app/media")).resolve()
MEDIA_TRACKS_DIR = MEDIA_DIR / "tracks"       # full audio for existing catalog tracks
MEDIA_UPLOADS_DIR = MEDIA_DIR / "uploads"     # uploaded track catalog
MEDIA_REELS_DIR = MEDIA_DIR / "reels"         # generated lyric reels (mp4)
MEDIA_REEL_ASSETS_DIR = MEDIA_DIR / "reel_assets"  # temporary generated images
MEDIA_TRACKS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_REELS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_REEL_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

UPLOAD_SECRET = os.getenv("UPLOAD_SECRET", "").strip()  # optional
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))  # keep reasonable for MVP
REQUIRE_AUTH_UPLOADS = os.getenv("REQUIRE_AUTH_UPLOADS", "true").strip().lower() in ("1", "true", "yes")


def _check_upload_secret(request: Request) -> bool:
    """If UPLOAD_SECRET is set, require it in a header or query param.

    This keeps your demo instance from becoming an open file drop.
    """
    if not UPLOAD_SECRET:
        return True
    got = (request.headers.get("X-Upload-Secret") or "").strip()
    if not got:
        got = (request.query_params.get("secret") or "").strip()
    return bool(got) and got == UPLOAD_SECRET


def _guess_mime_and_ext(filename: str | None, content_type: str | None) -> tuple[str, str]:
    ct = (content_type or "").split(";")[0].strip() or "audio/mpeg"
    name = (filename or "").strip()
    ext = ""
    if name and "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()

    # Basic allow-list so we don't write weird extensions.
    if ext not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
        # fall back to mime inference
        ext = mimetypes.guess_extension(ct) or ".mp3"
        if ext == ".mpga":  # some systems map audio/mpeg -> .mpga
            ext = ".mp3"

    # normalize some mimes
    if ct in {"audio/mp3", "audio/mpeg"}:
        ct = "audio/mpeg"
    return ct, ext


def _parse_range_header(range_header: str | None, file_size: int) -> tuple[int, int] | None:
    """Parse `Range: bytes=start-end`.

    Returns (start, end) inclusive. If header invalid, returns None.
    """
    if not range_header:
        return None
    m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not m:
        return None
    start_s, end_s = m.group(1), m.group(2)
    if start_s == "" and end_s == "":
        return None
    if start_s == "":
        # suffix bytes: bytes=-500
        suffix = int(end_s)
        if suffix <= 0:
            return None
        start = max(0, file_size - suffix)
        end = file_size - 1
        return start, end
    start = int(start_s)
    if start < 0 or start >= file_size:
        return None
    if end_s == "":
        end = file_size - 1
    else:
        end = int(end_s)
        end = min(end, file_size - 1)
        if end < start:
            return None
    return start, end


def _stream_file(path: Path, mime_type: str, request: Request):
    """Stream a file with HTTP Range support.

    This makes `<audio ...>` seeking work in browsers (and stops large files from being
    downloaded from byte 0 every time).
    """
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")

    size = path.stat().st_size
    range_header = request.headers.get("range")
    rng = _parse_range_header(range_header, size)

    def iter_bytes(start: int, length: int, chunk_size: int = 1024 * 1024):
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
    }

    if rng is None:
        headers["Content-Length"] = str(size)
        return StreamingResponse(iter_bytes(0, size), media_type=mime_type, headers=headers)

    start, end = rng
    length = end - start + 1
    headers.update(
        {
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
        }
    )
    return StreamingResponse(iter_bytes(start, length), status_code=206, media_type=mime_type, headers=headers)

# -----------------------------
# CORS
# -----------------------------
ALLOW_ORIGINS = os.getenv(
    "ALLOW_ORIGINS",
    "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
).split(",")
ALLOW_ORIGINS = [o.strip() for o in ALLOW_ORIGINS if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Auth (email/password + JWT)
# -----------------------------
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

# NOTE: We intentionally use PBKDF2 for password hashing.
# bcrypt can fail in slim Docker images due to native dependency issues,
# which shows up as a 500 "Internal Server Error" during signup.
# PBKDF2 is slower than bcrypt but is pure-Python and reliable for an MVP.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "dev_change_me").strip()
JWT_ALG = os.getenv("JWT_ALG", "HS256").strip() or "HS256"
ACCESS_TTL_MIN = int(os.getenv("ACCESS_TTL_MIN", "30"))
REFRESH_TTL_DAYS = int(os.getenv("REFRESH_TTL_DAYS", "30"))

REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "offtrack_refresh").strip() or "offtrack_refresh"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()  # lax|strict|none

def _hash_password(pw: str) -> str:
    return pwd_context.hash(pw)

def _verify_password(pw: str, pw_hash: str) -> bool:
    try:
        return pwd_context.verify(pw, pw_hash)
    except Exception:
        return False

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _encode(payload: dict) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def _decode(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])

def _create_access_token(user_id: int) -> str:
    now = _now_utc()
    exp = now + timedelta(minutes=ACCESS_TTL_MIN)
    return _encode({"sub": str(user_id), "type": "access", "iat": int(now.timestamp()), "exp": int(exp.timestamp())})

def _create_refresh_token(user_id: int) -> str:
    now = _now_utc()
    exp = now + timedelta(days=REFRESH_TTL_DAYS)
    return _encode({"sub": str(user_id), "type": "refresh", "iat": int(now.timestamp()), "exp": int(exp.timestamp())})

def _set_refresh_cookie(resp: Response, token: str) -> None:
    # If COOKIE_SAMESITE is "none", Secure must be true in modern browsers.
    secure = COOKIE_SECURE or (COOKIE_SAMESITE == "none")
    resp.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=REFRESH_TTL_DAYS * 24 * 60 * 60,
    )

def _clear_refresh_cookie(resp: Response) -> None:
    resp.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")

class SignupIn(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    account_type: str | None = Field(default="listener", pattern="^(listener|artist)$")

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class AuthOut(BaseModel):
    access_token: str

class MeOut(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None

def _get_bearer_token(req: Request) -> str:
    auth = req.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return auth.split(" ", 1)[1].strip()

def get_current_user_id(req: Request) -> int:
    token = _get_bearer_token(req)
    try:
        data = _decode(token)
        if data.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/auth/signup", response_model=AuthOut)
def auth_signup(payload: SignupIn, resp: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    name = (payload.name or "").strip() or None
    try:
        exists = db.query(User).filter(User.email == email).first()
        if exists:
            raise HTTPException(status_code=409, detail="Email already exists")

        user = User(email=email, name=name, password_hash=_hash_password(payload.password))
        db.add(user)
        db.commit()
        db.refresh(user)
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        # Handles race conditions where two signups happen with same email.
        raise HTTPException(status_code=409, detail="Email already exists")
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")

    access = _create_access_token(user.id)
    refresh = _create_refresh_token(user.id)
    _set_refresh_cookie(resp, refresh)
    return {"access_token": access}

@app.post("/api/auth/login", response_model=AuthOut)
def auth_login(payload: LoginIn, resp: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    try:
        user = db.query(User).filter(User.email == email).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if not user or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access = _create_access_token(user.id)
    refresh = _create_refresh_token(user.id)
    _set_refresh_cookie(resp, refresh)
    return {"access_token": access}

@app.post("/api/auth/refresh", response_model=AuthOut)
def auth_refresh(req: Request, resp: Response):
    token = req.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        data = _decode(token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    access = _create_access_token(user_id)
    # rotate refresh
    new_refresh = _create_refresh_token(user_id)
    _set_refresh_cookie(resp, new_refresh)
    return {"access_token": access}

@app.post("/api/auth/logout")
def auth_logout(resp: Response):
    _clear_refresh_cookie(resp)
    return {"ok": True}

@app.get("/api/auth/me", response_model=MeOut)
def auth_me(req: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(req)
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": user.id, "email": user.email, "name": user.name}


@app.on_event("startup")
def _startup_schema_init() -> None:
    # Make auth and upload tables available in fresh environments before first request.
    try:
        wait_for_db(timeout_s=45)
        Base.metadata.create_all(engine)
    except Exception:
        # Do not crash startup in environments that intentionally boot without DB.
        pass


def _require_uploader_identity(req: Request) -> Optional[int]:
    if not REQUIRE_AUTH_UPLOADS:
        return None
    try:
        return get_current_user_id(req)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Login required to upload tracks")


# -----------------------------
# Spotify helpers (optional)
# -----------------------------
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()

_token = {"value": "", "expires_at": 0}


def spotify_enabled() -> bool:
    return bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET)


def get_spotify_token() -> str:
    if not spotify_enabled():
        return ""

    now = int(time.time())
    if _token["value"] and now < _token["expires_at"] - 30:
        return _token["value"]

    auth = base64.b64encode(
        f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
    ).decode()

    r = requests.post(
        "https://accounts.spotify.com/api/token",
        headers={"Authorization": f"Basic {auth}"},
        data={"grant_type": "client_credentials"},
        timeout=15,
    )
    if r.status_code != 200:
        return ""

    data = r.json()
    _token["value"] = data.get("access_token", "") or ""
    _token["expires_at"] = now + int(data.get("expires_in", 0) or 0)
    return _token["value"]


def _safe_year(y: Optional[int]) -> Optional[int]:
    if y is None:
        return None
    try:
        y = int(y)
        if 1800 <= y <= 2100:
            return y
    except Exception:
        pass
    return None


def _track_to_playback_fields(track_obj: Dict[str, Any]) -> Dict[str, Any]:
    artists = track_obj.get("artists") or []
    first_artist = (artists[0] if artists else {}) or {}
    return {
        "previewUrl": track_obj.get("preview_url"),
        "spotifyUrl": (track_obj.get("external_urls") or {}).get("spotify"),
        "spotifyUri": track_obj.get("uri"),
        "durationMs": track_obj.get("duration_ms"),
        "spotifyArtistUrl": (first_artist.get("external_urls") or {}).get("spotify"),
        "spotifyArtistName": first_artist.get("name"),
    }


@lru_cache(maxsize=2048)
def spotify_track_lookup(title: str, artist: str) -> Optional[Dict[str, Any]]:
    token = get_spotify_token()
    if not token:
        return None

    headers = {"Authorization": f"Bearer {token}"}
    q = f'track:"{title}" artist:"{artist}"'
    url = "https://api.spotify.com/v1/search"
    params = {"q": q, "type": "track", "limit": 1}

    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
    except requests.RequestException:
        return None

    if r.status_code != 200:
        return None

    items = (r.json().get("tracks") or {}).get("items") or []
    if not items:
        return None

    t = items[0]
    images = (t.get("album") or {}).get("images") or []
    image_url = images[0]["url"] if images else None

    return {
        "spotifyId": t.get("id"),
        "imageUrl": image_url,
        "album": (t.get("album") or {}).get("name"),
        **_track_to_playback_fields(t),
    }


def spotify_search(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    token = get_spotify_token()
    if not token:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    url = "https://api.spotify.com/v1/search"
    params = {"q": query, "type": "track", "limit": int(limit)}

    try:
        response = requests.get(url, headers=headers,
                                params=params, timeout=15)
    except requests.RequestException:
        return []

    if response.status_code != 200:
        return []

    tracks = (response.json().get("tracks") or {}).get("items") or []
    results: List[Dict[str, Any]] = []

    for track in tracks:
        images = (track.get("album") or {}).get("images") or []
        image_url = images[0]["url"] if images else None

        year: Optional[str] = None
        release_date = (track.get("album") or {}).get("release_date")
        if release_date:
            year = release_date.split("-")[0]

        results.append(
            {
                "id": track.get("id"),
                "title": track.get("name"),
                "artist": (track.get("artists") or [{}])[0].get("name"),
                "year": year,
                "imageUrl": image_url,
                "source": "spotify",
                **_track_to_playback_fields(track),
            }
        )

    return results


def itunes_cover(title: str, artist: str) -> str:
    term = quote(f"{title} {artist}".strip())
    url = f"https://itunes.apple.com/search?term={term}&entity=song&limit=1"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return ""
        results = (r.json() or {}).get("results") or []
        if not results:
            return ""
        art = results[0].get("artworkUrl100") or results[0].get(
            "artworkUrl60") or ""
        if not art:
            return ""
        return (
            art.replace("100x100bb.jpg", "600x600bb.jpg")
            .replace("60x60bb.jpg", "600x600bb.jpg")
        )
    except Exception:
        return ""


def cover_for(title: str, artist: str) -> str:
    # Prefer Spotify if configured
    if spotify_enabled():
        token = get_spotify_token()
        if token:
            q = f'track:"{title}" artist:"{artist}"'
            url = f"https://api.spotify.com/v1/search?type=track&limit=1&q={quote(q)}"
            try:
                r = requests.get(
                    url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
                if r.status_code == 200:
                    items = (r.json().get("tracks") or {}).get("items") or []
                    if items:
                        images = (
                            (items[0].get("album") or {}).get("images") or [])
                        if images:
                            return images[0].get("url", "") or ""
            except Exception:
                pass
    return itunes_cover(title, artist).strip()


def _try_reload_recommender() -> str:
    try:
        get_recommender().load()
        app.state.recommender_error = ""
        return ""
    except Exception as e:
        app.state.recommender_error = str(e)
        return app.state.recommender_error


# -----------------------------
# API Models
# -----------------------------
class SeedSong(BaseModel):
    title: str
    artist: Optional[str] = ""
    year: Optional[int] = None
    id: Optional[str] = None


class RecommendRequest(BaseModel):
    seeds: List[SeedSong]
    n: int = 9
    mode: str = "all"  # "all" | "indie" | "mainstream"
    # Avoid repeats across sessions / refreshes (frontend keeps a rolling list)
    already_shown_ids: Optional[List[str]] = None
    distinct_id: Optional[str] = None  # for analytics (PostHog)

class FeedbackRequest(BaseModel):
    """
    Anonymous interaction feedback used for personalization and analytics.
    Recommended events: "like", "dislike", "play", "open_spotify".
    """
    track_id: str
    event: str
    distinct_id: Optional[str] = None  # optional; otherwise derived from request headers
    context: Optional[Dict[str, Any]] = None



# -----------------------------
# Startup
# -----------------------------
@app.on_event("startup")
def _startup():
    app.state.recommender_error = ""
    try:
        wait_for_db(timeout_s=45)
        Base.metadata.create_all(engine)
        get_recommender().load()
        app.state.recommender_error = ""
    except Exception as e:
        app.state.recommender_error = str(e)


# -----------------------------
# Health + DB Status
# -----------------------------
@app.get("/api/ping")
def ping():
    err = getattr(app.state, "recommender_error", "")
    if err:
        err = _try_reload_recommender()
    return {"ok": True, "recommender_ready": not bool(err), "recommender_error": err}


@app.get("/api/db_status")
def db_status():
    try:
        wait_for_db(timeout_s=10)
        Base.metadata.create_all(engine)
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT to_regclass('public.tracks')")).scalar_one()
            if not exists:
                return {"ok": True, "tracks_exists": False, "tracks_count": 0}
            cnt = int(conn.execute(
                text("SELECT COUNT(*) FROM tracks")).scalar_one())
            return {"ok": True, "tracks_exists": True, "tracks_count": cnt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


@app.post("/api/reload")
def reload_now():
    err = _try_reload_recommender()
    return {"ok": True, "recommender_ready": not bool(err), "recommender_error": err}


# -----------------------------
# Search
# -----------------------------
def db_search(db: Session, q: str, limit: int = 8):
    q2 = f"%{q}%"
    rows = (
        db.query(Track)
        .filter(or_(Track.name.ilike(q2), Track.artists.ilike(q2)))
        .order_by(Track.popularity.desc())
        .limit(int(limit))
        .all()
    )
    return [
        {
            "title": r.name,
            "artist": r.artists,
            "year": int(r.year),
            "id": r.id,
            "imageUrl": (getattr(r, "image_url", "") or ""),
            "source": "db",
            "previewUrl": None,
            "spotifyUrl": None,
            "spotifyUri": None,
            "durationMs": None,
        }
        for r in rows
    ]


@app.get("/api/search")
def search_endpoint(
    q: str,
    limit: int = 8,
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    q = (q or "").strip()
    limit = int(limit)

    source = "db"
    results: List[Dict[str, Any]] = []

    if len(q) >= 2:
        res = spotify_search(q, limit=limit)
        if res:
            source = "spotify"
            results = res
        else:
            results = db_search(db, q, limit=limit)

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request)
            a.capture(
                background_tasks,
                distinct_id=did,
                event="search",
                properties={
                    "q_len": len(q),
                    "limit": limit,
                    "source": source,
                },
            )
    except Exception:
        pass

    return {"results": results}


# -----------------------------
# Recommend
# -----------------------------
@app.post("/api/recommend")
def recommend_endpoint(req: RecommendRequest, request: Request = None, background_tasks: BackgroundTasks = None, db: Session = Depends(get_db)):
    err = getattr(app.state, "recommender_error", "")
    if err:
        err = _try_reload_recommender()
    if err:
        raise HTTPException(status_code=500, detail=f"Recommender not ready: {err}")

    seeds: List[Dict[str, Any]] = []
    for s in req.seeds:
        seeds.append(
            {
                "title": s.title,
                "artist": s.artist or "",
                "year": _safe_year(s.year),
                "id": (s.id or "").strip() or None,
            }
        )

    try:
        did = None
        try:
            if request is not None:
                did = get_analytics().distinct_id(request, explicit=req.distinct_id)
        except Exception:
            did = req.distinct_id

        # Personalization signals from feedback (best-effort)
        liked_ids: List[str] = []
        superliked_ids: List[str] = []
        disliked_ids: List[str] = []
        if did:
            try:
                rows = (
                    db.query(Interaction)
                    .filter(Interaction.distinct_id == did)
                    .order_by(Interaction.created_at.desc())
                    .limit(200)
                    .all()
                )
                # Use latest signal per track to avoid conflicting history (e.g., liked then disliked).
                latest_by_track: Dict[str, str] = {}
                for r0 in rows:
                    tid = (r0.track_id or "").strip()
                    ev = (r0.event or "").strip().lower()
                    if not tid or ev not in {"like", "superlike", "dislike"}:
                        continue
                    if tid in latest_by_track:
                        continue
                    latest_by_track[tid] = ev

                for tid, ev in latest_by_track.items():
                    if ev == "like":
                        liked_ids.append(tid)
                    elif ev == "superlike":
                        superliked_ids.append(tid)
                    elif ev == "dislike":
                        disliked_ids.append(tid)
            except Exception:
                pass

        exclude_ids = [x for x in (req.already_shown_ids or []) if isinstance(x, str) and x.strip()]
        recs = get_recommender().recommend(
            seeds,
            n=req.n,
            mode=req.mode,
            liked_ids=liked_ids,
            superliked_ids=superliked_ids,
            disliked_ids=disliked_ids,
            exclude_ids=exclude_ids,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommender failed: {str(e)}")

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request, explicit=req.distinct_id)
            a.capture(
                background_tasks,
                distinct_id=did,
                event="recommend",
                properties={
                    "n": int(req.n),
                    "mode": (req.mode or "all"),
                    "seeds_count": len(req.seeds or []),
                    "already_shown_count": len(req.already_shown_ids or []),
                },
            )
    except Exception:
        pass

    out: List[Dict[str, Any]] = []
    musicians: Dict[str, Dict[str, Any]] = {}
    updates: List[Dict[str, str]] = []  # for bulk image_url persistence

    # If a track has an uploaded full-audio file, include an `audioUrl` the frontend can play.
    audio_ids: set[str] = set()
    try:
        candidate_ids = [str(r.get("id") or "").strip() for r in recs]
        candidate_ids = [x for x in candidate_ids if x]
        if candidate_ids:
            rows = db.query(TrackAudio.track_id).filter(TrackAudio.track_id.in_(candidate_ids)).all()
            audio_ids = set([r0[0] for r0 in rows if r0 and r0[0]])
    except Exception:
        audio_ids = set()

    for r in recs:
        title = (r.get("title") or "").strip()
        artist = (r.get("artist") or "").strip()

        raw_image = r.get("imageUrl", "")
        image_url = (raw_image if isinstance(raw_image, str) else "").strip()
        if not image_url:
            image_url = cover_for(title, artist).strip()

        preview_url = r.get("previewUrl")
        spotify_url = r.get("spotifyUrl")
        spotify_uri = r.get("spotifyUri")
        duration_ms = r.get("durationMs")

        if spotify_enabled():
            details = spotify_track_lookup(title, artist)
            if details:
                preview_url = details.get("previewUrl") or preview_url
                spotify_url = details.get("spotifyUrl") or spotify_url
                spotify_uri = details.get("spotifyUri") or spotify_uri
                duration_ms = details.get("durationMs") or duration_ms
                if not image_url:
                    dimg = details.get("imageUrl")
                    if isinstance(dimg, str) and dimg.strip():
                        image_url = dimg.strip()

        tid = (r.get("id") or "").strip()
        if image_url and tid:
            updates.append({"u": image_url, "i": tid})

        audio_url = f"/api/audio/{tid}" if tid and tid in audio_ids else None

        out.append(
            {
                **r,
                "imageUrl": image_url,
                "previewUrl": preview_url,
                "spotifyUrl": spotify_url,
                "spotifyUri": spotify_uri,
                "durationMs": duration_ms,
                "audioUrl": audio_url,
                "spotifyArtistUrl": (details.get("spotifyArtistUrl") if spotify_enabled() and details else None),
            }
        )

        artist_name = artist or "Unknown Artist"
        key = artist_name.lower().strip()
        if key not in musicians:
            musicians[key] = {
                "id": str(uuid.uuid4()),
                "name": artist_name,
                "imageUrl": image_url,
                "spotifyUrl": (details.get("spotifyArtistUrl") if spotify_enabled() and details else None),
                "topTracks": [],
                "reasons": [],
                "concertsUrl": f"https://www.songkick.com/search?query={quote(artist_name)}",
            }
        m = musicians[key]
        if title and title not in m["topTracks"] and len(m["topTracks"]) < 3:
            m["topTracks"].append(title)
        for reason in (r.get("reasons") or []):
            if isinstance(reason, str) and reason and reason not in m["reasons"] and len(m["reasons"]) < 2:
                m["reasons"].append(reason)

    # Best-effort bulk persistence (single session)
    if updates:
        try:
            db = SessionLocal()
            db.execute(
                text(
                    "UPDATE tracks SET image_url = :u "
                    "WHERE id = :i AND (image_url IS NULL OR image_url = '')"
                ),
                updates,
            )
            db.commit()
        except Exception:
            pass
        finally:
            try:
                db.close()
            except Exception:
                pass

    musician_list = list(musicians.values())[:6]
    return {"recommendations": out, "musicians": musician_list}




@app.post("/api/feedback")
def feedback_endpoint(
    req: FeedbackRequest,
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    """
    Records a user interaction. This enables:
      - "thumbs up/down" personalization
      - better re-ranking (avoid disliked tracks)
      - product analytics (PostHog)
    """
    event = (req.event or "").strip().lower()
    if event not in {"like", "superlike", "dislike", "play", "open_spotify", "click_recommendation"}:
        raise HTTPException(status_code=400, detail="Invalid event")

    track_id = (req.track_id or "").strip()
    if not track_id:
        raise HTTPException(status_code=400, detail="Missing track_id")
    if len(track_id) > 256:
        raise HTTPException(status_code=400, detail="Invalid track_id")

    distinct_id = None
    try:
        if request is not None:
            distinct_id = get_analytics().distinct_id(request, explicit=req.distinct_id)
    except Exception:
        distinct_id = (req.distinct_id or "").strip() or "anonymous"

    # persist interaction
    try:
        # Suppress immediate duplicate signals for same user/track/event.
        last = (
            db.query(Interaction)
            .filter(
                Interaction.distinct_id == distinct_id,
                Interaction.track_id == track_id,
                Interaction.event == event,
            )
            .order_by(Interaction.created_at.desc())
            .first()
        )
        should_insert = True
        if last and getattr(last, "created_at", None):
            try:
                delta = (_now_utc() - last.created_at).total_seconds()
                if delta < 5:
                    should_insert = False
            except Exception:
                pass

        if should_insert:
            db.add(Interaction(distinct_id=distinct_id, track_id=track_id, event=event))
            db.commit()
    except Exception:
        db.rollback()

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request, explicit=distinct_id)
            a.capture(background_tasks, distinct_id=did, event="feedback", properties={"event": event})
    except Exception:
        pass

    return {"ok": True}


class PreviewRequest(BaseModel):
    title: str
    artist: Optional[str] = ""
    distinct_id: Optional[str] = None  # for analytics (PostHog)


@app.post("/api/preview")
def preview_endpoint(req: PreviewRequest, request: Request = None, background_tasks: BackgroundTasks = None):
    """
    Returns previewUrl + spotifyUrl for a track, if Spotify is configured.
    """
    if not spotify_enabled():
        return {"ok": False, "error": "Spotify not configured", "previewUrl": None, "spotifyUrl": None}

    title = (req.title or "").strip()
    artist = (req.artist or "").strip()

    details = spotify_track_lookup(title, artist)
    if not details:
        # analytics (never blocks)
        try:
            if request is not None and background_tasks is not None:
                a = get_analytics()
                did = a.distinct_id(request, explicit=req.distinct_id)
                a.capture(background_tasks, distinct_id=did, event="preview_lookup", properties={"has_match": False})
        except Exception:
            pass
        return {"ok": False, "error": "No Spotify match", "previewUrl": None, "spotifyUrl": None}

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request, explicit=req.distinct_id)
            a.capture(background_tasks, distinct_id=did, event="preview_lookup", properties={"has_match": True})
    except Exception:
        pass

    return {
        "ok": True,
        "previewUrl": details.get("previewUrl"),
        "spotifyUrl": details.get("spotifyUrl"),
        "spotifyUri": details.get("spotifyUri"),
        "durationMs": details.get("durationMs"),
        "imageUrl": details.get("imageUrl"),
    }


@app.get("/api/track")
def track_detail(
    track_id: str = "",
    title: str = "",
    artist: str = "",
    db: Session = Depends(get_db),
):
    tid = (track_id or "").strip()
    t = (title or "").strip()
    a = (artist or "").strip()

    row = None
    if tid:
        try:
            row = db.query(Track).filter(Track.id == tid).first()
        except Exception:
            row = None

    if row:
        t = (row.name or "").strip() or t
        a = (row.artists or "").strip() or a
    if not t:
        raise HTTPException(status_code=404, detail="Track not found")

    details = spotify_track_lookup(t, a) if spotify_enabled() else None
    image_url = ""
    if row and isinstance(getattr(row, "image_url", None), str):
        image_url = (row.image_url or "").strip()
    if not image_url and details:
        dimg = details.get("imageUrl")
        if isinstance(dimg, str):
            image_url = dimg.strip()
    if not image_url:
        image_url = cover_for(t, a).strip()

    audio_url = None
    if tid:
        try:
            has_audio = db.query(TrackAudio.track_id).filter(TrackAudio.track_id == tid).first()
            if has_audio:
                audio_url = f"/api/audio/{quote(tid)}"
        except Exception:
            audio_url = None

    return {
        "id": tid or (details.get("spotifyId") if details else None),
        "title": t,
        "artist": a,
        "imageUrl": image_url,
        "audioUrl": audio_url,
        "previewUrl": (details.get("previewUrl") if details else None),
        "spotifyUrl": (details.get("spotifyUrl") if details else None),
        "spotifyUri": (details.get("spotifyUri") if details else None),
        "durationMs": (details.get("durationMs") if details else None),
        "source": "db" if row else ("spotify" if details else "unknown"),
    }


@app.get("/api/open_spotify")
def open_spotify(title: str, artist: str = "", request: Request = None, background_tasks: BackgroundTasks = None):
    """
    Demo endpoint: redirects user to Spotify track page if found.
    """
    if not spotify_enabled():
        raise HTTPException(status_code=400, detail="Spotify not configured")

    title = (title or "").strip()
    artist = (artist or "").strip()

    details = spotify_track_lookup(title, artist)

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request)
            a.capture(background_tasks, distinct_id=did, event="open_spotify", properties={"has_match": bool(details)})
    except Exception:
        pass

    if not details or not details.get("spotifyUrl"):
        raise HTTPException(status_code=404, detail="No Spotify link found")

    # best-effort persistence (never blocks)
    db = None
    try:
        if request is not None:
            did = get_analytics().distinct_id(request)
            db = SessionLocal()
            db.add(
                Interaction(
                    distinct_id=did,
                    track_id=str(details.get("spotifyId") or ""),
                    event="open_spotify",
                )
            )
            db.commit()
    except Exception:
        try:
            if db is not None:
                db.rollback()
        except Exception:
            pass
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass

    return RedirectResponse(url=details["spotifyUrl"], status_code=302)


# -----------------------------
# Full-song uploads + streaming
# -----------------------------


@app.post("/api/audio/upload")
async def upload_catalog_track_audio(
    request: Request,
    track_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Attach a full-audio file to an existing `tracks` row (seeded catalog).

    Frontend can then play `/api/audio/<track_id>` instead of Spotify previews.
    """
    if not _check_upload_secret(request):
        raise HTTPException(status_code=403, detail="Upload secret required")
    _require_uploader_identity(request)

    tid = (track_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="track_id is required")

    # Ensure the track exists in the dataset catalog
    try:
        t = db.query(Track).filter(Track.id == tid).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not t:
        raise HTTPException(status_code=404, detail="Unknown track_id")

    mime_type, ext = _guess_mime_and_ext(file.filename, file.content_type)
    dest = MEDIA_TRACKS_DIR / f"{tid}{ext}"

    # write file with a size limit
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    with open(dest, "wb") as out_f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                try:
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(status_code=413, detail=f"File too large (>{MAX_UPLOAD_MB}MB)")
            out_f.write(chunk)

    try:
        row = db.query(TrackAudio).filter(TrackAudio.track_id == tid).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if row:
        row.file_path = str(dest)
        row.mime_type = mime_type
        row.size_bytes = int(size)
    else:
        db.add(
            TrackAudio(
                track_id=tid,
                file_path=str(dest),
                mime_type=mime_type,
                size_bytes=int(size),
            )
        )
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not save upload metadata. Please try again.")

    return {"ok": True, "audioUrl": f"/api/audio/{quote(tid)}"}


@app.get("/api/audio/{track_id}")
def stream_catalog_track_audio(track_id: str, request: Request, db: Session = Depends(get_db)):
    """Stream a catalog track's full audio (if uploaded)."""
    tid = (track_id or "").strip()
    row = db.query(TrackAudio).filter(TrackAudio.track_id == tid).first()
    if not row:
        raise HTTPException(status_code=404, detail="No full audio uploaded for this track")

    path = Path(row.file_path)
    return _stream_file(path, row.mime_type or "audio/mpeg", request)


@app.post("/api/uploads")
async def upload_new_track(
    request: Request,
    title: str = Form(...),
    artist: str = Form(""),
    image_url: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a brand-new track to Offtrack's streaming library."""
    if not _check_upload_secret(request):
        raise HTTPException(status_code=403, detail="Upload secret required")
    _require_uploader_identity(request)

    title = (title or "").strip()
    artist = (artist or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    tid = str(uuid.uuid4())
    mime_type, ext = _guess_mime_and_ext(file.filename, file.content_type)
    dest = MEDIA_UPLOADS_DIR / f"{tid}{ext}"

    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    with open(dest, "wb") as out_f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                try:
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(status_code=413, detail=f"File too large (>{MAX_UPLOAD_MB}MB)")
            out_f.write(chunk)

    row = UploadedTrack(
        id=tid,
        title=title,
        artist=artist,
        image_url=(image_url or "").strip() or None,
        file_path=str(dest),
        mime_type=mime_type,
        size_bytes=int(size),
    )
    db.add(row)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not save upload metadata. Please try again.")

    return {
        "id": tid,
        "title": title,
        "artist": artist,
        "imageUrl": row.image_url,
        "audioUrl": f"/api/uploads/{tid}/stream",
        "mimeType": mime_type,
        "sizeBytes": int(size),
    }


@app.get("/api/uploads")
def list_uploads(limit: int = 50, db: Session = Depends(get_db)):
    limit = max(1, min(int(limit or 50), 200))
    rows = db.query(UploadedTrack).order_by(UploadedTrack.created_at.desc()).limit(limit).all()
    return {
        "tracks": [
            {
                "id": r.id,
                "title": r.title,
                "artist": r.artist,
                "imageUrl": r.image_url,
                "audioUrl": f"/api/uploads/{r.id}/stream",
                "mimeType": r.mime_type,
                "sizeBytes": r.size_bytes,
                "createdAt": getattr(r, "created_at", None),
            }
            for r in rows
        ]
    }


@app.get("/api/uploads/{upload_id}/stream")
def stream_uploaded_track(upload_id: str, request: Request, db: Session = Depends(get_db)):
    uid = (upload_id or "").strip()
    row = db.query(UploadedTrack).filter(UploadedTrack.id == uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Unknown upload id")
    return _stream_file(Path(row.file_path), row.mime_type or "audio/mpeg", request)


# -----------------------------
# Lyric AI reels
# -----------------------------
from PIL import Image, ImageDraw, ImageFont
import imageio.v2 as imageio
from io import BytesIO

LYRIC_AI_PROVIDER = (os.getenv("LYRIC_AI_PROVIDER", "openai").strip().lower() or "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_IMAGE_MODEL = (os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1").strip() or "gpt-image-1")
OPENAI_IMAGE_SIZE = (os.getenv("OPENAI_IMAGE_SIZE", "1024x1536").strip() or "1024x1536")
OPENAI_IMAGE_QUALITY = (os.getenv("OPENAI_IMAGE_QUALITY", "medium").strip() or "medium")
LYRIC_AI_ALLOW_LOCAL_FALLBACK = os.getenv("LYRIC_AI_ALLOW_LOCAL_FALLBACK", "false").strip().lower() in ("1", "true", "yes")


def _wrap_lines(text: str, max_chars: int) -> List[str]:
    words = [w for w in (text or "").split() if w]
    lines: List[str] = []
    cur: List[str] = []
    cur_len = 0
    for w in words:
        add = len(w) + (1 if cur else 0)
        if cur_len + add > max_chars and cur:
            lines.append(" ".join(cur))
            cur = [w]
            cur_len = len(w)
        else:
            cur.append(w)
            cur_len += add
    if cur:
        lines.append(" ".join(cur))
    return lines or [""]


def _render_caption_frame(w: int, h: int, title: str, subtitle: str) -> Image.Image:
    img = Image.new("RGB", (w, h), (15, 15, 15))
    draw = ImageDraw.Draw(img)

    # Use default fonts (portable). If you later bundle fonts, load TTF here.
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()

    # simple centered layout
    pad = 60
    y = int(h * 0.25)

    def draw_centered(text: str, y_pos: int, fill=(255, 255, 255)):
        bbox = draw.textbbox((0, 0), text, font=font_title)
        tw = bbox[2] - bbox[0]
        draw.text(((w - tw) // 2, y_pos), text, font=font_title, fill=fill)

    # Title lines
    for line in _wrap_lines(title, max_chars=26)[:6]:
        draw_centered(line, y)
        y += 26

    y += 18
    for line in _wrap_lines(subtitle, max_chars=34)[:6]:
        bbox = draw.textbbox((0, 0), line, font=font_sub)
        tw = bbox[2] - bbox[0]
        draw.text(((w - tw) // 2, y), line, font=font_sub, fill=(220, 220, 220))
        y += 22

    # bottom watermark
    wm = "Offtrack · Lyric AI"
    bbox = draw.textbbox((0, 0), wm, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, h - pad), wm, font=font_sub, fill=(160, 160, 160))
    return img


def _lyrics_chunks(lyrics: str) -> List[str]:
    chunks: List[str] = []
    for para in [p.strip() for p in lyrics.split("\n") if p.strip()]:
        if len(para) <= 140:
            chunks.append(para)
            continue
        words = para.split()
        buf: List[str] = []
        for w in words:
            buf.append(w)
            if len(" ".join(buf)) >= 120:
                chunks.append(" ".join(buf))
                buf = []
        if buf:
            chunks.append(" ".join(buf))
    return chunks


def _safe_slug(v: str, fallback: str = "lyric") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (v or "").lower()).strip("-")
    return s[:48] or fallback


def _build_visual_prompts(lyrics: str, title: str, artist: str, image_count: int) -> List[str]:
    head = f"Song: {title or 'Untitled'}"
    if artist:
        head += f" by {artist}"
    base_style = (
        "Cinematic vertical frame for a short social reel, high detail, dramatic lighting, "
        "rich color grading, no text, no logos, no watermarks."
    )
    chunks = _lyrics_chunks(lyrics)[: max(1, min(image_count, 8))]
    if not chunks:
        chunks = [lyrics[:140]]
    out: List[str] = []
    for chunk in chunks:
        out.append(
            f"{base_style} {head}. Visualize this lyric moment: {chunk}"
        )
    return out


def _openai_generate_images(prompts: List[str]) -> List[Image.Image]:
    if not OPENAI_API_KEY:
        return []
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    images: List[Image.Image] = []
    for prompt in prompts:
        payload: Dict[str, Any] = {
            "model": OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "size": OPENAI_IMAGE_SIZE,
            "quality": OPENAI_IMAGE_QUALITY,
        }
        resp = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers=headers,
            json=payload,
            timeout=120,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"image generation failed: {resp.text[:200]}")
        body = resp.json()
        data = body.get("data") or []
        b64 = ((data[0] if data else {}) or {}).get("b64_json")
        if not b64:
            continue
        raw = base64.b64decode(b64)
        img = Image.open(BytesIO(raw)).convert("RGB")
        images.append(img)
    return images


def _image_to_data_url(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _ensure_lyric_reels_table() -> None:
    try:
        LyricReel.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        pass


def _render_reel_from_images(
    images: List[Image.Image],
    title: str,
    chunks: List[str],
    out_path: Path,
    w: int = 720,
    h: int = 1280,
    fps: int = 24,
) -> None:
    writer = imageio.get_writer(str(out_path), fps=fps)
    try:
        for idx, img in enumerate(images):
            canvas = img.resize((w, h))
            caption = chunks[idx % len(chunks)] if chunks else ""
            frame = _render_caption_frame(w, h, title, caption)
            blended = Image.blend(canvas, frame, alpha=0.32)
            import numpy as _np
            arr = _np.array(blended)
            for _ in range(int(fps * 1.35)):
                writer.append_data(arr)
    finally:
        try:
            writer.close()
        except Exception:
            pass


def _is_invalid_video(path: Path) -> bool:
    try:
        if not path.exists():
            return True
        # Empty or nearly-empty files are typically unplayable and show as 0:00
        return path.stat().st_size < 2048
    except Exception:
        return True


class ReelCreateIn(BaseModel):
    lyrics: str = Field(min_length=1, max_length=8000)
    title: str | None = None
    artist: str | None = None
    output: str = Field(default="video", pattern="^(video|images)$")
    image_count: int = Field(default=4, ge=1, le=8)


@app.post("/api/reels")
def create_reel(req: ReelCreateIn, db: Session = Depends(get_db)):
    """Generate images or a short vertical reel from lyrics."""
    _ensure_lyric_reels_table()
    lyrics = (req.lyrics or "").strip()
    if not lyrics:
        raise HTTPException(status_code=400, detail="lyrics required")

    header = (req.title or "Lyric Reel").strip()
    artist = (req.artist or "").strip()
    chunks = _lyrics_chunks(lyrics)
    if not chunks:
        chunks = [lyrics[:140]]

    prompts = _build_visual_prompts(lyrics, header, artist, req.image_count)
    generated_images: List[Image.Image] = []
    provider = "local"
    generation_error = ""

    if LYRIC_AI_PROVIDER in {"openai", "openai_images"}:
        if not OPENAI_API_KEY:
            generation_error = "OPENAI_API_KEY is not configured on backend."
        else:
            try:
                generated_images = _openai_generate_images(prompts)
                provider = "openai"
            except Exception as e:
                generation_error = str(e)
    else:
        generation_error = f"Unsupported LYRIC_AI_PROVIDER='{LYRIC_AI_PROVIDER}'"

    if not generated_images:
        if not LYRIC_AI_ALLOW_LOCAL_FALLBACK:
            msg = generation_error or "No images generated from provider."
            raise HTTPException(
                status_code=502,
                detail=f"Lyric AI provider failed: {msg}. Set OPENAI_API_KEY on backend or enable LYRIC_AI_ALLOW_LOCAL_FALLBACK=true.",
            )
        for chunk in chunks[: req.image_count]:
            generated_images.append(_render_caption_frame(1024, 1536, header, chunk))
        provider = "local"

    if req.output == "images":
        data_urls = [_image_to_data_url(img) for img in generated_images[: req.image_count]]
        return {
            "id": str(uuid.uuid4()),
            "mode": "images",
            "provider": provider,
            "imageDataUrls": data_urls,
        }

    rid = str(uuid.uuid4())
    out_path = MEDIA_REELS_DIR / f"{rid}.mp4"
    try:
        _render_reel_from_images(generated_images[: req.image_count], header, chunks, out_path)
    except Exception:
        if not LYRIC_AI_ALLOW_LOCAL_FALLBACK:
            raise HTTPException(status_code=502, detail="Video encoding failed. Check ffmpeg/imageio backend setup.")
        data_urls = [_image_to_data_url(img) for img in generated_images[: req.image_count]]
        return {
            "id": str(uuid.uuid4()),
            "mode": "images",
            "provider": provider,
            "imageDataUrls": data_urls,
            "detail": "Video encoder unavailable; returned images instead.",
        }

    if _is_invalid_video(out_path):
        if not LYRIC_AI_ALLOW_LOCAL_FALLBACK:
            raise HTTPException(status_code=502, detail="Generated video is invalid/empty (0s). Check ffmpeg/imageio backend setup.")
        data_urls = [_image_to_data_url(img) for img in generated_images[: req.image_count]]
        return {
            "id": str(uuid.uuid4()),
            "mode": "images",
            "provider": provider,
            "imageDataUrls": data_urls,
            "detail": "Generated video was invalid (0s); returned images instead.",
        }
    size = out_path.stat().st_size if out_path.exists() else 0

    row = LyricReel(
        id=rid,
        prompt=lyrics,
        file_path=str(out_path),
        mime_type="video/mp4",
        size_bytes=int(size),
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "id": rid,
        "mode": "video",
        "provider": provider,
        "downloadUrl": f"/api/reels/{rid}/download",
        "sizeBytes": int(size),
    }


@app.get("/api/reels")
def list_reels(limit: int = 20, db: Session = Depends(get_db)):
    _ensure_lyric_reels_table()
    limit = max(1, min(int(limit or 20), 100))
    try:
        rows = db.query(LyricReel).order_by(LyricReel.created_at.desc()).limit(limit).all()
    except Exception:
        return {"reels": []}
    return {
        "reels": [
            {
                "id": r.id,
                "downloadUrl": f"/api/reels/{r.id}/download",
                "sizeBytes": r.size_bytes,
                "createdAt": getattr(r, "created_at", None),
            }
            for r in rows
        ]
    }


@app.get("/api/reels/{reel_id}/download")
def download_reel(reel_id: str, request: Request, db: Session = Depends(get_db)):
    _ensure_lyric_reels_table()
    rid = (reel_id or "").strip()
    try:
        row = db.query(LyricReel).filter(LyricReel.id == rid).first()
    except Exception:
        row = None
    if not row:
        raise HTTPException(status_code=404, detail="Unknown reel id")
    path = Path(row.file_path)
    # Stream with range so browser video player can seek
    return _stream_file(path, row.mime_type or "video/mp4", request)
