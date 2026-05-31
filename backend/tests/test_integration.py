import os
import sys
import json
import math
import struct
import wave
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import text

# Ensure backend module directory is importable when tests are run from repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Test env must be set before importing backend modules that build engine/app.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_offtrack.sqlite3")
os.environ.setdefault("MEDIA_DIR", str(BACKEND_DIR / "tests" / ".tmp_media"))
os.environ.setdefault("MEDIA_STORAGE_BACKEND", "local")
os.environ.setdefault("REQUIRE_AUTH_UPLOADS", "true")
os.environ.setdefault("UPLOAD_SECRET", "")
os.environ.setdefault("SPOTIFY_CLIENT_ID", "test-client")
os.environ.setdefault("SPOTIFY_CLIENT_SECRET", "test-secret")
os.environ.setdefault("FRONTEND_URL", "http://localhost:8080")
os.environ["ADMIN_API_KEY"] = "test-admin-key"

from api import app, db_search, pwd_context  # noqa: E402
from catalog_ingest import sync_current_catalog  # noqa: E402
from catalog_sync import ensure_catalog_backfill  # noqa: E402
from db import SessionLocal, engine  # noqa: E402
from models import (  # noqa: E402
    Artist,
    AudioAsset,
    AudioFeatures,
    Base,
    CatalogSyncRun,
    CatalogTrack,
    ExternalTrackRef,
    Genre,
    Interaction,
    RecommenderArtifact,
    RefreshSession,
    Track,
    TrackArtist,
    TrackGenre,
    User,
)
from providers import ProviderTrack  # noqa: E402
from recommender import Recommender  # noqa: E402
from recommender_agent import (  # noqa: E402
    compute_recommender_metrics,
    compute_reward_artifact,
    evaluate_reward_artifact,
    list_reward_artifacts,
    load_ranker_scores,
    load_reward_scores,
    rollback_reward_artifact,
    train_ranker_artifact,
    write_reward_artifact,
    write_training_dataset,
)
from storage import is_remote_storage_path, remote_media_url  # noqa: E402


def _fresh_client() -> TestClient:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return TestClient(app)


def _verify_email_from_signup(client: TestClient, signup_response) -> None:
    url = signup_response.json().get("email_verification_url")
    assert url, signup_response.text
    parsed = urlparse(url)
    target = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    verified = client.get(target)
    assert verified.status_code == 200, verified.text
    assert verified.json()["email_verified"] is True


def _wav_bytes(duration_s: float = 0.25, sample_rate: int = 8000) -> bytes:
    buf = BytesIO()
    frame_count = int(duration_s * sample_rate)
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for idx in range(frame_count):
            value = int(12000 * math.sin(2 * math.pi * 440 * idx / sample_rate))
            frames.extend(struct.pack("<h", value))
        wav.writeframes(bytes(frames))
    return buf.getvalue()


def _legacy_track_row(track_id: str, name: str, artists: str, popularity: int = 50) -> dict:
    return {
        "id": track_id,
        "name": name,
        "artists": artists,
        "image_url": "",
        "year": 2020,
        "valence": 0.5,
        "acousticness": 0.2,
        "danceability": 0.7,
        "duration_ms": 180000,
        "energy": 0.8,
        "explicit": False,
        "instrumentalness": 0.0,
        "key": 1,
        "liveness": 0.1,
        "loudness": -6.0,
        "mode": 1,
        "popularity": popularity,
        "speechiness": 0.05,
        "tempo": 120.0,
    }


def test_recommendation_and_search_fall_back_when_catalog_schema_is_stale():
    Base.metadata.drop_all(engine)
    Track.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE catalog_tracks (id VARCHAR PRIMARY KEY, canonical_title TEXT)"))
        conn.execute(
            Track.__table__.insert(),
            [
                _legacy_track_row("seed-track", "Seed Song", "Seed Artist", 80),
                _legacy_track_row("rec-track-1", "Recommended One", "Artist One", 70),
                _legacy_track_row("rec-track-2", "Recommended Two", "Artist Two", 60),
            ],
        )

    recommender = Recommender()
    recommender.load()
    recs = recommender.recommend([{"title": "Seed Song"}], n=2)
    assert len(recs) >= 1
    assert all(row["id"] != "seed-track" for row in recs)

    db = SessionLocal()
    try:
        results = db_search(db, "Recommended", limit=2)
    finally:
        db.close()
    assert [row["id"] for row in results] == ["rec-track-1", "rec-track-2"]


def test_auth_signup_login_and_upload_authorization():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={"name": "Artist One", "email": "artist1@example.com", "password": "password123", "account_type": "artist"},
    )
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]
    assert token

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "artist1@example.com"
    assert me.json()["account_type"] == "artist"
    assert me.json()["email_verified"] is False

    # Upload should be blocked when auth is missing.
    unauth_upload = client.post(
        "/api/uploads",
        data={"title": "NoAuth Song", "artist": "NoAuth"},
        files={"file": ("song.mp3", b"FAKEAUDIO", "audio/mpeg")},
    )
    assert unauth_upload.status_code == 401, unauth_upload.text

    listener_signup = client.post(
        "/api/auth/signup",
        json={"name": "Listener One", "email": "listener1@example.com", "password": "password123"},
    )
    assert listener_signup.status_code == 200, listener_signup.text
    listener_upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {listener_signup.json()['access_token']}"},
        data={"title": "Listener Song", "artist": "Listener"},
        files={"file": ("song.mp3", b"LISTENERAUDIO", "audio/mpeg")},
    )
    assert listener_upload.status_code == 403, listener_upload.text
    listener_manage = client.get(
        "/api/uploads/manage",
        headers={"Authorization": f"Bearer {listener_signup.json()['access_token']}"},
    )
    assert listener_manage.status_code == 403, listener_manage.text

    unverified_artist_upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Unverified Song", "artist": "Artist One"},
        files={"file": ("song.mp3", b"UNVERIFIEDAUDIO", "audio/mpeg")},
    )
    assert unverified_artist_upload.status_code == 403, unverified_artist_upload.text

    _verify_email_from_signup(client, signup)
    verified_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert verified_me.status_code == 200, verified_me.text
    assert verified_me.json()["email_verified"] is True

    auth_upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Auth Song", "artist": "Artist One"},
        files={"file": ("song.mp3", b"FAKEAUDIO", "audio/mpeg")},
    )
    assert auth_upload.status_code == 200, auth_upload.text
    body = auth_upload.json()
    assert body["title"] == "Auth Song"
    assert body["audioUrl"].startswith("/api/uploads/")


