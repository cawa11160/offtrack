from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from catalog_sync import parse_artist_names
from models import (
    Album,
    Artist,
    AudioFeatures,
    CatalogSyncRun,
    CatalogTrack,
    ExternalTrackRef,
    Genre,
    TrackArtist,
    TrackGenre,
)
from providers import DiscogsClient, LastFmClient, MusicBrainzClient, ProviderTrack
from providers.base import release_year


@dataclass
class SyncStats:
    inserted: int = 0
    updated: int = 0
    refs: int = 0
    genres: int = 0
    fetched: int = 0


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_key(value: str | None) -> str:
    return " ".join((value or "").strip().casefold().split())


def _get_or_create_artist(db: Session, name: str) -> Artist:
    artist_name = (name or "").strip()
    row = db.query(Artist).filter(func.lower(Artist.name) == artist_name.lower()).first()
    if row:
        return row
    row = Artist(name=artist_name)
    db.add(row)
    db.flush()
    return row


def _get_or_create_genre(db: Session, name: str) -> Genre:
    genre_name = (name or "").strip().lower()
    row = db.query(Genre).filter(func.lower(Genre.name) == genre_name.lower()).first()
    if row:
        return row
    row = Genre(name=genre_name)
    db.add(row)
    db.flush()
    return row


def _artist_text(track: CatalogTrack) -> str:
    names = [
        link.artist.name
        for link in sorted(track.artist_links, key=lambda item: (item.position, item.artist_id))
        if link.artist and link.artist.name
    ]
    return ", ".join(names)


def _find_existing_track(db: Session, provider_track: ProviderTrack) -> CatalogTrack | None:
    provider_id = (provider_track.provider_track_id or "").strip()
    if provider_track.provider and provider_id:
        ref = (
            db.query(ExternalTrackRef)
            .filter(
                ExternalTrackRef.provider == provider_track.provider,
                ExternalTrackRef.provider_track_id == provider_id,
            )
            .first()
        )
        if ref:
            return db.query(CatalogTrack).filter(CatalogTrack.id == ref.track_id).first()

    title_key = _normalize_key(provider_track.title)
    artist_key = _normalize_key(provider_track.artist)
    if not title_key:
        return None

    rows = (
        db.query(CatalogTrack)
        .join(TrackArtist, TrackArtist.track_id == CatalogTrack.id)
        .join(Artist, Artist.id == TrackArtist.artist_id)
        .filter(func.lower(CatalogTrack.canonical_title) == title_key)
        .limit(20)
        .all()
    )
    for row in rows:
        if not artist_key or artist_key in _normalize_key(_artist_text(row)):
            return row
    return None


def _upsert_album(db: Session, track: ProviderTrack) -> str | None:
    album_id = (track.provider_album_id or "").strip()
    album_title = (track.album_title or "").strip()
    if not album_id or not album_title:
        return None
    db_album_id = f"{track.provider}:album:{album_id}"
    row = db.query(Album).filter(Album.id == db_album_id).first()
    if row is None:
        row = Album(
            id=db_album_id,
            title=album_title,
            release_date=(track.release_date or None),
            image_url=(track.image_url or None),
        )
        db.add(row)
        db.flush()
    else:
        if track.release_date and not row.release_date:
            row.release_date = track.release_date
        if track.image_url and not row.image_url:
            row.image_url = track.image_url
    return row.id


def _upsert_external_ref(db: Session, catalog_track: CatalogTrack, track: ProviderTrack, album_id: str | None) -> bool:
    if not track.provider:
        return False
    provider_track_id = (track.provider_track_id or "").strip() or None
    row = None
    if provider_track_id:
        row = (
            db.query(ExternalTrackRef)
            .filter(
                ExternalTrackRef.track_id == catalog_track.id,
                ExternalTrackRef.provider == track.provider,
                ExternalTrackRef.provider_track_id == provider_track_id,
            )
            .first()
        )
    elif track.provider_url:
        row = (
            db.query(ExternalTrackRef)
            .filter(
                ExternalTrackRef.track_id == catalog_track.id,
                ExternalTrackRef.provider == track.provider,
                ExternalTrackRef.provider_url == track.provider_url,
            )
            .first()
        )
    if row is None:
        row = ExternalTrackRef(
            id=str(uuid.uuid4()),
            track_id=catalog_track.id,
            provider=track.provider,
            provider_track_id=provider_track_id,
        )
        db.add(row)
        created = True
    else:
        created = False

    row.provider_artist_id = track.provider_artist_id or row.provider_artist_id
    row.provider_album_id = track.provider_album_id or row.provider_album_id
    row.provider_url = track.provider_url or row.provider_url
    row.provider_uri = track.provider_uri or row.provider_uri
    row.preview_url = track.preview_url or row.preview_url
    row.image_url = track.image_url or row.image_url
    row.album_id = album_id or row.album_id
    if track.payload:
        row.payload_json = json.dumps(track.payload, ensure_ascii=True, default=str)[:100000]
    return created


