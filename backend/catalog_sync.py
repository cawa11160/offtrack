from __future__ import annotations

import ast
import re
from typing import Dict, List

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from models import Artist, AudioAsset, AudioFeatures, CatalogTrack, Track, TrackArtist, UploadedTrack


def _dedupe_names(names: List[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for raw_name in names:
        name = (raw_name or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def parse_artist_names(raw_artist: str | None) -> List[str]:
    raw = (raw_artist or "").strip()
    if not raw:
        return []

    if raw.startswith("[") and raw.endswith("]"):
        try:
            parsed = ast.literal_eval(raw)
        except Exception:
            parsed = None
        if isinstance(parsed, (list, tuple)):
            return _dedupe_names([str(item) for item in parsed if str(item).strip()])

    return _dedupe_names([part.strip() for part in re.split(r"\s*[,;]+\s*", raw) if part.strip()])


def _get_or_create_artist(db: Session, cache: Dict[str, Artist], name: str) -> Artist:
    artist_name = (name or "").strip()
    if not artist_name:
        raise ValueError("artist name is required")

    cache_key = artist_name.casefold()
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    row = db.query(Artist).filter(Artist.name == artist_name).first()
    if row is None:
        row = Artist(name=artist_name)
        db.add(row)
        db.flush()
    cache[cache_key] = row
    return row


def backfill_catalog_from_legacy_tracks(db: Session) -> Dict[str, int]:
    if not inspect(db.connection()).has_table("tracks"):
        return {
            "catalog_tracks": 0,
            "audio_features": 0,
            "artist_links": 0,
        }

    existing_legacy_ids = {
        row[0]
        for row in db.query(CatalogTrack.legacy_dataset_track_id)
        .filter(CatalogTrack.legacy_dataset_track_id.isnot(None))
        .all()
        if row and row[0]
    }
    legacy_rows = db.query(Track).all()

    artist_cache: Dict[str, Artist] = {}
    created_tracks = 0
    created_artist_links = 0
    created_features = 0

    for row in legacy_rows:
        track_id = str(row.id or "").strip()
        if not track_id or track_id in existing_legacy_ids:
            continue

        catalog_track = db.query(CatalogTrack).filter(CatalogTrack.id == track_id).first()
        if catalog_track is None:
            catalog_track = CatalogTrack(
                id=track_id,
                canonical_title=(row.name or "").strip(),
                source_type="catalog",
                release_year=int(row.year) if getattr(row, "year", None) else None,
                duration_ms=int(row.duration_ms) if getattr(row, "duration_ms", None) is not None else None,
                explicit=bool(getattr(row, "explicit", False)),
                image_url=(getattr(row, "image_url", None) or None),
                legacy_dataset_track_id=track_id,
            )
            db.add(catalog_track)
            created_tracks += 1
        else:
            catalog_track.legacy_dataset_track_id = track_id
            if not catalog_track.canonical_title:
                catalog_track.canonical_title = (row.name or "").strip()
            if catalog_track.release_year is None and getattr(row, "year", None):
                catalog_track.release_year = int(row.year)
            if catalog_track.duration_ms is None and getattr(row, "duration_ms", None) is not None:
                catalog_track.duration_ms = int(row.duration_ms)
            if not getattr(catalog_track, "image_url", None):
                catalog_track.image_url = getattr(row, "image_url", None) or None

        db.flush()

        feature_row = db.query(AudioFeatures).filter(AudioFeatures.track_id == catalog_track.id).first()
        if feature_row is None:
            feature_row = AudioFeatures(track_id=catalog_track.id)
            db.add(feature_row)
            created_features += 1

        feature_row.valence = float(row.valence)
        feature_row.acousticness = float(row.acousticness)
        feature_row.danceability = float(row.danceability)
        feature_row.energy = float(row.energy)
        feature_row.instrumentalness = float(row.instrumentalness)
        feature_row.liveness = float(row.liveness)
        feature_row.loudness = float(row.loudness)
        feature_row.speechiness = float(row.speechiness)
        feature_row.tempo = float(row.tempo)
        feature_row.key = int(row.key)
        feature_row.mode = int(row.mode)
        feature_row.popularity = int(row.popularity)
        feature_row.feature_source = "legacy_track"

        artist_names = parse_artist_names(getattr(row, "artists", ""))
        for position, artist_name in enumerate(artist_names):
            artist_row = _get_or_create_artist(db, artist_cache, artist_name)
            link = (
                db.query(TrackArtist)
                .filter(TrackArtist.track_id == catalog_track.id, TrackArtist.artist_id == artist_row.id)
                .first()
            )
            if link is None:
                db.add(
                    TrackArtist(
                        track_id=catalog_track.id,
                        artist_id=artist_row.id,
                        role="primary" if position == 0 else "featured",
                        position=position,
                    )
                )
                created_artist_links += 1

    return {
        "catalog_tracks": created_tracks,
        "audio_features": created_features,
        "artist_links": created_artist_links,
    }


def backfill_catalog_from_uploaded_tracks(db: Session) -> Dict[str, int]:
    if not inspect(db.connection()).has_table("uploaded_tracks"):
        return {
            "catalog_tracks": 0,
            "audio_assets": 0,
            "artist_links": 0,
        }

    existing_legacy_ids = {
        row[0]
        for row in db.query(CatalogTrack.legacy_uploaded_track_id)
        .filter(CatalogTrack.legacy_uploaded_track_id.isnot(None))
        .all()
        if row and row[0]
    }
    legacy_rows = db.query(UploadedTrack).all()

    artist_cache: Dict[str, Artist] = {}
    created_tracks = 0
    created_artist_links = 0
    created_assets = 0

    for row in legacy_rows:
        track_id = str(row.id or "").strip()
        if not track_id or track_id in existing_legacy_ids:
            continue

        catalog_track = db.query(CatalogTrack).filter(CatalogTrack.id == track_id).first()
        if catalog_track is None:
            catalog_track = CatalogTrack(
                id=track_id,
                canonical_title=(row.title or "").strip(),
                source_type="upload",
                release_year=None,
                duration_ms=None,
                explicit=False,
                image_url=(getattr(row, "image_url", None) or None),
                legacy_uploaded_track_id=track_id,
            )
            db.add(catalog_track)
            created_tracks += 1
        else:
            catalog_track.legacy_uploaded_track_id = track_id
            if not catalog_track.canonical_title:
                catalog_track.canonical_title = (row.title or "").strip()
            if not getattr(catalog_track, "image_url", None):
                catalog_track.image_url = getattr(row, "image_url", None) or None

        db.flush()

        artist_names = parse_artist_names(getattr(row, "artist", ""))
        for position, artist_name in enumerate(artist_names):
            artist_row = _get_or_create_artist(db, artist_cache, artist_name)
            link = (
                db.query(TrackArtist)
                .filter(TrackArtist.track_id == catalog_track.id, TrackArtist.artist_id == artist_row.id)
                .first()
            )
            if link is None:
                db.add(
                    TrackArtist(
                        track_id=catalog_track.id,
                        artist_id=artist_row.id,
                        role="primary" if position == 0 else "featured",
                        position=position,
                    )
                )
                created_artist_links += 1

        asset = (
            db.query(AudioAsset)
            .filter(AudioAsset.track_id == catalog_track.id, AudioAsset.kind == "full", AudioAsset.is_primary.is_(True))
            .first()
        )
        if asset is None:
            db.add(
                AudioAsset(
                    id=f"legacy-upload-{catalog_track.id}",
                    track_id=catalog_track.id,
                    storage_path=row.file_path,
                    mime_type=row.mime_type or "audio/mpeg",
                    size_bytes=int(row.size_bytes or 0),
                    kind="full",
                    is_primary=True,
                )
            )
            created_assets += 1

    return {
        "catalog_tracks": created_tracks,
        "audio_assets": created_assets,
        "artist_links": created_artist_links,
    }


def ensure_catalog_backfill(db: Session) -> Dict[str, int]:
    track_stats = backfill_catalog_from_legacy_tracks(db)
    upload_stats = backfill_catalog_from_uploaded_tracks(db)
    db.commit()
    return {
        "catalog_tracks": int(track_stats["catalog_tracks"]) + int(upload_stats["catalog_tracks"]),
        "audio_features": int(track_stats["audio_features"]),
        "audio_assets": int(upload_stats["audio_assets"]),
        "artist_links": int(track_stats["artist_links"]) + int(upload_stats["artist_links"]),
    }
