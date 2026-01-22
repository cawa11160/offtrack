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
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from db import get_db, SessionLocal, engine, wait_for_db
from models import Track, Base
from recommender import get_recommender

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
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
def search_endpoint(q: str, limit: int = 8, db: Session = Depends(get_db)):
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}

    res = spotify_search(q, limit=limit)
    if res:
        return {"results": res}

    return {"results": db_search(db, q, limit=limit)}


# -----------------------------
# Recommend
# -----------------------------
@app.post("/api/recommend")
def recommend_endpoint(req: RecommendRequest):
    err = getattr(app.state, "recommender_error", "")
    if err:
        err = _try_reload_recommender()
    if err:
        raise HTTPException(
            status_code=500, detail=f"Recommender not ready: {err}")

    seeds = []
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
        recs = get_recommender().recommend(seeds, n=req.n, mode=req.mode)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Recommender failed: {str(e)}")

    out = []
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

        # ✅ safe DB update (no leaking generator sessions)
        tid = (r.get("id") or "").strip()
        if image_url and tid:
            try:
                db = SessionLocal()
                db.execute(
                    text(
                        "UPDATE tracks SET image_url = :u "
                        "WHERE id = :i AND (image_url IS NULL OR image_url = '')"
                    ),
                    {"u": image_url, "i": tid},
                )
                db.commit()
            except Exception:
                pass
            finally:
                try:
                    db.close()
                except Exception:
                    pass

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

    return {"recommendations": out}


class PreviewRequest(BaseModel):
    title: str
    artist: Optional[str] = ""


@app.post("/api/preview")
def preview_endpoint(req: PreviewRequest):
    """
    Returns previewUrl + spotifyUrl for a track, if Spotify is configured.
    """
    if not spotify_enabled():
        return {"ok": False, "error": "Spotify not configured", "previewUrl": None, "spotifyUrl": None}

    title = (req.title or "").strip()
    artist = (req.artist or "").strip()

    details = spotify_track_lookup(title, artist)
    if not details:
        return {"ok": False, "error": "No Spotify match", "previewUrl": None, "spotifyUrl": None}

    return {
        "ok": True,
        "previewUrl": details.get("previewUrl"),
        "spotifyUrl": details.get("spotifyUrl"),
        "spotifyUri": details.get("spotifyUri"),
        "durationMs": details.get("durationMs"),
        "imageUrl": details.get("imageUrl"),
    }


@app.get("/api/open_spotify")
def open_spotify(title: str, artist: str = ""):
    """
    Demo endpoint: redirects user to Spotify track page if found.
    """
    if not spotify_enabled():
        raise HTTPException(status_code=400, detail="Spotify not configured")

    title = (title or "").strip()
    artist = (artist or "").strip()

    details = spotify_track_lookup(title, artist)
    if not details or not details.get("spotifyUrl"):
        raise HTTPException(status_code=404, detail="No Spotify link found")

    return RedirectResponse(url=details["spotifyUrl"], status_code=302)