def upsert_provider_track(db: Session, provider_tracks: Sequence[ProviderTrack]) -> tuple[CatalogTrack | None, SyncStats]:
    valid_tracks = [row for row in provider_tracks if (row.title or "").strip()]
    stats = SyncStats(fetched=len(valid_tracks))
    if not valid_tracks:
        return None, stats

    primary = valid_tracks[0]
    for candidate in valid_tracks:
        if candidate.provider == "musicbrainz":
            primary = candidate
            break

    existing = None
    for candidate in valid_tracks:
        existing = _find_existing_track(db, candidate)
        if existing:
            break

    if existing is None:
        track_id = str(uuid.uuid4())
        existing = CatalogTrack(
            id=track_id,
            canonical_title=primary.title.strip(),
            source_type="catalog",
            release_year=release_year(primary.release_date),
            duration_ms=primary.duration_ms,
            explicit=False,
            image_url=primary.image_url,
        )
        db.add(existing)
        db.flush()
        stats.inserted += 1
    else:
        if primary.title and not existing.canonical_title:
            existing.canonical_title = primary.title.strip()
        if existing.release_year is None:
            existing.release_year = release_year(primary.release_date)
        if existing.duration_ms is None and primary.duration_ms is not None:
            existing.duration_ms = primary.duration_ms
        if not existing.image_url:
            existing.image_url = next((row.image_url for row in valid_tracks if row.image_url), None)
        stats.updated += 1

    artist_names = parse_artist_names(primary.artist)
    for position, artist_name in enumerate(artist_names):
        artist = _get_or_create_artist(db, artist_name)
        link = (
            db.query(TrackArtist)
            .filter(TrackArtist.track_id == existing.id, TrackArtist.artist_id == artist.id)
            .first()
        )
        if link is None:
            db.add(
                TrackArtist(
                    track_id=existing.id,
                    artist_id=artist.id,
                    role="primary" if position == 0 else "featured",
                    position=position,
                )
            )

    popularity = next((row.popularity for row in valid_tracks if row.popularity is not None), None)
    if popularity is not None:
        features = db.query(AudioFeatures).filter(AudioFeatures.track_id == existing.id).first()
        if features is None:
            features = AudioFeatures(track_id=existing.id, feature_source="provider")
            db.add(features)
        features.popularity = int(popularity)

    seen_tags: set[str] = set()
    for provider_track in valid_tracks:
        for tag in provider_track.tags:
            tag_key = _normalize_key(tag)
            if not tag_key or tag_key in seen_tags:
                continue
            seen_tags.add(tag_key)
            genre = _get_or_create_genre(db, tag)
            link = (
                db.query(TrackGenre)
                .filter(TrackGenre.track_id == existing.id, TrackGenre.genre_id == genre.id)
                .first()
            )
            if link is None:
                db.add(
                    TrackGenre(
                        track_id=existing.id,
                        genre_id=genre.id,
                        source=provider_track.provider,
                        weight=1.0,
                    )
                )
                stats.genres += 1

    for provider_track in valid_tracks:
        album_id = _upsert_album(db, provider_track)
        if _upsert_external_ref(db, existing, provider_track, album_id):
            stats.refs += 1

    return existing, stats


def _merge_stats(target: SyncStats, source: SyncStats) -> None:
    target.inserted += source.inserted
    target.updated += source.updated
    target.refs += source.refs
    target.genres += source.genres
    target.fetched += source.fetched