def test_artist_can_resend_and_verify_email():
    client = _fresh_client()
    signup = client.post(
        "/api/auth/signup",
        json={"name": "Resend Artist", "email": "resend@example.com", "password": "password123", "account_type": "artist"},
    )
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]

    resend = client.post("/api/auth/resend-verification", headers={"Authorization": f"Bearer {token}"})
    assert resend.status_code == 200, resend.text
    assert resend.json()["email_verification_url"]
    parsed = urlparse(resend.json()["email_verification_url"])
    verified = client.get(parsed.path + (f"?{parsed.query}" if parsed.query else ""))
    assert verified.status_code == 200, verified.text

    resend_after = client.post("/api/auth/resend-verification", headers={"Authorization": f"Bearer {token}"})
    assert resend_after.status_code == 200, resend_after.text
    assert resend_after.json()["email_verification_url"] is None


def test_user_settings_persist_export_and_delete_history():
    client = _fresh_client()
    signup = client.post(
        "/api/auth/signup",
        json={"name": "Settings Artist", "email": "settings@example.com", "password": "password123", "account_type": "artist"},
    )
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    initial = client.get("/api/settings", headers=headers)
    assert initial.status_code == 200, initial.text
    assert initial.json()["artist"]["discoveryEnabled"] is True

    updated = client.patch(
        "/api/settings",
        headers=headers,
        json={
            "notifications": {"weeklyArtistReport": False, "listenerActivity": True},
            "privacy": {"publicListening": True, "analyticsConsent": False},
            "artist": {"discoveryEnabled": False, "playMilestoneThreshold": 250},
            "conversionLinks": {"spotify": "https://open.spotify.com/artist/test", "website": "https://artist.example.com"},
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["notifications"]["weeklyArtistReport"] is False
    assert body["privacy"]["analyticsConsent"] is False
    assert body["artist"]["discoveryEnabled"] is False
    assert body["artist"]["playMilestoneThreshold"] == 250
    assert body["conversionLinks"]["spotify"] == "https://open.spotify.com/artist/test"

    invalid = client.patch(
        "/api/settings",
        headers=headers,
        json={"conversionLinks": {"merch": "ftp://bad.example.com/shop"}},
    )
    assert invalid.status_code == 422, invalid.text

    db = SessionLocal()
    try:
        me = db.query(User).filter(User.email == "settings@example.com").first()
        assert me is not None
        db.add(Interaction(distinct_id="settings-user", user_id=me.id, track_id="settings-track", event="play", source_page="test"))
        db.commit()
    finally:
        db.close()

    exported = client.get("/api/settings/export", headers=headers)
    assert exported.status_code == 200, exported.text
    assert exported.json()["settings"]["artist"]["playMilestoneThreshold"] == 250
    assert len(exported.json()["recentInteractions"]) == 1

    deleted = client.delete("/api/settings/listening-history", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["deleted"] == 1


def test_user_can_change_password_and_logout_all_sessions():
    client = _fresh_client()
    signup = client.post(
        "/api/auth/signup",
        json={"name": "Password User", "email": "password-user@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    bad = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "wrong123", "new_password": "newpassword123"},
    )
    assert bad.status_code == 401, bad.text

    changed = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "password123", "new_password": "newpassword123"},
    )
    assert changed.status_code == 200, changed.text

    old_login = client.post("/api/auth/login", json={"email": "password-user@example.com", "password": "password123"})
    assert old_login.status_code == 401, old_login.text
    new_login = client.post("/api/auth/login", json={"email": "password-user@example.com", "password": "newpassword123"})
    assert new_login.status_code == 200, new_login.text
    new_headers = {"Authorization": f"Bearer {new_login.json()['access_token']}"}
    logout_all = client.post("/api/auth/logout-all", headers=new_headers)
    assert logout_all.status_code == 200, logout_all.text
    assert logout_all.json()["revoked"] >= 1


def test_refresh_sessions_rotate_and_logout_revokes_cookie():
    client = _fresh_client()
    signup = client.post(
        "/api/auth/signup",
        json={"name": "Session User", "email": "session@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
    original_refresh = signup.cookies.get("offtrack_refresh")
    assert original_refresh

    first_refresh = client.post("/api/auth/refresh")
    assert first_refresh.status_code == 200, first_refresh.text
    rotated_refresh = first_refresh.cookies.get("offtrack_refresh")
    assert rotated_refresh and rotated_refresh != original_refresh

    db = SessionLocal()
    try:
        rows = db.query(RefreshSession).order_by(RefreshSession.created_at.asc()).all()
        assert len(rows) == 2
        assert rows[0].revoked_at is not None
        assert rows[0].replaced_by_session_id == rows[1].id
        assert rows[1].revoked_at is None
    finally:
        db.close()

    replay = TestClient(app).post("/api/auth/refresh", cookies={"offtrack_refresh": original_refresh})
    assert replay.status_code == 401, replay.text

    replay_revoked_current = client.post("/api/auth/refresh")
    assert replay_revoked_current.status_code == 401, replay_revoked_current.text

    login = client.post("/api/auth/login", json={"email": "session@example.com", "password": "password123"})
    assert login.status_code == 200, login.text
    active_refresh = login.cookies.get("offtrack_refresh")
    assert active_refresh

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200, logout.text

    after_logout = TestClient(app).post("/api/auth/refresh", cookies={"offtrack_refresh": active_refresh})
    assert after_logout.status_code == 401, after_logout.text


def test_signup_rejects_weak_passwords():
    client = _fresh_client()
    weak = client.post(
        "/api/auth/signup",
        json={"name": "Weak User", "email": "weak@example.com", "password": "password", "account_type": "artist"},
    )
    assert weak.status_code == 422, weak.text


def test_signup_sanitizes_identity_and_uses_scrypt_password_hash(): 
    client = _fresh_client() 
    signup = client.post( 
        "/api/auth/signup", 
        json={"name": "  Safe\n User\t ", "email": "UPPER@example.com", "password": "password123"}, 
    )
    assert signup.status_code == 200, signup.text

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "upper@example.com").first()
        assert user is not None
        assert user.name == "Safe User"
        assert user.password_hash.startswith("scrypt$")
        assert "password123" not in user.password_hash
    finally: 
        db.close() 
 
 
def test_user_can_update_profile_details(): 
    client = _fresh_client() 
    signup = client.post( 
        "/api/auth/signup", 
        json={"name": "Original User", "email": "profile@example.com", "password": "password123"}, 
    ) 
    assert signup.status_code == 200, signup.text 
    token = signup.json()["access_token"] 
    _verify_email_from_signup(client, signup) 
 
    updated = client.patch( 
        "/api/auth/me", 
        headers={"Authorization": f"Bearer {token}"}, 
        json={"name": "  Updated\n Artist\t ", "email": "NEWPROFILE@example.com", "account_type": "artist"}, 
    ) 
    assert updated.status_code == 200, updated.text 
    body = updated.json() 
    assert body["name"] == "Updated Artist" 
    assert body["email"] == "newprofile@example.com" 
    assert body["account_type"] == "artist" 
    assert body["email_verified"] is False 
    assert body["email_verification_url"] 
 
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}) 
    assert me.status_code == 200, me.text 
    assert me.json()["name"] == "Updated Artist" 
    assert me.json()["email"] == "newprofile@example.com" 
    assert me.json()["account_type"] == "artist" 
    assert me.json()["email_verified"] is False 
 
 
def test_profile_update_rejects_duplicate_email(): 
    client = _fresh_client() 
    first = client.post( 
        "/api/auth/signup", 
        json={"name": "First", "email": "first@example.com", "password": "password123"}, 
    ) 
    assert first.status_code == 200, first.text 
    second = client.post( 
        "/api/auth/signup", 
        json={"name": "Second", "email": "second@example.com", "password": "password123"}, 
    ) 
    assert second.status_code == 200, second.text 
 
    duplicate = client.patch( 
        "/api/auth/me", 
        headers={"Authorization": f"Bearer {second.json()['access_token']}"}, 
        json={"email": "FIRST@example.com"}, 
    ) 
    assert duplicate.status_code == 409, duplicate.text 
 
 
def test_login_upgrades_legacy_pbkdf2_password_hash(): 
    client = _fresh_client() 
    legacy_hash = pwd_context.hash("password123") 

    db = SessionLocal()
    try:
        user = User(email="legacy@example.com", name="Legacy User", account_type="listener", password_hash=legacy_hash)
        db.add(user)
        db.commit()
    finally:
        db.close()

    login = client.post("/api/auth/login", json={"email": "legacy@example.com", "password": "password123"})
    assert login.status_code == 200, login.text

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "legacy@example.com").first()
        assert user is not None
        assert user.password_hash.startswith("scrypt$")
        assert user.password_hash != legacy_hash
    finally:
        db.close()


