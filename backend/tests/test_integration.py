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
os.environ.setdefault("REQUIRE_AUTH_UPLOADS", "true")
os.environ.setdefault("UPLOAD_SECRET", "")
os.environ.setdefault("SPOTIFY_CLIENT_ID", "test-client")
os.environ.setdefault("SPOTIFY_CLIENT_SECRET", "test-secret")
os.environ.setdefault("FRONTEND_URL", "http://localhost:8080")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key")

from api import app  # noqa: E402
from db import engine  # noqa: E402
from models import Base  # noqa: E402


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
