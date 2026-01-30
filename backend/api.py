from __future__ import annotations

import base64
import os
import time
from typing import List, Optional, Dict, Any
from urllib.parse import quote
from functools import lru_cache
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from db import get_db, SessionLocal, engine, wait_for_db
from models import Track, Interaction, User, Base
from recommender import get_recommender
from analytics import get_analytics

from fastapi.responses import RedirectResponse

load_dotenv()

app = FastAPI(title="Offtrack API")

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

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
    exists = db.query(User).filter(User.email == email).first()
    if exists:
        raise HTTPException(status_code=409, detail="Email already exists")

    user = User(email=email, name=(payload.name.strip() if payload.name else None), password_hash=_hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    access = _create_access_token(user.id)
    refresh = _create_refresh_token(user.id)
    _set_refresh_cookie(resp, refresh)
    return {"access_token": access}

@app.post("/api/auth/login", response_model=AuthOut)
def auth_login(payload: LoginIn, resp: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
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
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": user.id, "email": user.email, "name": user.name}


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
    return {
        "previewUrl": track_obj.get("preview_url"),
        "spotifyUrl": (track_obj.get("external_urls") or {}).get("spotify"),
        "spotifyUri": track_obj.get("uri"),
        "durationMs": track_obj.get("duration_ms"),
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
                for r0 in rows:
                    if r0.event == "like":
                        liked_ids.append(r0.track_id)
                    elif r0.event == "dislike":
                        disliked_ids.append(r0.track_id)
            except Exception:
                pass

        exclude_ids = [x for x in (req.already_shown_ids or []) if isinstance(x, str) and x.strip()]
        recs = get_recommender().recommend(
            seeds,
            n=req.n,
            mode=req.mode,
            liked_ids=liked_ids,
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
    updates: List[Dict[str, str]] = []  # for bulk image_url persistence

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

        out.append(
            {
                **r,
                "imageUrl": image_url,
                "previewUrl": preview_url,
                "spotifyUrl": spotify_url,
                "spotifyUri": spotify_uri,
                "durationMs": duration_ms,
            }
        )

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

    return {"recommendations": out}




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
    if event not in {"like", "dislike", "play", "open_spotify", "click_recommendation"}:
        raise HTTPException(status_code=400, detail="Invalid event")

    track_id = (req.track_id or "").strip()
    if not track_id:
        raise HTTPException(status_code=400, detail="Missing track_id")

    distinct_id = None
    try:
        if request is not None:
            distinct_id = get_analytics().distinct_id(request, explicit=req.distinct_id)
    except Exception:
        distinct_id = (req.distinct_id or "").strip() or "anonymous"

    # persist interaction
    try:
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
