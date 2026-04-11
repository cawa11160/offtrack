import os
import sys
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

# Ensure backend module directory is importable when tests are run from repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Test env must be set before importing backend modules that build engine/app.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_offtrack.sqlite3")
os.environ.setdefault("MEDIA_DIR", str(BACKEND_DIR / "tests" / ".tmp_media"))
os.environ.setdefault("REQUIRE_AUTH_UPLOADS", "true")
os.environ.setdefault("UPLOAD_SECRET", "")
os.environ.setdefault("SPOTIFY_CLIENT_ID", "test-client")
os.environ.setdefault("SPOTIFY_CLIENT_SECRET", "test-secret")
os.environ.setdefault("FRONTEND_URL", "http://localhost:8080")
os.environ["ADMIN_API_KEY"] = "test-admin-key"

from api import app  # noqa: E402
from catalog_sync import ensure_catalog_backfill  # noqa: E402
from db import SessionLocal, engine  # noqa: E402
from models import Artist, AudioAsset, AudioFeatures, Base, CatalogTrack, Track, TrackArtist  # noqa: E402
from recommender import Recommender  # noqa: E402


def _fresh_client() -> TestClient:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return TestClient(app)


def test_auth_signup_login_and_upload_authorization():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={"name": "Artist One", "email": "artist1@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]
    assert token

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "artist1@example.com"

    # Upload should be blocked when auth is missing.
    unauth_upload = client.post(
        "/api/uploads",
        data={"title": "NoAuth Song", "artist": "NoAuth"},
        files={"file": ("song.mp3", b"FAKEAUDIO", "audio/mpeg")},
    )
    assert unauth_upload.status_code == 401, unauth_upload.text

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


def test_upload_persists_to_normalized_catalog_tables():
    client = _fresh_client()

    signup = client.post(
        "/api/auth/signup",
        json={"name": "Artist Two", "email": "artist2@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
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
        json={"name": "Artist Search", "email": "artist-search@example.com", "password": "password123"},
    )
    assert signup.status_code == 200, signup.text
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

    with patch("api.get_recommender", return_value=StubRec()):
        app.state.recommender_error = ""
        ok = client.post("/api/recommend", json={"seeds": [], "n": 1, "mode": "all"})
        assert ok.status_code == 200, ok.text
        data = ok.json()
        assert isinstance(data.get("recommendations"), list)
        assert data["recommendations"][0]["title"] == "Stub Song"


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