def test_upload_persists_to_normalized_catalog_tables():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={"name": "Artist Two", "email": "artist2@example.com", "password": "password123", "account_type": "artist"},
    )
    assert signup.status_code == 200, signup.text
    _verify_email_from_signup(client, signup)
    token = signup.json()["access_token"]

    upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Normalized Song", "artist": "Artist Two, Guest Voice"},
        files={"file": ("song.mp3", b"NORMALIZEDAUDIO", "audio/mpeg")},
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    track_id = body["id"]
    db = SessionLocal()
    try:
        track = db.query(CatalogTrack).filter(CatalogTrack.id == track_id).first()
        assert track is not None
        assert track.canonical_title == "Normalized Song"
        assert track.source_type == "upload"
        assert track.owner_user_id is not None
        assert track.is_published is True

        assets = db.query(AudioAsset).filter(AudioAsset.track_id == track_id).all()
        assert len(assets) == 1
        assert assets[0].kind == "full"

        links = (
            db.query(TrackArtist)
            .filter(TrackArtist.track_id == track_id)
            .order_by(TrackArtist.position.asc())
            .all()
        )
        assert len(links) == 2

        artist_ids = [link.artist_id for link in links]
        artist_names = [
            row.name for row in db.query(Artist).filter(Artist.id.in_(artist_ids)).order_by(Artist.name.asc()).all()
        ]
        assert artist_names == ["Artist Two", "Guest Voice"]
    finally:
        db.close()


def test_wav_upload_extracts_duration_and_waveform():
    client = _fresh_client()
    signup = client.post(
        "/api/auth/signup",
        json={
            "name": "Wave Artist",
            "email": "wave-artist@example.com",
            "password": "password123",
            "account_type": "artist",
        },
    )
    assert signup.status_code == 200, signup.text
    _verify_email_from_signup(client, signup)
    token = signup.json()["access_token"]

    upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Wave Song", "artist": "Wave Artist"},
        files={"file": ("wave.wav", _wav_bytes(0.3), "audio/wav")},
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["processingStatus"] == "ready"
    assert 250 <= int(body["durationMs"]) <= 350
    assert len(body["waveformPeaks"]) == 64

    managed = client.get("/api/uploads/manage", headers={"Authorization": f"Bearer {token}"})
    assert managed.status_code == 200, managed.text
    row = next(item for item in managed.json()["tracks"] if item["id"] == body["id"])
    assert 250 <= int(row["durationMs"]) <= 350
    assert len(row["waveformPeaks"]) == 64


