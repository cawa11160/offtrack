# backend/api.py
from __future__ import annotations

import base64
import os
import time
from typing import List, Optional
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db import get_db
from models import Track
from recommender import get_recommender

load_dotenv()

app = FastAPI(title="Offtrack API")

# -----------------------------
# CORS (dev-safe)
# -----------------------------
ALLOW_ORIGINS = os.getenv(
    "ALLOW_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
ALLOW_ORIGINS = [o.strip() for o in ALLOW_ORIGINS if o.strip()]

app.add_middleware(
    CORSMiddleware,
    # allow_origins=ALLOW_ORIGINS,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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


def get_spotify_token() -> str:
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return ""

    now = int(time.time())
    if _token["value"] and now < _token["expires_at"] - 30:
        return _token["value"]

    auth = base64.b64encode(
        f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()
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


def spotify_search(q: str, limit: int = 8):
    token = get_spotify_token()
    if not token:
        return []

    url = f"https://api.spotify.com/v1/search?type=track&limit={int(limit)}&q={quote(q)}"
    try:
        r = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except requests.RequestException:
        return []
    if r.status_code != 200:
        return []

    items = (r.json().get("tracks") or {}).get("items") or []
    out = []
    for it in items:
        title = it.get("name", "")
        artists = it.get("artists") or []
        artist = artists[0].get("name", "") if artists else ""
        tid = it.get("id", "")

        album = it.get("album") or {}
        release_date = (album.get("release_date") or "")
        year = _safe_year(int(release_date[:4])) if isinstance(
            release_date, str) and release_date[:4].isdigit() else None

        images = (album.get("images") or [])
        image_url = ""
        if len(images) >= 2:
            image_url = images[1].get("url", "") or images[0].get("url", "")
        elif len(images) == 1:
            image_url = images[0].get("url", "")

        out.append({
            "title": title,
            "artist": artist,
            "year": year,
            "id": tid,  # Spotify id (not DB id)
            "imageUrl": image_url,
            "source": "spotify",
        })
    return out


def spotify_cover(title: str, artist: str) -> str:
    token = get_spotify_token()
    if not token:
        return ""
    q = f'track:"{title}" artist:"{artist}"'
    url = f"https://api.spotify.com/v1/search?type=track&limit=1&q={quote(q)}"
    try:
        r = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except requests.RequestException:
        return ""
    if r.status_code != 200:
        return ""
    items = (r.json().get("tracks") or {}).get("items") or []
    if not items:
        return ""
    images = ((items[0].get("album") or {}).get("images") or [])
    if len(images) >= 2:
        return images[1].get("url", "") or images[0].get("url", "")
    if len(images) == 1:
        return images[0].get("url", "")
    return ""

# -----------------------------
# API Models
# -----------------------------


class SeedSong(BaseModel):
    title: str
    artist: Optional[str] = ""
    year: Optional[int] = None
    id: Optional[str] = None  # DB track id preferred (if you have it)


class RecommendRequest(BaseModel):
    seeds: List[SeedSong]
    n: int = 9
    mode: str = "all"   # "all" | "indie" | "mainstream"

# -----------------------------
# Startup: load recommender from DB
# -----------------------------


@app.on_event("startup")
def _startup():
    # Preload so first request is fast; raise a readable error if DB isn't seeded
    try:
        get_recommender().load()
    except Exception as e:
        # Don't crash the server; /api/ping will still work and show error.
        app.state.recommender_error = str(e)


@app.get("/api/ping")
def ping():
    err = getattr(app.state, "recommender_error", "")
    return {"ok": True, "recommender_ready": not bool(err), "recommender_error": err}

# -----------------------------
# Search: Spotify if configured, else Postgres
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
            "id": r.id,          # DB id
            "imageUrl": "",      # we can fill via spotify on the client if desired
            "source": "db",
        }
        for r in rows
    ]


@app.get("/api/search")
def search_endpoint(q: str, limit: int = 8, db: Session = Depends(get_db)):
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}

    # Prefer Spotify results if available
    res = spotify_search(q, limit=limit)
    if res:
        return {"results": res}

    return {"results": db_search(db, q, limit=limit)}

# -----------------------------
# Recommend: DB is source of truth
# -----------------------------


@app.post("/api/recommend")
def recommend_endpoint(req: RecommendRequest):
    err = getattr(app.state, "recommender_error", "")
    if err:
        raise HTTPException(
            status_code=500, detail=f"Recommender not ready: {err}")

    seeds = []
    for s in req.seeds:
        seeds.append({
            "title": s.title,
            "artist": s.artist or "",
            "year": _safe_year(s.year),
            "id": (s.id or "").strip() or None,
        })

    try:
        recs = get_recommender().recommend(seeds, n=req.n, mode=req.mode)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Recommender failed: {str(e)}")

    out = []
    for r in recs:
        title = r.get("title", "")
        artist = r.get("artist", "")
        image_url = r.get("imageUrl", "") or spotify_cover(title, artist)
        out.append({**r, "imageUrl": image_url})

    return {"recommendations": out}
