# backend/api.py
from recommender import recommend
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
import requests
from typing import List, Optional
from urllib.parse import quote
import base64
import time
import os
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/ping")
def ping():
    return {"ok": True}


SPOTIFY_CLIENT_ID = os.environ.get("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
_token = {"value": None, "expires_at": 0}


def _safe_year(y):
    try:
        yi = int(float(y))
        if 1900 <= yi <= 2035:
            return yi
    except Exception:
        pass
    return None


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
    r.raise_for_status()
    data = r.json()
    _token["value"] = data["access_token"]
    _token["expires_at"] = now + int(data.get("expires_in", 3600))
    return _token["value"]


def spotify_search(q: str, limit: int = 8):
    token = get_spotify_token()
    if not token:
        return []

    url = f"https://api.spotify.com/v1/search?type=track&limit={int(limit)}&q={quote(q)}"
    r = requests.get(
        url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
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
        year = _safe_year(release_date[:4]) if isinstance(
            release_date, str) else None

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
            "id": tid,
            "imageUrl": image_url,
        })
    return out


def spotify_cover(title: str, artist: str) -> str:
    token = get_spotify_token()
    if not token:
        return ""
    q = f'track:"{title}" artist:"{artist}"'
    url = f"https://api.spotify.com/v1/search?type=track&limit=1&q={quote(q)}"
    r = requests.get(
        url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
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


class SeedSong(BaseModel):
    title: str
    artist: Optional[str] = ""
    year: Optional[int] = None


class RecommendRequest(BaseModel):
    seeds: List[SeedSong]
    n: int = 9          # UI wants 9 outputs
    mode: str = "all"   # "all" | "indie" | "mainstream"


@app.get("/search")
def search_endpoint(q: str, limit: int = 8):
    q = (q or "").strip()
    if len(q) < 2:
        return {"results": []}
    return {"results": spotify_search(q, limit=limit)}


@app.post("/recommend")
def recommend_endpoint(req: RecommendRequest):
    if len(req.seeds) != 3:
        raise HTTPException(
            status_code=400, detail="Please provide exactly 3 seed songs.")

    # sanitize years (avoid 1027 etc)
    seeds = []
    for s in req.seeds:
        y = _safe_year(s.year) if s.year is not None else None
        seeds.append({"title": s.title, "artist": s.artist or "", "year": y})

    try:
        recs = recommend(seeds, n=req.n, mode=req.mode)
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