def test_artist_can_manage_owned_uploads_and_unpublish():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={
            "name": "Manager Artist",
            "email": "manager-artist@example.com",
            "password": "password123",
            "account_type": "artist",
        },
    )
    assert signup.status_code == 200, signup.text
    _verify_email_from_signup(client, signup)
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    upload = client.post(
        "/api/uploads",
        headers=headers,
        data={"title": "Manage Me", "artist": "Manager Artist"},
        files={"file": ("song.mp3", b"MANAGEAUDIO", "audio/mpeg")},
    )
    assert upload.status_code == 200, upload.text
    upload_id = upload.json()["id"]

    managed = client.get("/api/uploads/manage", headers=headers)
    assert managed.status_code == 200, managed.text
    rows = managed.json().get("tracks") or []
    assert any(row.get("id") == upload_id and row.get("ownerUserId") for row in rows)

    updated = client.patch(
        f"/api/uploads/{upload_id}",
        headers=headers,
        json={"title": "Managed Title", "artist": "Manager Artist, Guest", "is_published": True},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Managed Title"
    assert updated.json()["artist"] == "Manager Artist, Guest"

    replaced = client.post(
        f"/api/uploads/{upload_id}/replace",
        headers=headers,
        files={"file": ("replacement.mp3", b"REPLACEDAUDIO", "audio/mpeg")},
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["sizeBytes"] == len(b"REPLACEDAUDIO")

    public_before = client.get("/api/uploads")
    assert public_before.status_code == 200, public_before.text
    assert any(row.get("id") == upload_id for row in public_before.json().get("tracks") or [])

    deleted = client.delete(f"/api/uploads/{upload_id}", headers=headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["track"]["isPublished"] is False

    public_after = client.get("/api/uploads")
    assert public_after.status_code == 200, public_after.text
    assert not any(row.get("id") == upload_id for row in public_after.json().get("tracks") or [])


def test_admin_can_claim_unowned_upload_for_artist():
    client = _fresh_client()

    artist_signup = client.post(
        "/api/auth/signup",
        json={
            "name": "Claim Artist",
            "email": "claim-artist@example.com",
            "password": "password123",
            "account_type": "artist",
        },
    )
    assert artist_signup.status_code == 200, artist_signup.text
    artist_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {artist_signup.json()['access_token']}"})
    artist_id = artist_me.json()["id"]

    db = SessionLocal()
    try:
        track = CatalogTrack(
            id="unowned-upload",
            canonical_title="Unowned Upload",
            source_type="upload",
            explicit=False,
            is_published=True,
            owner_user_id=None,
        )
        db.add(track)
        db.flush()
        artist = Artist(name="Legacy Upload Artist")
        db.add(artist)
        db.flush()
        db.add(TrackArtist(track_id=track.id, artist_id=artist.id, role="primary", position=0))
        db.add(
            AudioAsset(
                id="unowned-asset",
                track_id=track.id,
                storage_path=str(BACKEND_DIR / "tests" / ".tmp_media" / "missing.mp3"),
                mime_type="audio/mpeg",
                size_bytes=123,
                kind="full",
                is_primary=True,
            )
        )
        db.commit()
    finally:
        db.close()

    admin_headers = {"X-Admin-Api-Key": "test-admin-key"}
    unowned = client.get("/api/admin/uploads/unowned", headers=admin_headers)
    assert unowned.status_code == 200, unowned.text
    assert any(row.get("id") == "unowned-upload" for row in unowned.json().get("tracks") or [])

    claimed = client.post(
        "/api/admin/uploads/unowned-upload/claim",
        headers=admin_headers,
        json={"owner_user_id": artist_id},
    )
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["track"]["ownerUserId"] == artist_id

    unowned_after = client.get("/api/admin/uploads/unowned", headers=admin_headers)
    assert unowned_after.status_code == 200, unowned_after.text
    assert not any(row.get("id") == "unowned-upload" for row in unowned_after.json().get("tracks") or [])


def test_remote_storage_url_helpers(monkeypatch):
    monkeypatch.setenv("S3_PUBLIC_BASE_URL", "https://cdn.example.com/media")
    assert is_remote_storage_path("s3://bucket/offtrack/uploads/song.mp3")
    assert remote_media_url("s3://bucket/offtrack/uploads/song.mp3") == "https://cdn.example.com/media/offtrack/uploads/song.mp3"


def test_catalog_backfill_migrates_legacy_track_rows():
    _fresh_client()
    db = SessionLocal()
    try:
        db.add(
            Track(
                id="legacy-track-1",
                name="Legacy Song",
                artists="['Legacy Artist', 'Feature Artist']",
                image_url="https://example.com/legacy.jpg",
                year=1999,
                valence=0.4,
                acousticness=0.2,
                danceability=0.5,
                duration_ms=210000,
                energy=0.8,
                explicit=False,
                instrumentalness=0.0,
                key=5,
                liveness=0.1,
                loudness=-6.0,
                mode=1,
                popularity=77,
                speechiness=0.03,
                tempo=120.5,
            )
        )
        db.commit()

        stats = ensure_catalog_backfill(db)
        assert stats["catalog_tracks"] == 1
        assert stats["audio_features"] == 1
        assert stats["artist_links"] == 2

        track = db.query(CatalogTrack).filter(CatalogTrack.id == "legacy-track-1").first()
        assert track is not None
        assert track.legacy_dataset_track_id == "legacy-track-1"
        assert track.source_type == "catalog"

        features = db.query(AudioFeatures).filter(AudioFeatures.track_id == "legacy-track-1").first()
        assert features is not None
        assert features.popularity == 77
        assert round(float(features.tempo or 0), 1) == 120.5

        links = (
            db.query(TrackArtist)
            .filter(TrackArtist.track_id == "legacy-track-1")
            .order_by(TrackArtist.position.asc())
            .all()
        )
        assert len(links) == 2

        artist_ids = [link.artist_id for link in links]
        artist_names = [
            row.name for row in db.query(Artist).filter(Artist.id.in_(artist_ids)).order_by(Artist.name.asc()).all()
        ]
        assert artist_names == ["Feature Artist", "Legacy Artist"]
    finally:
        db.close()


def test_search_finds_normalized_uploaded_tracks():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={
            "name": "Artist Search",
            "email": "artist-search@example.com",
            "password": "password123",
            "account_type": "artist",
        },
    )
    assert signup.status_code == 200, signup.text
    _verify_email_from_signup(client, signup)
    token = signup.json()["access_token"]

    upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Searchable Upload", "artist": "Artist Search"},
        files={"file": ("song.mp3", b"SEARCHAUDIO", "audio/mpeg")},
    )
    assert upload.status_code == 200, upload.text
    uploaded_id = upload.json()["id"]

    with patch("api.spotify_search", return_value=[]):
        res = client.get("/api/search?q=Searchable&limit=8")
    assert res.status_code == 200, res.text
    results = res.json().get("results") or []
    assert any(item.get("id") == uploaded_id and item.get("title") == "Searchable Upload" for item in results)


def test_artist_dashboard_reports_owned_upload_interactions():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={
            "name": "Dashboard Artist",
            "email": "dashboard-artist@example.com",
            "password": "password123",
            "account_type": "artist",
        },
    )
    assert signup.status_code == 200, signup.text
    _verify_email_from_signup(client, signup)
    token = signup.json()["access_token"]

    upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Dashboard Song", "artist": "Dashboard Artist"},
        files={"file": ("song.wav", _wav_bytes(), "audio/wav")},
    )
    assert upload.status_code == 200, upload.text
    uploaded_id = upload.json()["id"]

    play = client.post(
        "/api/feedback",
        json={
            "track_id": uploaded_id,
            "event": "play",
            "distinct_id": "listener-one",
            "source_page": "recommendations",
        },
    )
    assert play.status_code == 200, play.text
    like = client.post(
        "/api/feedback",
        json={
            "track_id": uploaded_id,
            "event": "like",
            "distinct_id": "listener-two",
            "source_page": "track_detail",
        },
    )
    assert like.status_code == 200, like.text

    res = client.get("/api/artist/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["summary"]["totalTracks"] == 1
    assert body["summary"]["publishedTracks"] == 1
    assert body["summary"]["plays"] == 1
    assert body["summary"]["likes"] == 1
    assert body["summary"]["uniqueListeners"] == 2
    assert body["summary"]["qualifiedConnections"] == 2
    assert body["tracks"][0]["id"] == uploaded_id
    assert body["tracks"][0]["metrics"]["eventCounts"]["play"] == 1
    assert body["tracks"][0]["metrics"]["qualifiedListeners"] == 2
    assert body["tracks"][0]["metrics"]["discoveryScore"]["value"] > 0
    assert body["tracks"][0]["metrics"]["discoveryScore"]["nextAction"]
    assert body["summary"]["averageDiscoveryScore"] > 0
    assert body["recentInteractions"][0]["listenerKey"].startswith("listener-")

    managed = client.get("/api/uploads/manage", headers={"Authorization": f"Bearer {token}"})
    assert managed.status_code == 200, managed.text
    assert managed.json()["tracks"][0]["metrics"]["discoveryScore"]["label"]


def test_recommend_includes_published_artist_uploads():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={
            "name": "Recommended Upload Artist",
            "email": "recommended-upload@example.com",
            "password": "password123",
            "account_type": "artist",
        },
    )
    assert signup.status_code == 200, signup.text
    _verify_email_from_signup(client, signup)
    token = signup.json()["access_token"]

    upload = client.post(
        "/api/uploads",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Musician First Upload", "artist": "Recommended Upload Artist"},
        files={"file": ("song.wav", _wav_bytes(), "audio/wav")},
    )
    assert upload.status_code == 200, upload.text
    uploaded_id = upload.json()["id"]

    class StubRec:
        def recommend(self, *args, **kwargs):
            return [
                {
                    "id": "stub-track-1",
                    "title": "Catalog Match",
                    "artist": "Catalog Artist",
                    "year": 2024,
                    "reasons": ["test"],
                }
            ]

    with (
        patch("api.get_recommender", return_value=StubRec()),
        patch("api.spotify_enabled", return_value=False),
        patch("api.itunes_track_lookup", return_value=None),
    ):
        app.state.recommender_error = ""
        res = client.post("/api/recommend", json={"seeds": [{"title": "seed"}], "n": 3, "mode": "all"})
    assert res.status_code == 200, res.text
    recommendations = res.json().get("recommendations") or []
    uploaded = [row for row in recommendations if row.get("id") == uploaded_id]
    assert uploaded
    assert uploaded[0]["source"] == "upload"
    assert uploaded[0]["audioUrl"] == f"/api/uploads/{uploaded_id}/stream"
    assert "Independent musician on Offtrack" in uploaded[0]["reasons"]


