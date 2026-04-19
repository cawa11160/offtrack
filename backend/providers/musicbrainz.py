from __future__ import annotations

import os
import time
from typing import Any, Dict, List

import requests

from .base import ProviderTrack, clean_text


class MusicBrainzClient:
    """Small, rate-limited MusicBrainz client for catalog metadata.

    MusicBrainz asks API clients to identify themselves and keep calls to one
    request per second, so this client centralizes both behaviors.
    """

    base_url = "https://musicbrainz.org/ws/2"

    def __init__(self, user_agent: str | None = None, timeout: int = 15):
        contact = os.getenv("OFFTRACK_CONTACT_URL", "https://offtrack.local").strip()
        self.user_agent = (
            user_agent
            or os.getenv("MUSICBRAINZ_USER_AGENT", "").strip()
            or f"Offtrack/0.1 ({contact})"
        )
        self.timeout = timeout
        self._last_request_at = 0.0

    def enabled(self) -> bool:
        return bool(self.user_agent)

    def _get(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        elapsed = time.time() - self._last_request_at
        if elapsed < 1.1:
            time.sleep(1.1 - elapsed)
        self._last_request_at = time.time()

        response = requests.get(
            f"{self.base_url}{path}",
            headers={"User-Agent": self.user_agent, "Accept": "application/json"},
            params={**params, "fmt": "json"},
            timeout=self.timeout,
        )
        if response.status_code in {503, 429}:
            return {}
        response.raise_for_status()
        return response.json() or {}

    def search_recordings(self, query: str, limit: int = 10) -> List[ProviderTrack]:
        q = clean_text(query, 300)
        if not q:
            return []
        data = self._get(
            "/recording",
            {
                "query": q,
                "limit": max(1, min(int(limit or 10), 50)),
                "inc": "artist-credits+releases+tags+isrcs",
            },
        )
        return [self._parse_recording(item) for item in data.get("recordings", []) if item]

    def lookup_track(self, title: str, artist: str = "") -> ProviderTrack | None:
        title = clean_text(title, 300)
        artist = clean_text(artist, 300)
        if not title:
            return None
        parts = [f'recording:"{title}"']
        if artist:
            parts.append(f'artist:"{artist}"')
        rows = self.search_recordings(" AND ".join(parts), limit=1)
        return rows[0] if rows else None

    def _parse_recording(self, item: Dict[str, Any]) -> ProviderTrack:
        artists = item.get("artist-credit") or []
        artist_names: List[str] = []
        artist_id = None
        for credit in artists:
            if isinstance(credit, dict):
                artist_obj = credit.get("artist") or {}
                if not artist_id:
                    artist_id = artist_obj.get("id")
                name = clean_text(credit.get("name") or artist_obj.get("name"), 255)
                if name:
                    artist_names.append(name)

        releases = item.get("releases") or []
        first_release = releases[0] if releases else {}
        release_id = first_release.get("id") if isinstance(first_release, dict) else None
        release_title = first_release.get("title") if isinstance(first_release, dict) else None
        release_date = first_release.get("date") if isinstance(first_release, dict) else None
        tags = [
            clean_text(tag.get("name"), 128)
            for tag in (item.get("tags") or [])
            if isinstance(tag, dict) and clean_text(tag.get("name"), 128)
        ]

        mbid = clean_text(item.get("id"), 255)
        return ProviderTrack(
            title=clean_text(item.get("title"), 500),
            artist=", ".join(artist_names),
            provider="musicbrainz",
            provider_track_id=mbid or None,
            provider_artist_id=clean_text(artist_id, 255) or None,
            provider_album_id=clean_text(release_id, 255) or None,
            provider_url=(f"https://musicbrainz.org/recording/{mbid}" if mbid else None),
            album_title=clean_text(release_title, 500) or None,
            release_date=clean_text(release_date, 32) or None,
            duration_ms=int(item["length"]) if str(item.get("length") or "").isdigit() else None,
            tags=tags,
            payload=item,
        )