def sync_current_catalog(
    db: Session,
    query: str | None = None,
    limit: int = 10,
    enrich: bool = True,
    seed_tracks: Iterable[ProviderTrack] | None = None,
) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 10), 50))
    query = (query or "").strip()
    run = CatalogSyncRun(id=str(uuid.uuid4()), provider="multi", status="running", query=query or None)
    db.add(run)
    db.commit()

    stats = SyncStats()
    provider_notes: Dict[str, str] = {}
    try:
        musicbrainz = MusicBrainzClient()
        lastfm = LastFmClient()
        discogs = DiscogsClient()

        base_tracks = list(seed_tracks or [])
        if not base_tracks and query:
            try:
                if musicbrainz.enabled():
                    base_tracks.extend(musicbrainz.search_recordings(query, limit=limit))
            except Exception as exc:
                provider_notes["musicbrainz"] = str(exc)
            try:
                if lastfm.enabled():
                    base_tracks.extend(lastfm.search_tracks(query, limit=limit))
                else:
                    provider_notes["lastfm"] = "disabled: LASTFM_API_KEY not set"
            except Exception as exc:
                provider_notes["lastfm"] = str(exc)
        elif not base_tracks:
            try:
                if lastfm.enabled():
                    base_tracks.extend(lastfm.top_tracks(limit=limit))
                else:
                    provider_notes["lastfm"] = "disabled: LASTFM_API_KEY not set"
            except Exception as exc:
                provider_notes["lastfm"] = str(exc)

        deduped: List[ProviderTrack] = []
        seen: set[tuple[str, str]] = set()
        for track in base_tracks:
            key = (_normalize_key(track.title), _normalize_key(track.artist))
            if not key[0] or key in seen:
                continue
            seen.add(key)
            deduped.append(track)
            if len(deduped) >= limit:
                break

        for base_track in deduped:
            bundle = [base_track]
            if enrich:
                if base_track.provider != "musicbrainz":
                    try:
                        mb = musicbrainz.lookup_track(base_track.title, base_track.artist)
                        if mb:
                            bundle.append(mb)
                    except Exception as exc:
                        provider_notes.setdefault("musicbrainz", str(exc))
                try:
                    if lastfm.enabled():
                        tags = lastfm.top_tags(base_track.title, base_track.artist)
                        if tags:
                            bundle.append(
                                ProviderTrack(
                                    title=base_track.title,
                                    artist=base_track.artist,
                                    provider="lastfm",
                                    provider_url=base_track.provider_url if base_track.provider == "lastfm" else None,
                                    tags=tags,
                                )
                            )
                except Exception as exc:
                    provider_notes.setdefault("lastfm", str(exc))
                if base_track.provider != "discogs":
                    try:
                        dg = discogs.lookup_track(base_track.title, base_track.artist)
                        if dg:
                            bundle.append(dg)
                    except Exception as exc:
                        provider_notes.setdefault("discogs", str(exc))

            _, row_stats = upsert_provider_track(db, bundle)
            _merge_stats(stats, row_stats)
            db.commit()

        run.status = "completed"
        run.inserted_count = stats.inserted
        run.updated_count = stats.updated
        run.refs_count = stats.refs
        run.error = json.dumps(provider_notes, ensure_ascii=True) if provider_notes else None
        run.finished_at = _now_utc()
        db.commit()
        return {
            "ok": True,
            "runId": run.id,
            "inserted": stats.inserted,
            "updated": stats.updated,
            "refs": stats.refs,
            "genres": stats.genres,
            "fetched": len(deduped),
            "providerNotes": provider_notes,
        }
    except Exception as exc:
        db.rollback()
        run = db.query(CatalogSyncRun).filter(CatalogSyncRun.id == run.id).first()
        if run:
            run.status = "failed"
            run.error = str(exc)
            run.finished_at = _now_utc()
            db.commit()
        raise


def catalog_sync_status(db: Session, limit: int = 5) -> Dict[str, Any]:
    runs = (
        db.query(CatalogSyncRun)
        .order_by(CatalogSyncRun.started_at.desc())
        .limit(max(1, min(int(limit or 5), 20)))
        .all()
    )
    return {
        "runs": [
            {
                "id": row.id,
                "provider": row.provider,
                "status": row.status,
                "query": row.query,
                "inserted": int(row.inserted_count or 0),
                "updated": int(row.updated_count or 0),
                "refs": int(row.refs_count or 0),
                "error": row.error,
                "startedAt": row.started_at,
                "finishedAt": row.finished_at,
            }
            for row in runs
        ]
    }
