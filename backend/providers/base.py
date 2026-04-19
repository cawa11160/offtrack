from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ProviderTrack:
    title: str
    artist: str = ""
    provider: str = ""
    provider_track_id: Optional[str] = None
    provider_artist_id: Optional[str] = None
    provider_album_id: Optional[str] = None
    provider_url: Optional[str] = None
    provider_uri: Optional[str] = None
    preview_url: Optional[str] = None
    image_url: Optional[str] = None
    album_title: Optional[str] = None
    release_date: Optional[str] = None
    duration_ms: Optional[int] = None
    popularity: Optional[int] = None
    tags: List[str] = field(default_factory=list)
    payload: Dict[str, Any] = field(default_factory=dict)


def clean_text(value: Any, max_len: int = 500) -> str:
    text = str(value or "").strip()
    if len(text) > max_len:
        return text[:max_len].strip()
    return text


def release_year(release_date: str | None) -> int | None:
    raw = (release_date or "").strip()
    if len(raw) < 4:
        return None
    try:
        year = int(raw[:4])
    except Exception:
        return None
    if 1800 <= year <= 2100:
        return year
    return None