def test_recommend_reserves_underexposed_upload_exploration_slot():
    client = _fresh_client()
    db = SessionLocal()
    try:
        user = User(email="explore-artist@example.com", name="Explore Artist", account_type="artist", password_hash="x")
        artist = Artist(name="Explore Artist")
        db.add_all([user, artist])
        db.flush()
        for idx in range(3):
            track = CatalogTrack(
                id=f"explore-upload-{idx}",
                canonical_title=f"Explore Upload {idx}",
                source_type="upload",
                release_year=2026,
                duration_ms=180000,
                explicit=False,
                is_published=True,
                owner_user_id=user.id,
            )
            db.add(track)
            db.add(TrackArtist(track_id=track.id, artist_id=artist.id, role="primary", position=0))
            db.add(
                AudioAsset(
                    id=f"asset-explore-upload-{idx}",
                    track_id=track.id,
                    storage_path=f"uploads/explore-upload-{idx}.mp3",
                    mime_type="audio/mpeg",
                    size_bytes=123,
                    kind="full",
                    is_primary=True,
                )
            )
        db.add(Interaction(distinct_id="prior-listener", track_id="explore-upload-0", event="impression"))
        db.add(Interaction(distinct_id="prior-listener", track_id="explore-upload-1", event="impression"))
        db.commit()
    finally:
        db.close()

    class StubRec:
        def recommend(self, *args, **kwargs):
            return [
                {
                    "id": f"catalog-{idx}",
                    "title": f"Catalog {idx}",
                    "artist": "Catalog Artist",
                    "year": 2024,
                    "imageUrl": "",
                    "reasons": ["catalog"],
                }
                for idx in range(4)
            ]

    with (
        patch("api.get_recommender", return_value=StubRec()),
        patch("api.spotify_enabled", return_value=False),
        patch("api.itunes_track_lookup", return_value=None),
    ):
        app.state.recommender_error = ""
        res = client.post("/api/recommend", json={"seeds": [{"title": "seed"}], "n": 4, "mode": "all"})

    assert res.status_code == 200, res.text
    recommendations = res.json().get("recommendations") or []
    exploration = [row for row in recommendations if row.get("exploration")]
    assert exploration
    assert "Exploration slot for new listener feedback" in exploration[0]["reasons"]


def test_catalog_sync_ingests_seed_provider_tracks():
    _fresh_client()
    db = SessionLocal()
    try:
        result = sync_current_catalog(
            db,
            query="Provider Song",
            limit=1,
            enrich=False,
            seed_tracks=[
                ProviderTrack(
                    title="Provider Song",
                    artist="Provider Artist",
                    provider="musicbrainz",
                    provider_track_id="mbid-provider-song",
                    provider_artist_id="mbid-provider-artist",
                    provider_album_id="mbid-provider-release",
                    provider_url="https://musicbrainz.org/recording/mbid-provider-song",
                    album_title="Provider Album",
                    release_date="2026-04-17",
                    duration_ms=180000,
                    tags=["indie pop", "current"],
                )
            ],
        )
        assert result["ok"] is True
        assert result["inserted"] == 1

        track = db.query(CatalogTrack).filter(CatalogTrack.canonical_title == "Provider Song").first()
        assert track is not None
        assert track.release_year == 2026

        ref = db.query(ExternalTrackRef).filter(ExternalTrackRef.provider_track_id == "mbid-provider-song").first()
        assert ref is not None
        assert ref.provider == "musicbrainz"

        genres = [row.name for row in db.query(Genre).order_by(Genre.name.asc()).all()]
        assert "current" in genres
        assert "indie pop" in genres

        run = db.query(CatalogSyncRun).first()
        assert run is not None
        assert run.status == "completed"
    finally:
        db.close()


def test_profile_music_web_returns_track_artist_genre_graph():
    client = _fresh_client()
    db = SessionLocal()
    try:
        artist = Artist(name="Graph Artist")
        genre = Genre(name="dream pop")
        db.add_all([artist, genre])
        db.flush()

        track = CatalogTrack(
            id="graph-track",
            canonical_title="Graph Song",
            source_type="catalog",
            release_year=2026,
            duration_ms=200000,
            explicit=False,
        )
        db.add(track)
        db.flush()
        db.add(TrackArtist(track_id=track.id, artist_id=artist.id, role="primary", position=0))
        db.add(TrackGenre(track_id=track.id, genre_id=genre.id, source="test", weight=1.0))
        db.add(Interaction(distinct_id="graph-user", track_id=track.id, event="like", source_page="test"))

        upload_artist = Artist(name="Discovery Artist")
        db.add(upload_artist)
        db.flush()
        upload = CatalogTrack(
            id="graph-upload-candidate",
            canonical_title="Graph Upload",
            source_type="upload",
            duration_ms=190000,
            explicit=False,
            is_published=True,
        )
        db.add(upload)
        db.flush()
        db.add(TrackArtist(track_id=upload.id, artist_id=upload_artist.id, role="primary", position=0))
        db.add(TrackGenre(track_id=upload.id, genre_id=genre.id, source="test", weight=1.0))
        db.add(
            AudioAsset(
                id="graph-upload-asset",
                track_id=upload.id,
                storage_path=str(BACKEND_DIR / "tests" / ".tmp_media" / "graph-upload.mp3"),
                mime_type="audio/mpeg",
                size_bytes=456,
                duration_ms=190000,
                kind="full",
                is_primary=True,
            )
        )
        db.add(Interaction(distinct_id="other-listener", track_id=upload.id, event="play_complete", source_page="test"))
        db.add(Interaction(distinct_id="other-listener", track_id=upload.id, event="save", source_page="test"))
        db.commit()
    finally:
        db.close()

    res = client.get("/api/profile/music-web?distinct_id=graph-user")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["hasData"] is True
    node_labels = {node["label"] for node in body["nodes"]}
    assert {"You", "Graph Song", "Graph Artist", "dream pop", "Graph Upload", "Discovery Artist"}.issubset(node_labels)
    candidate = next(node for node in body["nodes"] if node["label"] == "Graph Upload")
    assert candidate["isDiscoveryCandidate"] is True
    assert candidate["sourceType"] == "upload"
    assert candidate["audioUrl"] == "/api/uploads/graph-upload-candidate/stream"
    assert candidate["discoveryScore"]["value"] > 0
    assert "dream pop" in candidate["discoveryReason"]
    discovery_edges = [edge for edge in body["edges"] if edge["relation"] == "discovery"]
    assert any(edge["target"] == "track:graph-upload-candidate" for edge in discovery_edges)
    assert body["stats"]["trackCount"] == 1
    assert body["stats"]["interactionCount"] == 1
    assert body["stats"]["discoveryCandidateCount"] == 1


