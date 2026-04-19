from __future__ import annotations

import os
from typing import Any, Dict, List

import requests

from .base import ProviderTrack, clean_text


class LastFmClient:
    base_url = "https://ws.audioscrobbler.com/2.0/"

    def __init__(self, api_key: str | None = None, timeout: int = 15):
        self.api_key = api_key or os.getenv("LASTFM_API_KEY", "").strip()
        self.timeout = timeout
        self.user_agent = os.getenv("LASTFM_USER_AGENT", "Offtrack/0.1").strip()

    def enabled(self) -> bool:
        return bool(self.api_key)

    def _get(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.enabled():
            return {}
        response = requests.get(
            self.base_url,
            headers={"User-Agent": self.user_agent},
            params={**params, "method": method, "api_key": self.api_key, "format": "json"},
            timeout=self.timeout,
        )
        if response.status_code in {429, 503}:
            return {}
        response.raise_for_status()
        return response.json() or {}

    def top_tracks(self, limit: int = 25) -> List[ProviderTrack]:
        data = self._get("chart.gettoptracks", {"limit": max(1, min(int(limit or 25), 100))})
        tracks = ((data.get("tracks") or {}).get("track") or [])
        return [self._parse_track(row) for row in tracks if row]

    def search_tracks(self, query: str, limit: int = 10) -> List[ProviderTrack]:
        q = clean_text(query, 300)
        if not q:
            return []
        data = self._get("track.search", {"track": q, "limit": max(1, min(int(limit or 10), 50))})
        tracks = (((data.get("results") or {}).get("trackmatches") or {}).get("track") or [])
        return [self._parse_track(row) for row in tracks if row]

    def top_tags(self, title: str, artist: str = "", limit: int = 8) -> List[str]:
        title = clean_text(title, 300)
        artist = clean_text(artist, 300)
        if not title:
            return []
        data = self._get("track.gettoptags", {"track": title, "artist": artist, "autocorrect": 1})
        tags = ((data.get("toptags") or {}).get("tag") or [])
        out: List[str] = []
        for row in tags:
            if not isinstance(row, dict):
                continue
            name = clean_text(row.get("name"), 128)
            if name and name.lower() not in {"seen live"} and name not in out:
                out.append(name)
            if len(out) >= limit:
                break
        return out

    def _parse_track(self, row: Dict[str, Any]) -> ProviderTrack:
        artist_obj = row.get("artist") if isinstance(row.get("artist"), dict) else {}
        artist = clean_text((artist_obj or {}).get("name") or row.get("artist"), 255)
        title = clean_text(row.get("name"), 500)
        listeners = row.get("listeners")
        popularity = None
        try:
            popularity = min(100, max(0, int(int(listeners) / 10000))) if listeners is not None else None
        except Exception:
            popularity = None
        return ProviderTrack(
            title=title,
            artist=artist,
            provider="lastfm",
            provider_track_id=clean_text(row.get("mbid"), 255) or None,
            provider_artist_id=clean_text((artist_obj or {}).get("mbid"), 255) or None,
            provider_url=clean_text(row.get("url"), 1000) or None,
            popularity=popularity,
            payload=row,
        )
