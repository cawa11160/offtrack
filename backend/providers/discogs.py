from __future__ import annotations

import os
from typing import Any, Dict, List

import requests

from .base import ProviderTrack, clean_text


class DiscogsClient:
    base_url = "https://api.discogs.com"

    def __init__(self, token: str | None = None, timeout: int = 15):
        self.token = token or os.getenv("DISCOGS_TOKEN", "").strip()
        self.timeout = timeout
        contact = os.getenv("OFFTRACK_CONTACT_URL", "https://offtrack.local").strip()
        self.user_agent = os.getenv("DISCOGS_USER_AGENT", f"Offtrack/0.1 +{contact}").strip()

    def enabled(self) -> bool:
        # Public search works without a token, but an identifiable User-Agent is required.
        return bool(self.user_agent)

    def _headers(self) -> Dict[str, str]:
        headers = {"User-Agent": self.user_agent}
        if self.token:
            headers["Authorization"] = f"Discogs token={self.token}"
        return headers

    def search_releases(self, query: str, limit: int = 5) -> List[ProviderTrack]:
        q = clean_text(query, 300)
        if not q:
            return []
        response = requests.get(
            f"{self.base_url}/database/search",
            headers=self._headers(),
            params={"q": q, "type": "release", "per_page": max(1, min(int(limit or 5), 25)), "page": 1},
            timeout=self.timeout,
        )
        if response.status_code in {429, 503}:
            return []
        response.raise_for_status()
        rows = (response.json() or {}).get("results") or []
        return [self._parse_release(row) for row in rows if row]

    def lookup_track(self, title: str, artist: str = "") -> ProviderTrack | None:
        q = " ".join(part for part in [clean_text(title, 300), clean_text(artist, 300)] if part)
        rows = self.search_releases(q, limit=1)
        return rows[0] if rows else None

    def _parse_release(self, row: Dict[str, Any]) -> ProviderTrack:
        title = clean_text(row.get("title"), 500)
        artist = ""
        track_title = title
        if " - " in title:
            artist, track_title = [part.strip() for part in title.split(" - ", 1)]
        release_id = clean_text(row.get("id"), 255)
        images = row.get("cover_image") or row.get("thumb")
        return ProviderTrack(
            title=track_title,
            artist=artist,
            provider="discogs",
            provider_track_id=release_id or None,
            provider_album_id=release_id or None,
            provider_url=(f"https://www.discogs.com/release/{release_id}" if release_id else None),
            image_url=clean_text(images, 1000) or None,
            album_title=track_title,
            release_date=clean_text(row.get("year"), 32) or None,
            payload=row,
        )