def test_profile_music_web_includes_authenticated_user_history_across_distinct_ids():
    client = _fresh_client()
    signup = client.post(
        "/api/auth/signup",
        json={"name": "Graph Listener", "email": "graph-listener@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    user_id = me.json()["id"]

    db = SessionLocal()
    try:
        artist = Artist(name="Profile Artist")
        genre = Genre(name="profile pop")
        db.add_all([artist, genre])
        db.flush()

        track = CatalogTrack(
            id="profile-graph-track",
            canonical_title="Profile Graph Song",
            source_type="catalog",
            release_year=2026,
            duration_ms=180000,
            explicit=False,
        )
        db.add(track)
        db.flush()
        db.add(TrackArtist(track_id=track.id, artist_id=artist.id, role="primary", position=0))
        db.add(TrackGenre(track_id=track.id, genre_id=genre.id, source="test", weight=1.0))
        db.add(
            Interaction(
                distinct_id="old-browser-id",
                user_id=user_id,
                track_id=track.id,
                event="play_complete",
                source_page="test",
            )
        )
        db.commit()
    finally:
        db.close()

    res = client.get(
        "/api/profile/music-web?distinct_id=new-browser-id",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    node_labels = {node["label"] for node in body["nodes"]}
    assert {"Profile Graph Song", "Profile Artist", "profile pop"}.issubset(node_labels)
    assert body["stats"]["interactionCount"] == 1


def test_recommender_loads_from_normalized_catalog():
    _fresh_client()
    db = SessionLocal()
    try:
        artist = Artist(name="Normalized Artist")
        db.add(artist)
        db.flush()

        track_a = CatalogTrack(
            id="catalog-a",
            canonical_title="Catalog Seed",
            source_type="catalog",
            release_year=2020,
            duration_ms=200000,
            explicit=False,
            image_url="https://example.com/a.jpg",
            legacy_dataset_track_id="catalog-a",
        )
        track_b = CatalogTrack(
            id="catalog-b",
            canonical_title="Catalog Recommendation",
            source_type="catalog",
            release_year=2021,
            duration_ms=210000,
            explicit=False,
            image_url="https://example.com/b.jpg",
            legacy_dataset_track_id="catalog-b",
        )
        db.add_all([track_a, track_b])
        db.flush()

        db.add_all(
            [
                TrackArtist(track_id="catalog-a", artist_id=artist.id, role="primary", position=0),
                TrackArtist(track_id="catalog-b", artist_id=artist.id, role="primary", position=0),
                AudioFeatures(
                    track_id="catalog-a",
                    valence=0.4,
                    acousticness=0.2,
                    danceability=0.6,
                    energy=0.7,
                    instrumentalness=0.0,
                    liveness=0.1,
                    loudness=-6.0,
                    speechiness=0.03,
                    tempo=120.0,
                    key=5,
                    mode=1,
                    popularity=60,
                    feature_source="test",
                ),
                AudioFeatures(
                    track_id="catalog-b",
                    valence=0.41,
                    acousticness=0.21,
                    danceability=0.59,
                    energy=0.69,
                    instrumentalness=0.0,
                    liveness=0.11,
                    loudness=-6.1,
                    speechiness=0.031,
                    tempo=121.0,
                    key=5,
                    mode=1,
                    popularity=55,
                    feature_source="test",
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    reco = Recommender()
    reco.load()
    recs = reco.recommend(
        seeds=[{"id": "catalog-a", "title": "Catalog Seed", "artist": "Normalized Artist", "year": 2020}],
        n=1,
        mode="all",
    )
    assert len(recs) == 1
    assert recs[0]["id"] == "catalog-b"
    assert recs[0]["title"] == "Catalog Recommendation"


def test_db_status_reports_canonical_catalog_counts():
    _fresh_client()
    db = SessionLocal()
    try:
        artist = Artist(name="Status Artist")
        db.add(artist)
        db.flush()

        track = CatalogTrack(
            id="status-track",
            canonical_title="Status Song",
            source_type="catalog",
            release_year=2024,
            duration_ms=180000,
            explicit=False,
            legacy_dataset_track_id="status-track",
        )
        db.add(track)
        db.flush()

        db.add(TrackArtist(track_id="status-track", artist_id=artist.id, role="primary", position=0))
        db.add(
            AudioFeatures(
                track_id="status-track",
                valence=0.5,
                acousticness=0.2,
                danceability=0.6,
                energy=0.7,
                instrumentalness=0.0,
                liveness=0.1,
                loudness=-7.0,
                speechiness=0.04,
                tempo=118.0,
                key=1,
                mode=1,
                popularity=50,
                feature_source="test",
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    res = client.get("/api/db_status")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["catalog_tracks_exists"] is True
    assert body["audio_features_exists"] is True
    assert body["catalog_ready"] is True
    assert body["catalog_tracks_count"] >= 1
    assert body["audio_features_count"] >= 1


def test_recommend_validation_and_success_stub():
    client = _fresh_client()

    bad = client.post("/api/recommend", json={"seeds": [], "n": 9, "mode": "invalid"})
    assert bad.status_code == 422, bad.text

    class StubRec:
        def recommend(self, *args, **kwargs):
            return [
                {
                    "id": "stub-track-1",
                    "title": "Stub Song",
                    "artist": "Stub Artist",
                    "year": 2024,
                    "reasons": ["test"],
                }
            ]

    with (
        patch("api.get_recommender", return_value=StubRec()),
        patch(
            "api.itunes_track_lookup",
            return_value={
                "imageUrl": "https://example.com/stub.jpg",
                "previewUrl": "https://example.com/stub-preview.m4a",
                "durationMs": 30000,
            },
        ),
    ):
        app.state.recommender_error = ""
        ok = client.post("/api/recommend", json={"seeds": [], "n": 1, "mode": "all"})
        assert ok.status_code == 200, ok.text
        data = ok.json()
        assert isinstance(data.get("recommendations"), list)
        assert data["recommendations"][0]["title"] == "Stub Song"
        assert data["recommendations"][0]["previewUrl"] == "https://example.com/stub-preview.m4a"


def test_recommend_records_impressions_and_passes_engagement_scores():
    client = _fresh_client()

    feedback = client.post(
        "/api/feedback",
        json={
            "track_id": "rewarded-track",
            "event": "play_complete",
            "distinct_id": "listener-prod",
            "source_page": "recommendations",
        },
    )
    assert feedback.status_code == 200, feedback.text

    class StubRec:
        def __init__(self):
            self.kwargs = {}

        def recommend(self, *args, **kwargs):
            self.kwargs = kwargs
            return [
                {
                    "id": "candidate-track",
                    "title": "Candidate Song",
                    "artist": "Candidate Artist",
                    "year": 2024,
                    "imageUrl": "",
                    "reasons": ["test"],
                }
            ]

    stub = StubRec()
    with (
        patch("api.get_recommender", return_value=stub),
        patch("api.spotify_enabled", return_value=False),
        patch("api.itunes_track_lookup", return_value=None),
    ):
        app.state.recommender_error = ""
        res = client.post(
            "/api/recommend",
            headers={"X-Posthog-Distinct-Id": "listener-prod"},
            json={"seeds": [{"title": "seed"}], "n": 1, "mode": "all", "distinct_id": "listener-prod"},
        )

    assert res.status_code == 200, res.text
    body = res.json()
    request_id = body.get("recommendationRequestId")
    assert request_id
    assert body["recommendations"][0]["recommendationRequestId"] == request_id
    assert body["recommendations"][0]["recommendationRank"] == 1
    assert "engagement_scores" in stub.kwargs
    assert stub.kwargs["engagement_scores"].get("rewarded-track", 0) > 0

    db = SessionLocal()
    try:
        impression = (
            db.query(Interaction)
            .filter(
                Interaction.distinct_id == "listener-prod",
                Interaction.track_id == "candidate-track",
                Interaction.event == "impression",
            )
            .first()
        )
        assert impression is not None
        context = json.loads(impression.context_json or "{}")
        assert context["request_id"] == request_id
        assert context["rank"] == 1
    finally:
        db.close()


def test_recommender_agent_writes_reward_artifact(tmp_path):
    _fresh_client()
    db = SessionLocal()
    try:
        artist = Artist(name="Agent Artist")
        db.add(artist)
        db.flush()
        track = CatalogTrack(
            id="agent-upload-track",
            canonical_title="Agent Upload",
            source_type="upload",
            release_year=2025,
            duration_ms=180000,
            explicit=False,
            is_published=True,
        )
        db.add(track)
        db.add(TrackArtist(track_id=track.id, artist_id=artist.id, role="primary", position=0))
        db.add(
            Interaction(
                distinct_id="agent-user",
                track_id=track.id,
                event="impression",
                context_json=json.dumps({"request_id": "agent-request", "rank": 1}),
            )
        )
        db.add(
            Interaction(
                distinct_id="agent-user",
                track_id=track.id,
                event="save",
                context_json=json.dumps({"request_id": "agent-request", "rank": 1}),
            )
        )
        db.add(
            Interaction(
                distinct_id="agent-user",
                track_id=track.id,
                event="play_complete",
                context_json=json.dumps({"request_id": "agent-request", "rank": 1}),
            )
        )
        db.commit()

        artifact = compute_reward_artifact(db)
        assert artifact["trackCount"] == 1
        assert artifact["tracks"]["agent-upload-track"]["score"] > 0
        assert artifact["tracks"]["agent-upload-track"]["musicianFirstBoost"] > 0

        path = tmp_path / "reward_scores.json"
        written = write_reward_artifact(path=path, db=db)
        assert written["trackCount"] == 1
        scores = load_reward_scores(path=path)
        assert scores["agent-upload-track"] > 0
        artifacts = list_reward_artifacts(path=path)
        assert any(item["current"] for item in artifacts["artifacts"])

        db.add(Interaction(distinct_id="agent-user", track_id=track.id, event="skip"))
        db.commit()
        second = write_reward_artifact(path=path, db=db)
        assert second["trackCount"] == 1
        previous = path.with_name("reward_scores.previous.json")
        assert previous.exists()
        rolled_back = rollback_reward_artifact(path=path)
        assert rolled_back["restored"] == "reward_scores.previous.json"

        dataset_path = tmp_path / "training_dataset.jsonl"
        dataset = write_training_dataset(path=dataset_path, db=db, days=30)
        assert dataset["rowCount"] == 1
        ranker_path = tmp_path / "ranker_scores.json"
        ranker = train_ranker_artifact(path=ranker_path, dataset=dataset_path, db=db, days=30)
        assert ranker["trackCount"] == 1
        assert load_ranker_scores(path=ranker_path)["agent-upload-track"] > 0
        metrics = compute_recommender_metrics(db, days=7)
        assert metrics["impressions"] == 1
        assert metrics["rates"]["completion"] == 1.0
        evaluation = evaluate_reward_artifact(db, path=path, days=30)
        assert evaluation["artifactTrackCount"] == 1
        assert evaluation["impressionsWithOutcome"] == 1
    finally:
        db.close()


def test_recommender_agent_can_store_artifacts_in_database(tmp_path):
    previous_store = os.environ.get("RECOMMENDER_ARTIFACT_STORE")
    previous_dataset = os.environ.get("RECOMMENDER_TRAINING_DATASET")
    os.environ["RECOMMENDER_ARTIFACT_STORE"] = "database"
    os.environ["RECOMMENDER_TRAINING_DATASET"] = str(tmp_path / "db_training_dataset.jsonl")
    _fresh_client()
    db = SessionLocal()
    try:
        track = CatalogTrack(
            id="db-agent-track",
            canonical_title="DB Agent Track",
            source_type="upload",
            duration_ms=180000,
            explicit=False,
            is_published=True,
        )
        db.add(track)
        db.add(
            Interaction(
                distinct_id="db-agent-user",
                track_id=track.id,
                event="impression",
                context_json=json.dumps({"request_id": "db-agent-request", "rank": 1}),
            )
        )
        db.add(
            Interaction(
                distinct_id="db-agent-user",
                track_id=track.id,
                event="save",
                context_json=json.dumps({"request_id": "db-agent-request", "rank": 1}),
            )
        )
        db.commit()

        artifact = write_reward_artifact(db=db)
        assert artifact["artifactStore"] == "database"
        assert artifact["trackCount"] == 1
        assert load_reward_scores(db=db)["db-agent-track"] > 0

        first_name = artifact["artifactName"]
        db.add(Interaction(distinct_id="db-agent-user", track_id=track.id, event="skip"))
        db.commit()
        second = write_reward_artifact(db=db)
        assert second["artifactName"] != first_name

        artifacts = list_reward_artifacts(db=db)
        assert artifacts["store"] == "database"
        assert len(artifacts["artifacts"]) == 2
        assert sum(1 for item in artifacts["artifacts"] if item["current"]) == 1

        rollback = rollback_reward_artifact(db=db)
        assert rollback["store"] == "database"
        assert rollback["restored"] == first_name

        ranker = train_ranker_artifact(db=db, days=30)
        assert ranker["artifactStore"] == "database"
        assert load_ranker_scores(db=db)["db-agent-track"] > 0
        assert db.query(RecommenderArtifact).count() == 3
    finally:
        db.close()
        if previous_store is None:
            os.environ.pop("RECOMMENDER_ARTIFACT_STORE", None)
        else:
            os.environ["RECOMMENDER_ARTIFACT_STORE"] = previous_store
        if previous_dataset is None:
            os.environ.pop("RECOMMENDER_TRAINING_DATASET", None)
        else:
            os.environ["RECOMMENDER_TRAINING_DATASET"] = previous_dataset


def test_admin_can_refresh_recommender_reward_artifact(tmp_path):
    previous_artifact = os.environ.get("RECOMMENDER_REWARD_ARTIFACT")
    previous_dataset = os.environ.get("RECOMMENDER_TRAINING_DATASET")
    previous_ranker = os.environ.get("RECOMMENDER_RANKER_ARTIFACT")
    os.environ["RECOMMENDER_REWARD_ARTIFACT"] = str(tmp_path / "admin_reward_scores.json")
    os.environ["RECOMMENDER_TRAINING_DATASET"] = str(tmp_path / "admin_training_dataset.jsonl")
    os.environ["RECOMMENDER_RANKER_ARTIFACT"] = str(tmp_path / "admin_ranker_scores.json")
    client = _fresh_client()
    try:
        db = SessionLocal()
        try:
            db.add(Interaction(distinct_id="admin-agent-user", track_id="admin-track", event="like"))
            db.commit()
        finally:
            db.close()

        denied = client.post("/api/admin/recommender/reward-artifact")
        assert denied.status_code == 403, denied.text

        ok = client.post(
            "/api/admin/recommender/reward-artifact",
            headers={"X-Admin-Api-Key": "test-admin-key"},
        )
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body["ok"] is True
        assert body["trackCount"] >= 1

        metrics = client.get(
            "/api/admin/recommender/metrics?days=7",
            headers={"X-Admin-Api-Key": "test-admin-key"},
        )
        assert metrics.status_code == 200, metrics.text
        assert metrics.json()["events"]["like"] == 1

        evaluation = client.get(
            "/api/admin/recommender/evaluation?days=30",
            headers={"X-Admin-Api-Key": "test-admin-key"},
        )
        assert evaluation.status_code == 200, evaluation.text
        assert "pairwiseAccuracy" in evaluation.json()

        artifacts = client.get(
            "/api/admin/recommender/artifacts",
            headers={"X-Admin-Api-Key": "test-admin-key"},
        )
        assert artifacts.status_code == 200, artifacts.text
        assert artifacts.json()["artifacts"]

        dataset = client.post(
            "/api/admin/recommender/training-dataset",
            headers={"X-Admin-Api-Key": "test-admin-key"},
            json={"days": 30},
        )
        assert dataset.status_code == 200, dataset.text
        assert dataset.json()["rowCount"] >= 0

        trained = client.post(
            "/api/admin/recommender/train-ranker",
            headers={"X-Admin-Api-Key": "test-admin-key"},
            json={"days": 30},
        )
        assert trained.status_code == 200, trained.text
        assert "ranker" in trained.json()

        rollback = client.post(
            "/api/admin/recommender/rollback",
            headers={"X-Admin-Api-Key": "test-admin-key"},
            json={},
        )
        assert rollback.status_code in {200, 404}, rollback.text
    finally:
        if previous_artifact is None:
            os.environ.pop("RECOMMENDER_REWARD_ARTIFACT", None)
        else:
            os.environ["RECOMMENDER_REWARD_ARTIFACT"] = previous_artifact
        if previous_dataset is None:
            os.environ.pop("RECOMMENDER_TRAINING_DATASET", None)
        else:
            os.environ["RECOMMENDER_TRAINING_DATASET"] = previous_dataset
        if previous_ranker is None:
            os.environ.pop("RECOMMENDER_RANKER_ARTIFACT", None)
        else:
            os.environ["RECOMMENDER_RANKER_ARTIFACT"] = previous_ranker


def test_spotify_callback_error_paths():
    client = _fresh_client()

    denied = client.get("/api/spotify/callback?error=access_denied", follow_redirects=False)
    assert denied.status_code in (302, 307), denied.text
    assert "spotify_error=access_denied" in (denied.headers.get("location") or "")

    invalid_state = client.get(
        "/api/spotify/callback?code=test-code&state=wrong",
        cookies={"sp_st": "expected", "sp_ru": "http://localhost:8000/api/spotify/callback"},
        follow_redirects=False,
    )
    assert invalid_state.status_code in (302, 307), invalid_state.text
    assert "spotify_error=invalid_state" in (invalid_state.headers.get("location") or "")


def test_error_response_contains_error_id_and_request_id_header():
    client = _fresh_client()
    req_id = "req-test-123"
    r = client.post(
        "/api/feedback",
        headers={"X-Request-ID": req_id},
        json={"track_id": "t1", "event": "not_allowed"},
    )
    assert r.status_code == 400, r.text
    body = r.json()
    assert "error_id" in body
    assert body["error"] == "Invalid event"
    assert r.headers.get("x-request-id") == req_id


def test_admin_lock_unlock_and_audit_logs():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={"name": "Lock User", "email": "lockme@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text

    # Find user id through /auth/me
    token = signup.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    user_id = me.json()["id"]

    lock = client.post(
        f"/api/admin/users/{user_id}/lock",
        headers={"X-Admin-Api-Key": "test-admin-key"},
        json={"minutes": 10, "reason": "suspicious_activity"},
    )
    assert lock.status_code == 200, lock.text
    assert lock.json()["ok"] is True

    blocked_login = client.post(
        "/api/auth/login",
        json={"email": "lockme@example.com", "password": "password123"},
    )
    assert blocked_login.status_code == 423, blocked_login.text

    blocked_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert blocked_me.status_code == 423, blocked_me.text

    blocked_refresh = client.post("/api/auth/refresh")
    assert blocked_refresh.status_code in {401, 423}, blocked_refresh.text

    unlock = client.post(
        f"/api/admin/users/{user_id}/unlock",
        headers={"X-Admin-Api-Key": "test-admin-key"},
    )
    assert unlock.status_code == 200, unlock.text
    assert unlock.json()["ok"] is True

    ok_login = client.post(
        "/api/auth/login",
        json={"email": "lockme@example.com", "password": "password123"},
    )
    assert ok_login.status_code == 200, ok_login.text

    logs = client.get("/api/admin/audit-logs?limit=20", headers={"X-Admin-Api-Key": "test-admin-key"})
    assert logs.status_code == 200, logs.text
    actions = [x.get("action") for x in logs.json().get("logs", [])]
    assert "admin_lock_user" in actions
    assert "admin_unlock_user" in actions


def test_bruteforce_protection_blocks_repeated_failed_logins():
    client = _fresh_client()
    email = "bruteforce@example.com"
    client.post("/api/auth/signup", json={"name": "BF", "email": email, "password": "password123"})

    last_status = 0
    for _ in range(12):
        res = client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
        last_status = res.status_code
        if res.status_code == 429:
            break

    assert last_status == 429, "Expected brute-force guard to eventually return 429"
