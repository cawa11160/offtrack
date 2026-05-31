from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
import uuid
import mimetypes
import re
import logging
import threading
from typing import List, Optional, Dict, Any
from urllib.parse import quote, urlparse
from functools import lru_cache
from pathlib import Path

import requests
try:
    import redis  # type: ignore
except Exception:  # pragma: no cover - optional dependency in some envs
    redis = None
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Body, Depends, FastAPI, HTTPException, Request, Response, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from db import get_db, SessionLocal, engine, wait_for_db
from models import (
    Artist,
    AudioAsset,
    AudioFeatures,
    Base,
    CatalogSyncRun,
    CatalogTrack,
    ExternalTrackRef,
    Genre,
    Interaction,
    LyricReel,
    Notification,
    Track,
    TrackArtist,
    TrackAudio,
    TrackGenre,
    UploadDiscoveryControl,
    UploadedTrack,
    User,
    UserSettings,
)
from models import PaymentMethod, BillingReceipt, RefreshSession, SecurityAuditLog
from recommender import get_recommender
from recommender_agent import (
    compute_recommender_metrics,
    evaluate_reward_artifact,
    list_reward_artifacts,
    load_ranker_scores,
    load_reward_scores,
    rollback_reward_artifact,
    train_ranker_artifact,
    write_reward_artifact,
    write_training_dataset,
)
from analytics import get_analytics
from audio_processing import process_audio_file, validate_audio_upload
from catalog_sync import ensure_catalog_backfill, parse_artist_names as _sync_parse_artist_names
from catalog_ingest import catalog_sync_status, sync_current_catalog
from storage import is_remote_storage_path, remote_redirect_response, save_upload_file, storage_backend, storage_backend_for_path

from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.responses import PlainTextResponse
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Offtrack API")
log = logging.getLogger("offtrack.api")


def _env_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _runtime_env() -> str:
    return (os.getenv("OFFTRACK_ENV") or os.getenv("ENV") or "development").strip().lower()


def _in_production() -> bool:
    return _runtime_env() in {"prod", "production"}


def _read_secret(name: str, default: str, *, min_len: int = 32) -> str:
    value = os.getenv(name, default).strip()
    if _in_production() and (not value or value == default or len(value) < min_len):
        raise RuntimeError(f"{name} must be set to a strong value in production")
    return value


def _constant_time_equals(left: str, right: str) -> bool:
    return bool(left) and bool(right) and secrets.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def _validate_production_runtime_config() -> None:
    if not _in_production():
        return

    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if not frontend_url.startswith("https://"):
        raise RuntimeError("FRONTEND_URL must be an https URL in production")

    origins = [origin.strip() for origin in os.getenv("ALLOW_ORIGINS", "").split(",") if origin.strip()]
    if not origins:
        raise RuntimeError("ALLOW_ORIGINS must be set in production")
    if "*" in origins:
        raise RuntimeError("ALLOW_ORIGINS cannot be '*' in production")
    if any(origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1") for origin in origins):
        raise RuntimeError("ALLOW_ORIGINS cannot include localhost origins in production")

    backend = storage_backend()
    if backend in {"", "local", "disk", "filesystem"} and not _env_bool("ALLOW_LOCAL_MEDIA_IN_PRODUCTION", "false"):
        raise RuntimeError("MEDIA_STORAGE_BACKEND must be s3 or r2 in production")
    if backend in {"s3", "r2"}:
        required = {
            "S3_BUCKET": os.getenv("S3_BUCKET", "").strip(),
            "S3_ACCESS_KEY_ID/AWS_ACCESS_KEY_ID": os.getenv("S3_ACCESS_KEY_ID", "").strip()
            or os.getenv("AWS_ACCESS_KEY_ID", "").strip(),
            "S3_SECRET_ACCESS_KEY/AWS_SECRET_ACCESS_KEY": os.getenv("S3_SECRET_ACCESS_KEY", "").strip()
            or os.getenv("AWS_SECRET_ACCESS_KEY", "").strip(),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Remote media storage is missing required production env vars: {', '.join(missing)}")

try:
    from spotify_auth import router as spotify_router
    app.include_router(spotify_router)
except Exception:
    # Spotify auth endpoints are optional in local/dev environments.
    pass

# -----------------------------
# Media storage (full-song uploads)
# -----------------------------
# For local Docker/production: set MEDIA_DIR explicitly (e.g. /app/media).
# For tests/CI/local without explicit MEDIA_DIR, default to a writable repo-local path.
DEFAULT_MEDIA_DIR = (Path(__file__).resolve().parent / "media")
MEDIA_DIR = Path(os.getenv("MEDIA_DIR", str(DEFAULT_MEDIA_DIR))).resolve()
MEDIA_TRACKS_DIR = MEDIA_DIR / "tracks"       # full audio for existing catalog tracks
MEDIA_UPLOADS_DIR = MEDIA_DIR / "uploads"     # uploaded track catalog
MEDIA_REELS_DIR = MEDIA_DIR / "reels"         # generated lyric reels (mp4)
MEDIA_REEL_ASSETS_DIR = MEDIA_DIR / "reel_assets"  # temporary generated images
MEDIA_TRACKS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_REELS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_REEL_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

UPLOAD_SECRET = os.getenv("UPLOAD_SECRET", "").strip()  # optional
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))  # keep reasonable for MVP
REQUIRE_AUTH_UPLOADS = os.getenv("REQUIRE_AUTH_UPLOADS", "true").strip().lower() in ("1", "true", "yes")

# Basic in-memory rate limiting and auth brute-force protection.
RATE_LIMIT_LOGIN_PER_MIN = int(os.getenv("RATE_LIMIT_LOGIN_PER_MIN", "30"))
RATE_LIMIT_SIGNUP_PER_MIN = int(os.getenv("RATE_LIMIT_SIGNUP_PER_MIN", "20"))
RATE_LIMIT_UPLOAD_PER_MIN = int(os.getenv("RATE_LIMIT_UPLOAD_PER_MIN", "20"))
BRUTE_FORCE_MAX_FAILS = int(os.getenv("BRUTE_FORCE_MAX_FAILS", "8"))
BRUTE_FORCE_WINDOW_SEC = int(os.getenv("BRUTE_FORCE_WINDOW_SEC", "300"))
BRUTE_FORCE_BLOCK_SEC = int(os.getenv("BRUTE_FORCE_BLOCK_SEC", "600"))
RATE_LIMIT_BACKEND = (os.getenv("RATE_LIMIT_BACKEND", "memory").strip().lower() or "memory")
REDIS_URL = (os.getenv("REDIS_URL", "").strip() or "redis://localhost:6379/0")
TRUST_PROXY_HEADERS = _env_bool("TRUST_PROXY_HEADERS", "false")
def _admin_api_key() -> str:
    return (os.getenv("ADMIN_API_KEY", "").strip())
_rate_lock = threading.Lock()
_rate_state: Dict[str, List[float]] = {}
_auth_fail_state: Dict[str, Dict[str, float]] = {}
_redis_client = None

if RATE_LIMIT_BACKEND == "redis" and redis is not None:
    try:
        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
    except Exception:
        _redis_client = None


def _client_ip(req: Request) -> str:
    xff = (req.headers.get("x-forwarded-for") or "").strip()
    if TRUST_PROXY_HEADERS and xff:
        return xff.split(",")[0].strip()
    if req.client and req.client.host:
        return req.client.host
    return "unknown"


def _rate_limit_check(key: str, limit: int, window_sec: int = 60) -> tuple[bool, int]:
    if _redis_client is not None:
        now = int(time.time())
        bucket = now // max(1, window_sec)
        redis_key = f"rl:{key}:{bucket}"
        try:
            count = int(_redis_client.incr(redis_key))
            if count == 1:
                _redis_client.expire(redis_key, max(1, window_sec + 2))
            if count > max(1, int(limit)):
                retry_after = max(1, window_sec - (now % max(1, window_sec)))
                return False, retry_after
            return True, 0
        except Exception:
            # fall back to in-memory limiter on Redis outage
            pass

    now = time.time()
    with _rate_lock:
        bucket = _rate_state.get(key, [])
        bucket = [t for t in bucket if now - t < window_sec]
        if len(bucket) >= max(1, int(limit)):
            retry_after = int(max(1, window_sec - (now - bucket[0])))
            _rate_state[key] = bucket
            return False, retry_after
        bucket.append(now)
        _rate_state[key] = bucket
        return True, 0


def _enforce_rate_limit(scope: str, req: Request, limit: int, window_sec: int = 60) -> None:
    key = f"{scope}:{_client_ip(req)}"
    ok, retry_after = _rate_limit_check(key, limit=limit, window_sec=window_sec)
    if not ok:
        raise HTTPException(status_code=429, detail=f"Too many requests. Retry in {retry_after}s.")


def _auth_failure_key(email: str, ip: str) -> str:
    return f"{email.lower().strip()}|{ip}"


def _check_auth_bruteforce(email: str, ip: str) -> None:
    key = _auth_failure_key(email, ip)
    now = int(time.time())
    if _redis_client is not None:
        rkey = f"bf:{key}"
        try:
            blocked_until = int(_redis_client.hget(rkey, "blocked_until") or 0)
            if now < blocked_until:
                retry_after = max(1, blocked_until - now)
                raise HTTPException(status_code=429, detail=f"Too many failed login attempts. Retry in {retry_after}s.")
            return
        except HTTPException:
            raise
        except Exception:
            pass

    with _rate_lock:
        info = _auth_fail_state.get(key)
        if not info:
            return
        blocked_until = float(info.get("blocked_until", 0))
        if now < blocked_until:
            retry_after = int(max(1, blocked_until - now))
            raise HTTPException(status_code=429, detail=f"Too many failed login attempts. Retry in {retry_after}s.")


def _record_auth_result(email: str, ip: str, ok: bool) -> None:
    key = _auth_failure_key(email, ip)
    now = int(time.time())
    if _redis_client is not None:
        rkey = f"bf:{key}"
        try:
            if ok:
                _redis_client.delete(rkey)
                return
            first = int(_redis_client.hget(rkey, "first") or 0)
            count = int(_redis_client.hget(rkey, "count") or 0)
            if first <= 0 or now - first > BRUTE_FORCE_WINDOW_SEC:
                first = now
                count = 0
            count += 1
            blocked_until = 0
            if count >= max(1, BRUTE_FORCE_MAX_FAILS):
                blocked_until = now + max(1, BRUTE_FORCE_BLOCK_SEC)
                count = 0
                first = now
            _redis_client.hset(rkey, mapping={"first": first, "count": count, "blocked_until": blocked_until})
            _redis_client.expire(rkey, max(BRUTE_FORCE_WINDOW_SEC, BRUTE_FORCE_BLOCK_SEC) + 60)
            return
        except Exception:
            pass

    with _rate_lock:
        if ok:
            _auth_fail_state.pop(key, None)
            return
        info = _auth_fail_state.get(key, {"count": 0, "first": now, "blocked_until": 0})
        first = float(info.get("first", now))
        if now - first > BRUTE_FORCE_WINDOW_SEC:
            info = {"count": 0, "first": now, "blocked_until": 0}
        info["count"] = int(info.get("count", 0)) + 1
        if int(info["count"]) >= max(1, BRUTE_FORCE_MAX_FAILS):
            info["blocked_until"] = now + max(1, BRUTE_FORCE_BLOCK_SEC)
            info["count"] = 0
            info["first"] = now
        _auth_fail_state[key] = info


def _check_upload_secret(request: Request) -> bool:
    """If UPLOAD_SECRET is set, require it in a header.

    This keeps your demo instance from becoming an open file drop.
    """
    if not UPLOAD_SECRET:
        return True
    return _has_valid_upload_secret(request)


def _has_valid_upload_secret(request: Request) -> bool:
    got = (request.headers.get("X-Upload-Secret") or "").strip()
    return _constant_time_equals(got, UPLOAD_SECRET)


def _guess_mime_and_ext(filename: str | None, content_type: str | None) -> tuple[str, str]:
    try:
        validate_audio_upload(filename, content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ct = (content_type or "").split(";")[0].strip() or "audio/mpeg"
    name = (filename or "").strip()
    ext = ""
    if name and "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()

    # Basic allow-list so we don't write weird extensions.
    if ext not in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
        # fall back to mime inference
        ext = mimetypes.guess_extension(ct) or ".mp3"
        if ext == ".mpga":  # some systems map audio/mpeg -> .mpga
            ext = ".mp3"

    # normalize some mimes
    if ct in {"audio/mp3", "audio/mpeg"}:
        ct = "audio/mpeg"
    return ct, ext


def _parse_range_header(range_header: str | None, file_size: int) -> tuple[int, int] | None:
    """Parse `Range: bytes=start-end`.

    Returns (start, end) inclusive. If header invalid, returns None.
    """
    if not range_header:
        return None
    m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
    if not m:
        return None
    start_s, end_s = m.group(1), m.group(2)
    if start_s == "" and end_s == "":
        return None
    if start_s == "":
        # suffix bytes: bytes=-500
        suffix = int(end_s)
        if suffix <= 0:
            return None
        start = max(0, file_size - suffix)
        end = file_size - 1
        return start, end
    start = int(start_s)
    if start < 0 or start >= file_size:
        return None
    if end_s == "":
        end = file_size - 1
    else:
        end = int(end_s)
        end = min(end, file_size - 1)
        if end < start:
            return None
    return start, end


def _stream_file(path: Path | str, mime_type: str, request: Request):
    """Stream a file with HTTP Range support.

    This makes `<audio ...>` seeking work in browsers (and stops large files from being
    downloaded from byte 0 every time).
    """
    if is_remote_storage_path(path):
        return remote_redirect_response(str(path))

    path = Path(path).resolve()
    try:
        path.relative_to(MEDIA_DIR)
    except ValueError:
        log.warning("Blocked media stream outside MEDIA_DIR", extra={"media_path": str(path)})
        raise HTTPException(status_code=404, detail="Audio file not found")
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")

    size = path.stat().st_size
    range_header = request.headers.get("range")
    rng = _parse_range_header(range_header, size)

    def iter_bytes(start: int, length: int, chunk_size: int = 1024 * 1024):
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
    }

    if rng is None:
        headers["Content-Length"] = str(size)
        return StreamingResponse(iter_bytes(0, size), media_type=mime_type, headers=headers)

    start, end = rng
    length = end - start + 1
    headers.update(
        {
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
        }
    )
    return StreamingResponse(iter_bytes(start, length), status_code=206, media_type=mime_type, headers=headers)

# -----------------------------
# CORS
# -----------------------------
ALLOW_ORIGINS = os.getenv(
    "ALLOW_ORIGINS",
    "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
).split(",")
ALLOW_ORIGINS = [o.strip() for o in ALLOW_ORIGINS if o.strip()]
ALLOW_CREDENTIALS = "*" not in ALLOW_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = (request.headers.get("x-request-id") or "").strip() or uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    rid = getattr(request.state, "request_id", uuid.uuid4().hex)
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(status_code=exc.status_code, content={"error": detail, "error_id": rid})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", uuid.uuid4().hex)
    log.exception("Unhandled backend error", extra={"error_id": rid, "path": str(request.url.path)})
    return JSONResponse(status_code=500, content={"error": "Internal server error", "error_id": rid})


# -----------------------------
# Auth (email/password + JWT)
# -----------------------------
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

# Legacy verifier for hashes created before the scrypt migration.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

JWT_SECRET = _read_secret("JWT_SECRET", "dev_change_me", min_len=32)
JWT_ALG = os.getenv("JWT_ALG", "HS256").strip().upper() or "HS256"
if JWT_ALG not in {"HS256", "HS384", "HS512"}:
    raise RuntimeError("JWT_ALG must be one of HS256, HS384, or HS512")
ACCESS_TTL_MIN = int(os.getenv("ACCESS_TTL_MIN", "30"))
REFRESH_TTL_DAYS = int(os.getenv("REFRESH_TTL_DAYS", "30"))
PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "10"))
PASSWORD_SCRYPT_N_LOG2 = int(os.getenv("PASSWORD_SCRYPT_N_LOG2", "14"))
PASSWORD_SCRYPT_R = int(os.getenv("PASSWORD_SCRYPT_R", "8"))
PASSWORD_SCRYPT_P = int(os.getenv("PASSWORD_SCRYPT_P", "1"))
PASSWORD_SCRYPT_DKLEN = int(os.getenv("PASSWORD_SCRYPT_DKLEN", "64"))
PASSWORD_SCRYPT_MAXMEM_MB = int(os.getenv("PASSWORD_SCRYPT_MAXMEM_MB", "64"))
EMAIL_VERIFICATION_TOKEN_TTL_HOURS = int(os.getenv("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", "24"))
EMAIL_VERIFICATION_REQUIRED_FOR_ARTIST_UPLOADS = (
    os.getenv("EMAIL_VERIFICATION_REQUIRED_FOR_ARTIST_UPLOADS", "true").strip().lower() in ("1", "true", "yes", "on")
)

REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "offtrack_refresh").strip() or "offtrack_refresh"
COOKIE_SECURE = _env_bool("COOKIE_SECURE", "false")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()  # lax|strict|none
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    COOKIE_SAMESITE = "lax"

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_WHITESPACE_RE = re.compile(r"\s+")


def _scrypt_params() -> tuple[int, int, int, int, int]:
    n_log2 = max(14, min(20, PASSWORD_SCRYPT_N_LOG2))
    r = max(1, min(32, PASSWORD_SCRYPT_R))
    p = max(1, min(16, PASSWORD_SCRYPT_P))
    dklen = max(32, min(128, PASSWORD_SCRYPT_DKLEN))
    maxmem = max(32, PASSWORD_SCRYPT_MAXMEM_MB) * 1024 * 1024
    return n_log2, r, p, dklen, maxmem


def _hash_password(pw: str) -> str:
    n_log2, r, p, dklen, maxmem = _scrypt_params()
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        pw.encode("utf-8"),
        salt=salt,
        n=2**n_log2,
        r=r,
        p=p,
        dklen=dklen,
        maxmem=maxmem,
    )
    return (
        f"scrypt$ln={n_log2},r={r},p={p},dk={dklen}"
        f"${base64.urlsafe_b64encode(salt).decode('ascii')}"
        f"${base64.urlsafe_b64encode(digest).decode('ascii')}"
    )


def _verify_scrypt_password(pw: str, pw_hash: str) -> bool:
    try:
        scheme, params_raw, salt_raw, digest_raw = pw_hash.split("$", 3)
        if scheme != "scrypt":
            return False
        params = {}
        for pair in params_raw.split(","):
            key, value = pair.split("=", 1)
            params[key] = int(value)
        n_log2 = int(params["ln"])
        r = int(params["r"])
        p = int(params["p"])
        dklen = int(params["dk"])
        salt = base64.urlsafe_b64decode(salt_raw.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_raw.encode("ascii"))
        _, _, _, _, maxmem = _scrypt_params()
        actual = hashlib.scrypt(
            pw.encode("utf-8"),
            salt=salt,
            n=2**n_log2,
            r=r,
            p=p,
            dklen=dklen,
            maxmem=maxmem,
        )
        return secrets.compare_digest(actual, expected)
    except Exception:
        return False

def _verify_password(pw: str, pw_hash: str) -> bool:
    if (pw_hash or "").startswith("scrypt$"):
        return _verify_scrypt_password(pw, pw_hash)
    try:
        return pwd_context.verify(pw, pw_hash)
    except Exception:
        return False


def _password_hash_needs_update(pw_hash: str) -> bool:
    if not (pw_hash or "").startswith("scrypt$"):
        return True
    try:
        _, params_raw, _, _ = pw_hash.split("$", 3)
        current = _scrypt_params()
        wanted = {
            "ln": current[0],
            "r": current[1],
            "p": current[2],
            "dk": current[3],
        }
        actual = {}
        for pair in params_raw.split(","):
            key, value = pair.split("=", 1)
            actual[key] = int(value)
        return any(actual.get(key) != value for key, value in wanted.items())
    except Exception:
        return True


def _verify_and_upgrade_password(db: Session, user: User, password: str) -> bool:
    if not _verify_password(password, user.password_hash):
        return False
    if _password_hash_needs_update(user.password_hash):
        user.password_hash = _hash_password(password)
        db.add(user)
    return True

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc_datetime(value: Any) -> datetime | None:
    """Normalize DB datetime values to timezone-aware UTC."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None
    return None

def _encode(payload: dict) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def _decode(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def _hash_email_verification_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_email_verification(user: User) -> str:
    token = secrets.token_urlsafe(32)
    user.email_verification_token_hash = _hash_email_verification_token(token)
    user.email_verification_sent_at = _now_utc()
    return token


def _verification_url(req: Request, token: str) -> str:
    return f"{req.url_for('auth_verify_email')}?token={quote(token)}"


def _email_verified(user: User) -> bool:
    return _coerce_utc_datetime(getattr(user, "email_verified_at", None)) is not None


def _normalize_auth_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not email or len(email) > 254 or _CONTROL_CHARS_RE.search(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def _sanitize_optional_http_url(value: str | None, field_name: str = "URL") -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if len(raw) > 2000 or _CONTROL_CHARS_RE.search(raw):
        raise HTTPException(status_code=422, detail=f"Enter a valid {field_name}.")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=422, detail=f"{field_name} must be an http or https URL.")
    return raw


def _sanitize_display_name(value: str | None) -> str | None:
    name = _CONTROL_CHARS_RE.sub("", value or "")
    name = _WHITESPACE_RE.sub(" ", name).strip()
    if not name:
        return None
    if len(name) > 120:
        raise HTTPException(status_code=422, detail="Name must be 120 characters or fewer.")
    return name


def _validate_password_input(password: str) -> None:
    if "\x00" in (password or "") or _CONTROL_CHARS_RE.search(password or ""):
        raise HTTPException(status_code=422, detail="Password contains unsupported characters.")


def _password_policy_error(password: str) -> str | None:
    _validate_password_input(password)
    if len(password or "") < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters."
    if not any(ch.isalpha() for ch in password):
        return "Password must include at least one letter."
    if not any(ch.isdigit() for ch in password):
        return "Password must include at least one number."
    return None

def _create_access_token(user_id: int) -> str:
    now = _now_utc()
    exp = now + timedelta(minutes=ACCESS_TTL_MIN)
    return _encode({"sub": str(user_id), "type": "access", "iat": int(now.timestamp()), "exp": int(exp.timestamp())})

def _encode_refresh_token(user_id: int, session_id: str, expires_at: datetime) -> str:
    now = _now_utc()
    return _encode(
        {
            "sub": str(user_id),
            "type": "refresh",
            "jti": session_id,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
    )


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _create_refresh_session(db: Session, user_id: int, req: Request) -> tuple[str, RefreshSession]:
    session_id = str(uuid.uuid4())
    expires_at = _now_utc() + timedelta(days=REFRESH_TTL_DAYS)
    token = _encode_refresh_token(user_id, session_id, expires_at)
    row = RefreshSession(
        id=session_id,
        user_id=int(user_id),
        token_hash=_hash_refresh_token(token),
        expires_at=expires_at,
        ip=_client_ip(req),
        user_agent=(req.headers.get("user-agent") or "")[:1000] or None,
    )
    db.add(row)
    return token, row


def _revoke_refresh_session(row: RefreshSession, replaced_by_session_id: str | None = None) -> None:
    if not getattr(row, "revoked_at", None):
        row.revoked_at = _now_utc()
    if replaced_by_session_id:
        row.replaced_by_session_id = replaced_by_session_id


def _revoke_user_refresh_sessions(db: Session, user_id: int) -> int:
    now = _now_utc()
    rows = (
        db.query(RefreshSession)
        .filter(RefreshSession.user_id == int(user_id), RefreshSession.revoked_at.is_(None))
        .all()
    )
    for row in rows:
        row.revoked_at = now
    return len(rows)


def _refresh_session_from_token(db: Session, token: str) -> tuple[dict, User, RefreshSession]:
    try:
        data = _decode(token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(data["sub"])
        session_id = str(data["jti"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        row = db.query(RefreshSession).filter(RefreshSession.id == session_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if not row or int(row.user_id) != int(user_id) or row.token_hash != _hash_refresh_token(token):
        raise HTTPException(status_code=401, detail="Invalid refresh session")

    if getattr(row, "revoked_at", None):
        try:
            _revoke_user_refresh_sessions(db, user_id)
            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(status_code=401, detail="Refresh session revoked")

    expires_at = _coerce_utc_datetime(getattr(row, "expires_at", None))
    if not expires_at or expires_at <= _now_utc():
        _revoke_refresh_session(row)
        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()
        raise HTTPException(status_code=401, detail="Refresh session expired")

    user = _active_user_from_id(db, user_id)
    return data, user, row

def _set_refresh_cookie(resp: Response, token: str) -> None:
    # If COOKIE_SAMESITE is "none", Secure must be true in modern browsers.
    secure = COOKIE_SECURE or (COOKIE_SAMESITE == "none")
    resp.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=REFRESH_TTL_DAYS * 24 * 60 * 60,
    )

def _clear_refresh_cookie(resp: Response) -> None:
    resp.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")

class SignupIn(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    account_type: str | None = Field(default="listener", pattern="^(listener|artist)$")

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class AuthOut(BaseModel):
    access_token: str
    email_verification_url: str | None = None
    email_verified: bool = False

class MeOut(BaseModel): 
    id: int 
    email: EmailStr 
    name: str | None = None 
    account_type: str = "listener" 
    email_verified: bool = False 
    email_verification_url: str | None = None 
 
 
class MeUpdateIn(BaseModel): 
    name: str | None = Field(default=None, max_length=255) 
    email: EmailStr | None = None 
    account_type: str | None = Field(default=None, pattern="^(listener|artist)$") 


class VerifyEmailOut(BaseModel):
    ok: bool
    email_verified: bool = True


class ResendVerificationOut(BaseModel):
    ok: bool
    email_verification_url: str | None = None


class PaymentMethodIn(BaseModel):
    card_number: str = Field(min_length=12, max_length=25)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2024, le=2100)
    holder_name: str | None = Field(default=None, max_length=255)
    brand: str | None = Field(default="card", max_length=32)
    set_default: bool = True


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserSettingsIn(BaseModel):
    general: Dict[str, Any] | None = None
    audio: Dict[str, Any] | None = None
    notifications: Dict[str, Any] | None = None
    privacy: Dict[str, Any] | None = None
    artist: Dict[str, Any] | None = None
    conversionLinks: Dict[str, Any] | None = None


class AdminLockIn(BaseModel):
    minutes: int = Field(default=30, ge=1, le=7 * 24 * 60)
    reason: str | None = Field(default="manual_admin_lock", max_length=500)


def _normalize_digits(v: str) -> str:
    return "".join(ch for ch in (v or "") if ch.isdigit())


def _infer_brand(number: str) -> str:
    if number.startswith("4"):
        return "visa"
    if number.startswith(("51", "52", "53", "54", "55")):
        return "mastercard"
    if number.startswith(("34", "37")):
        return "amex"
    return "card"


def _last4(number: str) -> str:
    return number[-4:] if len(number) >= 4 else number.rjust(4, "0")


def _require_admin(req: Request) -> None:
    admin_api_key = _admin_api_key()
    if not admin_api_key:
        raise HTTPException(status_code=503, detail="Admin API not configured")
    supplied = (req.headers.get("X-Admin-Api-Key") or "").strip()
    if not _constant_time_equals(supplied, admin_api_key):
        raise HTTPException(status_code=403, detail="Admin access denied")


def _audit_log(
    action: str,
    db: Session | None = None,
    user_id: int | None = None,
    email: str | None = None,
    req: Request | None = None,
    reason: str | None = None,
    actor: str = "system",
    meta: Dict[str, Any] | None = None,
) -> None:
    own_db = db is None
    dbs = db or SessionLocal()
    try:
        dbs.add(
            SecurityAuditLog(
                id=str(uuid.uuid4()),
                actor=actor,
                action=action,
                user_id=user_id,
                email=(email or "").strip() or None,
                ip=(_client_ip(req) if req is not None else None),
                reason=(reason or "").strip() or None,
                meta_json=json.dumps(meta or {}, separators=(",", ":"), sort_keys=True),
            )
        )
        if own_db:
            dbs.commit()
    except Exception:
        if own_db:
            try:
                dbs.rollback()
            except Exception:
                pass
        # Never block request on audit logging failures.
        pass
    finally:
        if own_db:
            try:
                dbs.close()
            except Exception:
                pass

def _get_bearer_token(req: Request) -> str:
    auth = req.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return auth.split(" ", 1)[1].strip()

def get_current_user_id(req: Request) -> int:
    token = _get_bearer_token(req)
    try:
        data = _decode(token)
        if data.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token")
        return int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")


def _active_user_from_id(db: Session, user_id: int) -> User:
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    locked_until = _coerce_utc_datetime(getattr(user, "locked_until", None))
    if locked_until and locked_until > _now_utc():
        retry_after = int((locked_until - _now_utc()).total_seconds())
        raise HTTPException(status_code=423, detail=f"Account locked. Retry in {max(1, retry_after)}s.")
    return user


def _require_active_user(req: Request, db: Session) -> User:
    return _active_user_from_id(db, get_current_user_id(req))


def _require_artist_user(req: Request, db: Session) -> User:
    user = _require_active_user(req, db)
    if (getattr(user, "account_type", "listener") or "listener").strip().lower() != "artist":
        raise HTTPException(status_code=403, detail="Artist account required")
    if EMAIL_VERIFICATION_REQUIRED_FOR_ARTIST_UPLOADS and not _email_verified(user):
        raise HTTPException(status_code=403, detail="Verify your email before using artist uploads")
    return user


SETTINGS_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "general": {"appearance": "light", "density": "normal", "autoplay": True},
    "audio": {"volume": 74, "bass": 52, "treble": 48, "balance": 50},
    "notifications": {
        "releaseAlerts": True,
        "friendActivity": False,
        "concertAlerts": True,
        "listenerActivity": True,
        "discoveryScoreChanges": True,
        "weeklyArtistReport": True,
        "securityAlerts": True,
    },
    "privacy": {
        "personalizedRecommendations": True,
        "analyticsConsent": True,
        "publicListening": False,
        "shareAggregateArtistFit": True,
    },
    "artist": {
        "publicProfile": True,
        "discoveryEnabled": True,
        "explicitContentDefault": False,
        "ownershipConfirmed": False,
        "playMilestoneThreshold": 100,
        "saveMilestoneThreshold": 25,
        "skipAlertThreshold": 35,
    },
    "conversionLinks": {
        "spotify": "",
        "website": "",
        "merch": "",
        "tickets": "",
        "emailSignup": "",
        "support": "",
    },
}


def _json_obj(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _settings_row(db: Session, user_id: int) -> UserSettings:
    row = db.query(UserSettings).filter(UserSettings.user_id == int(user_id)).first()
    if row:
        return row
    row = UserSettings(user_id=int(user_id))
    db.add(row)
    db.flush()
    return row


def _settings_payload(row: UserSettings | None) -> Dict[str, Dict[str, Any]]:
    if row is None:
        stored: Dict[str, Dict[str, Any]] = {}
    else:
        stored = {
            "general": _json_obj(row.general_json),
            "audio": _json_obj(row.audio_json),
            "notifications": _json_obj(row.notifications_json),
            "privacy": _json_obj(row.privacy_json),
            "artist": _json_obj(row.artist_json),
            "conversionLinks": _json_obj(row.conversion_links_json),
        }
    return {key: {**defaults, **stored.get(key, {})} for key, defaults in SETTINGS_DEFAULTS.items()}


def _settings_for_user_id(db: Session, user_id: int | None) -> Dict[str, Dict[str, Any]]:
    if user_id is None:
        return _settings_payload(None)
    try:
        row = db.query(UserSettings).filter(UserSettings.user_id == int(user_id)).first()
    except SQLAlchemyError:
        row = None
    return _settings_payload(row)


def _conversion_links_for_user(db: Session, user_id: int | None) -> Dict[str, str]:
    settings = _settings_for_user_id(db, user_id)
    links = settings.get("conversionLinks") or {}
    return {key: str(value or "").strip() for key, value in links.items() if str(value or "").strip()}


def _artist_settings_for_user(db: Session, user_id: int | None) -> Dict[str, Any]:
    return _settings_for_user_id(db, user_id).get("artist") or dict(SETTINGS_DEFAULTS["artist"])


def _notification_allowed(db: Session, user_id: int, notification_type: str) -> bool:
    settings = _settings_for_user_id(db, int(user_id)).get("notifications") or {}
    kind = (notification_type or "system").strip().lower()
    if kind in {"listener", "conversion", "artist"}:
        return bool(settings.get("listenerActivity", True))
    if kind == "discovery":
        return bool(settings.get("discoveryScoreChanges", True))
    if kind == "security":
        return bool(settings.get("securityAlerts", True))
    if kind in {"release", "music"}:
        return bool(settings.get("releaseAlerts", True))
    if kind in {"event", "concert"}:
        return bool(settings.get("concertAlerts", True))
    return True


def _create_notification(
    db: Session,
    user_id: int | None,
    notification_type: str,
    title: str,
    body: str,
    link: str | None = None,
) -> Notification | None:
    if user_id is None:
        return None
    if not _notification_allowed(db, int(user_id), notification_type):
        return None
    row = Notification(
        id=f"ntf_{uuid.uuid4().hex}",
        user_id=int(user_id),
        type=(notification_type or "system").strip().lower()[:32] or "system",
        title=(title or "Offtrack update").strip()[:255],
        body=(body or "").strip()[:2000],
        link=(link or "").strip()[:2000] or None,
    )
    db.add(row)
    return row


def _serialize_notification(row: Notification) -> Dict[str, Any]:
    return {
        "id": row.id,
        "type": row.type,
        "title": row.title,
        "body": row.body,
        "link": row.link,
        "readAt": getattr(row, "read_at", None),
        "createdAt": getattr(row, "created_at", None),
        "unread": getattr(row, "read_at", None) is None,
    }


def _upload_discovery_control(db: Session, track_id: str) -> UploadDiscoveryControl | None:
    if not track_id:
        return None
    return db.query(UploadDiscoveryControl).filter(UploadDiscoveryControl.track_id == track_id).first()


def _upload_discovery_status(db: Session, track: CatalogTrack) -> Dict[str, Any]:
    owner_id = getattr(track, "owner_user_id", None)
    paused = False
    reason = ""
    if owner_id is not None:
        control = _upload_discovery_control(db, track.id)
        if control:
            paused = bool(getattr(control, "discovery_paused", False))
            reason = str(getattr(control, "reason", "") or "")
    artist_enabled = True
    if owner_id is not None:
        artist_settings = _artist_settings_for_user(db, int(owner_id))
        artist_enabled = bool(artist_settings.get("discoveryEnabled", True))
    is_published = bool(getattr(track, "is_published", True))
    return {
        "discoveryPaused": paused,
        "discoveryPausedReason": reason,
        "discoveryEligible": bool(is_published and artist_enabled and not paused),
        "artistDiscoveryEnabled": artist_enabled,
    }


def _upload_discovery_enabled(db: Session, track: CatalogTrack) -> bool:
    owner_id = getattr(track, "owner_user_id", None)
    if owner_id is None:
        return True
    return bool(_upload_discovery_status(db, track).get("discoveryEligible", True))


def _upload_public_profile_enabled(db: Session, track: CatalogTrack) -> bool:
    owner_id = getattr(track, "owner_user_id", None)
    if owner_id is None:
        return True
    artist_settings = _artist_settings_for_user(db, int(owner_id))
    return bool(artist_settings.get("publicProfile", True))


def _bool_setting(data: Dict[str, Any], key: str, default: bool) -> bool:
    return bool(data.get(key, default))


def _choice_setting(data: Dict[str, Any], key: str, default: str, choices: set[str]) -> str:
    value = str(data.get(key, default) or default).strip().lower()
    return value if value in choices else default


def _int_setting(data: Dict[str, Any], key: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(data.get(key, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _sanitize_settings_section(section: str, data: Dict[str, Any]) -> Dict[str, Any]:
    defaults = SETTINGS_DEFAULTS[section]
    if section == "general":
        return {
            "appearance": _choice_setting(data, "appearance", defaults["appearance"], {"light", "dark", "system"}),
            "density": _choice_setting(data, "density", defaults["density"], {"compact", "normal", "comfortable"}),
            "autoplay": _bool_setting(data, "autoplay", defaults["autoplay"]),
        }
    if section == "audio":
        return {key: _int_setting(data, key, int(defaults[key]), 0, 100) for key in defaults}
    if section == "notifications":
        return {key: _bool_setting(data, key, bool(defaults[key])) for key in defaults}
    if section == "privacy":
        return {key: _bool_setting(data, key, bool(defaults[key])) for key in defaults}
    if section == "artist":
        return {
            "publicProfile": _bool_setting(data, "publicProfile", defaults["publicProfile"]),
            "discoveryEnabled": _bool_setting(data, "discoveryEnabled", defaults["discoveryEnabled"]),
            "explicitContentDefault": _bool_setting(data, "explicitContentDefault", defaults["explicitContentDefault"]),
            "ownershipConfirmed": _bool_setting(data, "ownershipConfirmed", defaults["ownershipConfirmed"]),
            "playMilestoneThreshold": _int_setting(data, "playMilestoneThreshold", defaults["playMilestoneThreshold"], 1, 1000000),
            "saveMilestoneThreshold": _int_setting(data, "saveMilestoneThreshold", defaults["saveMilestoneThreshold"], 1, 1000000),
            "skipAlertThreshold": _int_setting(data, "skipAlertThreshold", defaults["skipAlertThreshold"], 0, 100),
        }
    if section == "conversionLinks":
        clean: Dict[str, Any] = {}
        for key in defaults:
            clean[key] = _sanitize_optional_http_url(data.get(key), key) or ""
        return clean
    return dict(defaults)


def _serialize_json(data: Dict[str, Any]) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True)


@app.post("/api/auth/signup", response_model=AuthOut)
def auth_signup(payload: SignupIn, req: Request, resp: Response, db: Session = Depends(get_db)):
    _enforce_rate_limit("signup", req, RATE_LIMIT_SIGNUP_PER_MIN, 60)
    email = _normalize_auth_email(str(payload.email))
    name = _sanitize_display_name(payload.name)
    account_type = (payload.account_type or "listener").strip().lower()
    if account_type not in {"listener", "artist"}:
        account_type = "listener"
    policy_error = _password_policy_error(payload.password)
    if policy_error:
        raise HTTPException(status_code=422, detail=policy_error)
    try:
        exists = db.query(User).filter(User.email == email).first()
        if exists:
            raise HTTPException(status_code=409, detail="Email already exists")

        user = User(email=email, name=name, account_type=account_type, password_hash=_hash_password(payload.password))
        verification_token = _issue_email_verification(user)
        db.add(user)
        db.flush()
        refresh, _ = _create_refresh_session(db, user.id, req)
        db.commit()
        db.refresh(user)
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        # Handles race conditions where two signups happen with same email.
        raise HTTPException(status_code=409, detail="Email already exists")
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")

    access = _create_access_token(user.id)
    _set_refresh_cookie(resp, refresh)
    _audit_log(action="auth_signup", user_id=user.id, email=email, req=req, meta={"account_type": account_type})
    return {
        "access_token": access,
        "email_verification_url": _verification_url(req, verification_token),
        "email_verified": _email_verified(user),
    }

@app.post("/api/auth/login", response_model=AuthOut)
def auth_login(payload: LoginIn, req: Request, resp: Response, db: Session = Depends(get_db)):
    _enforce_rate_limit("login", req, RATE_LIMIT_LOGIN_PER_MIN, 60)
    email = _normalize_auth_email(str(payload.email))
    _validate_password_input(payload.password)
    ip = _client_ip(req)
    _check_auth_bruteforce(email, ip)
    try:
        user = db.query(User).filter(User.email == email).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if user:
        locked_until = _coerce_utc_datetime(getattr(user, "locked_until", None))
        if locked_until and locked_until > _now_utc():
            retry_after = int((locked_until - _now_utc()).total_seconds())
            raise HTTPException(status_code=423, detail=f"Account locked. Retry in {max(1, retry_after)}s.")
    if not user or not _verify_and_upgrade_password(db, user, payload.password):
        _record_auth_result(email, ip, ok=False)
        _audit_log(action="auth_login_failed", user_id=(user.id if user else None), email=email, req=req, reason="invalid_credentials")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _record_auth_result(email, ip, ok=True)
    try:
        refresh, _ = _create_refresh_session(db, user.id, req)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not create session. Please try again.")
    _audit_log(action="auth_login_success", user_id=user.id, email=email, req=req)

    access = _create_access_token(user.id)
    _set_refresh_cookie(resp, refresh)
    return {"access_token": access, "email_verified": _email_verified(user)}

@app.post("/api/auth/refresh", response_model=AuthOut)
def auth_refresh(req: Request, resp: Response, db: Session = Depends(get_db)):
    token = req.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        _, user, old_session = _refresh_session_from_token(db, token)
        new_refresh, new_session = _create_refresh_session(db, user.id, req)
        old_session.last_used_at = _now_utc()
        _revoke_refresh_session(old_session, replaced_by_session_id=new_session.id)
        db.commit()
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not refresh session. Please try again.")

    access = _create_access_token(user.id)
    _set_refresh_cookie(resp, new_refresh)
    _audit_log(action="auth_refresh", user_id=user.id, email=user.email, req=req)
    return {"access_token": access, "email_verified": _email_verified(user)}

@app.post("/api/auth/logout")
def auth_logout(req: Request, resp: Response, db: Session = Depends(get_db)):
    refresh_token = req.cookies.get(REFRESH_COOKIE_NAME)
    revoked_session_id = None
    user_id = None
    if refresh_token:
        try:
            _, user, row = _refresh_session_from_token(db, refresh_token)
            _revoke_refresh_session(row)
            db.commit()
            revoked_session_id = row.id
            user_id = user.id
        except HTTPException:
            db.rollback()
        except SQLAlchemyError:
            db.rollback()
    _clear_refresh_cookie(resp)
    if user_id is None:
        try:
            user_id = get_current_user_id(req)
        except HTTPException:
            user_id = None
    _audit_log(action="auth_logout", user_id=user_id, req=req, meta={"refresh_session_id": revoked_session_id})
    return {"ok": True}

@app.get("/api/auth/me", response_model=MeOut) 
def auth_me(req: Request, db: Session = Depends(get_db)): 
    user = _require_active_user(req, db) 
    return { 
        "id": user.id, 
        "email": user.email,
        "name": user.name,
        "account_type": user.account_type or "listener",
        "email_verified": _email_verified(user), 
    } 
 
 
@app.patch("/api/auth/me", response_model=MeOut) 
def auth_update_me(payload: MeUpdateIn, req: Request, db: Session = Depends(get_db)): 
    user = _require_active_user(req, db) 
    fields_set = payload.model_fields_set if hasattr(payload, "model_fields_set") else getattr(payload, "__fields_set__", set()) 
    verification_token = None 
    changed: list[str] = [] 
 
    if "name" in fields_set: 
        next_name = _sanitize_display_name(payload.name) 
        if user.name != next_name: 
            user.name = next_name 
            changed.append("name") 
 
    if "account_type" in fields_set and payload.account_type is not None: 
        next_account_type = payload.account_type.strip().lower() 
        if next_account_type not in {"listener", "artist"}: 
            raise HTTPException(status_code=422, detail="Invalid account type") 
        if (user.account_type or "listener") != next_account_type: 
            user.account_type = next_account_type 
            changed.append("account_type") 
 
    if "email" in fields_set and payload.email is not None: 
        next_email = _normalize_auth_email(str(payload.email)) 
        if user.email != next_email: 
            try: 
                exists = db.query(User).filter(User.email == next_email, User.id != user.id).first() 
            except SQLAlchemyError: 
                raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.") 
            if exists: 
                raise HTTPException(status_code=409, detail="Email already exists") 
            user.email = next_email 
            user.email_verified_at = None 
            verification_token = _issue_email_verification(user) 
            changed.extend(["email", "email_verified"]) 
 
    if changed: 
        try: 
            db.add(user) 
            db.commit() 
            db.refresh(user) 
        except IntegrityError: 
            db.rollback() 
            raise HTTPException(status_code=409, detail="Email already exists") 
        except SQLAlchemyError: 
            db.rollback() 
            raise HTTPException(status_code=503, detail="Could not update profile. Please try again.") 
        _audit_log(action="auth_profile_updated", user_id=user.id, email=user.email, req=req, meta={"changed": sorted(set(changed))}) 
 
    return { 
        "id": user.id, 
        "email": user.email, 
        "name": user.name, 
        "account_type": user.account_type or "listener", 
        "email_verified": _email_verified(user), 
        "email_verification_url": _verification_url(req, verification_token) if verification_token else None, 
    } 
 
 
@app.get("/api/auth/verify-email", response_model=VerifyEmailOut) 
def auth_verify_email(token: str, req: Request, db: Session = Depends(get_db)): 
    token_value = (token or "").strip()
    if not token_value:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    token_hash = _hash_email_verification_token(token_value)
    try:
        user = db.query(User).filter(User.email_verification_token_hash == token_hash).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    sent_at = _coerce_utc_datetime(getattr(user, "email_verification_sent_at", None))
    if sent_at and _now_utc() - sent_at > timedelta(hours=EMAIL_VERIFICATION_TOKEN_TTL_HOURS):
        raise HTTPException(status_code=400, detail="Verification token expired")

    user.email_verified_at = _now_utc()
    user.email_verification_token_hash = None
    user.email_verification_sent_at = None
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not verify email. Please try again.")
    _audit_log(action="auth_email_verified", user_id=user.id, email=user.email, req=req)
    return {"ok": True, "email_verified": True}


@app.post("/api/auth/resend-verification", response_model=ResendVerificationOut)
def auth_resend_verification(req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    if _email_verified(user):
        return {"ok": True, "email_verification_url": None}
    token = _issue_email_verification(user)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not create verification token. Please try again.")
    _audit_log(action="auth_email_verification_sent", user_id=user.id, email=user.email, req=req)
    return {"ok": True, "email_verification_url": _verification_url(req, token)}


@app.post("/api/auth/change-password")
def auth_change_password(payload: PasswordChangeIn, req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    _validate_password_input(payload.current_password)
    policy_error = _password_policy_error(payload.new_password)
    if policy_error:
        raise HTTPException(status_code=422, detail=policy_error)
    if not _verify_password(payload.current_password, user.password_hash):
        _audit_log(action="auth_password_change_failed", user_id=user.id, email=user.email, req=req, reason="invalid_current_password")
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password_hash = _hash_password(payload.new_password)
    try:
        db.add(user)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not change password. Please try again.")
    _audit_log(action="auth_password_changed", user_id=user.id, email=user.email, req=req)
    return {"ok": True}


@app.post("/api/auth/logout-all")
def auth_logout_all(req: Request, resp: Response, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    try:
        revoked = _revoke_user_refresh_sessions(db, int(user.id))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not revoke sessions. Please try again.")
    _clear_refresh_cookie(resp)
    _audit_log(action="auth_logout_all", user_id=user.id, email=user.email, req=req, meta={"revoked_refresh_sessions": revoked})
    return {"ok": True, "revoked": revoked}


@app.get("/api/settings")
def get_user_settings(req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    try:
        row = db.query(UserSettings).filter(UserSettings.user_id == int(user.id)).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    payload = _settings_payload(row)
    payload["account"] = {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "accountType": user.account_type or "listener",
        "emailVerified": _email_verified(user),
    }
    return payload


@app.patch("/api/settings")
def update_user_settings(payload: UserSettingsIn, req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    try:
        row = _settings_row(db, int(user.id))
        current = _settings_payload(row)
        fields = payload.model_fields_set if hasattr(payload, "model_fields_set") else getattr(payload, "__fields_set__", set())
        for section, column in [
            ("general", "general_json"),
            ("audio", "audio_json"),
            ("notifications", "notifications_json"),
            ("privacy", "privacy_json"),
            ("artist", "artist_json"),
            ("conversionLinks", "conversion_links_json"),
        ]:
            if section not in fields:
                continue
            incoming = getattr(payload, section, None)
            if incoming is None:
                continue
            if not isinstance(incoming, dict):
                raise HTTPException(status_code=422, detail=f"{section} settings must be an object")
            merged = {**current[section], **incoming}
            setattr(row, column, _serialize_json(_sanitize_settings_section(section, merged)))
        db.add(row)
        db.commit()
        db.refresh(row)
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not save settings. Please try again.")
    _audit_log(action="settings_updated", user_id=user.id, email=user.email, req=req)
    return _settings_payload(row)


@app.get("/api/notifications")
def list_notifications(req: Request, limit: int = 50, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    limit = max(1, min(int(limit or 50), 100))
    try:
        rows = (
            db.query(Notification)
            .filter(Notification.user_id == int(user.id))
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .all()
        )
        unread_count = (
            db.query(func.count(Notification.id))
            .filter(Notification.user_id == int(user.id), Notification.read_at.is_(None))
            .scalar()
            or 0
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    return {"notifications": [_serialize_notification(row) for row in rows], "unreadCount": int(unread_count)}


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    nid = (notification_id or "").strip()
    try:
        row = db.query(Notification).filter(Notification.id == nid, Notification.user_id == int(user.id)).first()
        if not row:
            raise HTTPException(status_code=404, detail="Notification not found")
        if row.read_at is None:
            row.read_at = _now_utc()
            db.add(row)
            db.commit()
            db.refresh(row)
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not update notification. Please try again.")
    return {"ok": True, "notification": _serialize_notification(row)}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    now = _now_utc()
    try:
        updated = (
            db.query(Notification)
            .filter(Notification.user_id == int(user.id), Notification.read_at.is_(None))
            .update({Notification.read_at: now}, synchronize_session=False)
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not update notifications. Please try again.")
    return {"ok": True, "updated": int(updated or 0)}


@app.get("/api/settings/export")
def export_user_settings(req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    try:
        settings = db.query(UserSettings).filter(UserSettings.user_id == int(user.id)).first()
        interactions = (
            db.query(Interaction)
            .filter(Interaction.user_id == int(user.id))
            .order_by(Interaction.created_at.desc())
            .limit(1000)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Could not export data. Please try again.")
    return {
        "account": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "accountType": user.account_type or "listener",
            "emailVerified": _email_verified(user),
            "createdAt": getattr(user, "created_at", None),
        },
        "settings": _settings_payload(settings),
        "recentInteractions": [
            {
                "trackId": row.track_id,
                "event": row.event,
                "sourcePage": row.source_page,
                "createdAt": getattr(row, "created_at", None),
            }
            for row in interactions
        ],
    }


@app.delete("/api/settings/listening-history")
def delete_listening_history(req: Request, db: Session = Depends(get_db)):
    user = _require_active_user(req, db)
    try:
        deleted = (
            db.query(Interaction)
            .filter(Interaction.user_id == int(user.id))
            .delete(synchronize_session=False)
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not delete listening history. Please try again.")
    _audit_log(action="settings_listening_history_deleted", user_id=user.id, email=user.email, req=req, meta={"deleted": int(deleted or 0)})
    return {"ok": True, "deleted": int(deleted or 0)}


@app.post("/api/admin/users/{user_id}/lock")
def admin_lock_user(user_id: int, payload: AdminLockIn, req: Request, db: Session = Depends(get_db)):
    _require_admin(req)
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    locked_until = _now_utc() + timedelta(minutes=int(payload.minutes))
    user.locked_until = locked_until
    user.lock_reason = (payload.reason or "").strip() or "manual_admin_lock"
    revoked_sessions = _revoke_user_refresh_sessions(db, user.id)
    _audit_log(
        action="admin_lock_user",
        db=db,
        user_id=user.id,
        email=user.email,
        req=req,
        reason=user.lock_reason,
        actor="admin",
        meta={"minutes": int(payload.minutes), "revoked_refresh_sessions": revoked_sessions},
    )
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not lock user. Please try again.")

    return {"ok": True, "userId": user.id, "lockedUntil": str(user.locked_until), "reason": user.lock_reason}


@app.post("/api/admin/users/{user_id}/unlock")
def admin_unlock_user(user_id: int, req: Request, db: Session = Depends(get_db)):
    _require_admin(req)
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.locked_until = None
    user.lock_reason = None
    _audit_log(action="admin_unlock_user", db=db, user_id=user.id, email=user.email, req=req, actor="admin")
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not unlock user. Please try again.")
    return {"ok": True, "userId": user.id}


@app.get("/api/admin/audit-logs")
def admin_audit_logs(req: Request, limit: int = 50, db: Session = Depends(get_db)):
    _require_admin(req)
    limit = max(1, min(int(limit or 50), 200))
    try:
        rows = (
            db.query(SecurityAuditLog)
            .order_by(SecurityAuditLog.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    return {
        "logs": [
            {
                "id": r.id,
                "actor": r.actor,
                "action": r.action,
                "userId": r.user_id,
                "email": r.email,
                "ip": r.ip,
                "reason": r.reason,
                "meta": (json.loads(r.meta_json) if r.meta_json else {}),
                "createdAt": getattr(r, "created_at", None),
            }
            for r in rows
        ]
    }


@app.get("/api/admin/uploads/unowned")
def admin_unowned_uploads(req: Request, limit: int = 100, db: Session = Depends(get_db)):
    _require_admin(req)
    limit = max(1, min(int(limit or 100), 200))
    try:
        rows = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(CatalogTrack.source_type == "upload", CatalogTrack.owner_user_id.is_(None))
            .order_by(CatalogTrack.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    track_ids = [row.id for row in rows]
    track_metrics, _, _, _ = _artist_upload_metrics(db, track_ids)
    return {
        "tracks": [
            _attach_upload_metrics(row, _serialize_uploaded_catalog_track(row, db), track_metrics.get(row.id) or {})
            for row in rows
        ]
    }


@app.post("/api/admin/uploads/{upload_id}/claim")
def admin_claim_upload_owner(
    upload_id: str,
    req: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    _require_admin(req)
    uid = (upload_id or "").strip()
    try:
        owner_user_id = int(payload.get("owner_user_id"))
    except Exception:
        raise HTTPException(status_code=422, detail="owner_user_id is required")
    if owner_user_id <= 0:
        raise HTTPException(status_code=422, detail="owner_user_id is required")
    try:
        track = _managed_upload_query(db, uid)
        user = db.query(User).filter(User.id == owner_user_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not track:
        raise HTTPException(status_code=404, detail="Upload not found")
    if not user:
        raise HTTPException(status_code=404, detail="Owner user not found")
    if (user.account_type or "listener").strip().lower() != "artist":
        raise HTTPException(status_code=400, detail="Owner must be an artist account")

    previous_owner = getattr(track, "owner_user_id", None)
    track.owner_user_id = int(user.id)
    _audit_log(
        action="admin_claim_upload_owner",
        db=db,
        user_id=user.id,
        email=user.email,
        req=req,
        actor="admin",
        reason="claim_upload_owner",
        meta={"upload_id": track.id, "previous_owner_user_id": previous_owner},
    )
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not claim upload. Please try again.")

    refreshed = _managed_upload_query(db, track.id)
    return {"ok": True, "track": _serialize_uploaded_catalog_track(refreshed or track, db)}


@app.get("/api/billing/payment-methods")
def billing_list_payment_methods(req: Request, db: Session = Depends(get_db)):
    user_id = int(_require_active_user(req, db).id)
    try:
        rows = (
            db.query(PaymentMethod)
            .filter(PaymentMethod.user_id == user_id)
            .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc())
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    return {
        "methods": [
            {
                "id": r.id,
                "brand": r.brand,
                "last4": r.last4,
                "expMonth": r.exp_month,
                "expYear": r.exp_year,
                "holderName": r.holder_name,
                "isDefault": bool(r.is_default),
                "createdAt": getattr(r, "created_at", None),
            }
            for r in rows
        ]
    }


@app.post("/api/billing/payment-methods")
def billing_add_payment_method(payload: PaymentMethodIn, req: Request, db: Session = Depends(get_db)):
    user_id = int(_require_active_user(req, db).id)
    digits = _normalize_digits(payload.card_number)
    if len(digits) < 12:
        raise HTTPException(status_code=400, detail="Invalid card number")

    now = _now_utc()
    if payload.exp_year < now.year or (payload.exp_year == now.year and payload.exp_month < now.month):
        raise HTTPException(status_code=400, detail="Card expiry is in the past")

    brand = (payload.brand or "").strip().lower() or _infer_brand(digits)
    method_id = str(uuid.uuid4())

    try:
        if payload.set_default:
            (
                db.query(PaymentMethod)
                .filter(PaymentMethod.user_id == user_id, PaymentMethod.is_default == True)  # noqa: E712
                .update({"is_default": False}, synchronize_session=False)
            )

        row = PaymentMethod(
            id=method_id,
            user_id=user_id,
            brand=brand,
            last4=_last4(digits),
            exp_month=payload.exp_month,
            exp_year=payload.exp_year,
            holder_name=(payload.holder_name or "").strip() or None,
            is_default=bool(payload.set_default),
        )
        db.add(row)

        # Generate a simple billing receipt entry for auditability.
        db.add(
            BillingReceipt(
                id=str(uuid.uuid4()),
                user_id=user_id,
                amount_cents=0,
                currency="USD",
                status="setup",
                description="Payment method added",
                payment_method_last4=row.last4,
            )
        )

        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not save payment method. Please try again.")

    return {
        "id": method_id,
        "brand": brand,
        "last4": _last4(digits),
        "expMonth": payload.exp_month,
        "expYear": payload.exp_year,
        "holderName": (payload.holder_name or "").strip() or None,
        "isDefault": bool(payload.set_default),
    }


@app.delete("/api/billing/payment-methods/{method_id}")
def billing_delete_payment_method(method_id: str, req: Request, db: Session = Depends(get_db)):
    user_id = int(_require_active_user(req, db).id)
    mid = (method_id or "").strip()
    if not mid:
        raise HTTPException(status_code=400, detail="Invalid payment method id")

    try:
        row = db.query(PaymentMethod).filter(PaymentMethod.id == mid, PaymentMethod.user_id == user_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Payment method not found")

        was_default = bool(row.is_default)
        db.delete(row)
        db.flush()

        if was_default:
            next_default = (
                db.query(PaymentMethod)
                .filter(PaymentMethod.user_id == user_id)
                .order_by(PaymentMethod.created_at.desc())
                .first()
            )
            if next_default:
                next_default.is_default = True

        db.commit()
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not delete payment method. Please try again.")

    return {"ok": True}


@app.get("/api/billing/receipts")
def billing_list_receipts(req: Request, limit: int = 20, db: Session = Depends(get_db)):
    user_id = int(_require_active_user(req, db).id)
    limit = max(1, min(int(limit or 20), 100))
    try:
        rows = (
            db.query(BillingReceipt)
            .filter(BillingReceipt.user_id == user_id)
            .order_by(BillingReceipt.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    return {
        "receipts": [
            {
                "id": r.id,
                "amountCents": r.amount_cents,
                "currency": r.currency,
                "status": r.status,
                "description": r.description,
                "paymentMethodLast4": r.payment_method_last4,
                "createdAt": getattr(r, "created_at", None),
                "downloadUrl": f"/api/billing/receipts/{r.id}/download",
            }
            for r in rows
        ]
    }


@app.get("/api/billing/receipts/{receipt_id}/download")
def billing_download_receipt(receipt_id: str, req: Request, db: Session = Depends(get_db)):
    user_id = int(_require_active_user(req, db).id)
    rid = (receipt_id or "").strip()
    if not rid:
        raise HTTPException(status_code=400, detail="Invalid receipt id")

    try:
        row = db.query(BillingReceipt).filter(BillingReceipt.id == rid, BillingReceipt.user_id == user_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")

    amount = f"{row.amount_cents / 100:.2f}"
    ts = str(getattr(row, "created_at", "") or "")
    content = (
        f"Offtrack Receipt\n"
        f"Receipt ID: {row.id}\n"
        f"Date: {ts}\n"
        f"Status: {row.status}\n"
        f"Description: {row.description}\n"
        f"Amount: {amount} {row.currency}\n"
        f"Card Last4: {row.payment_method_last4 or 'N/A'}\n"
    )
    headers = {"Content-Disposition": f'attachment; filename=\"receipt-{row.id}.txt\"'}
    return PlainTextResponse(content=content, headers=headers)


@app.on_event("startup")
def _startup_schema_init() -> None:
    _validate_production_runtime_config()
    # Make auth and upload tables available in fresh environments before first request.
    try:
        wait_for_db(timeout_s=45)
        Base.metadata.create_all(engine)
    except Exception:
        # Do not crash startup in environments that intentionally boot without DB.
        pass


def _require_uploader_identity(req: Request, db: Session) -> Optional[int]:
    if not REQUIRE_AUTH_UPLOADS:
        return None
    try:
        user = _require_artist_user(req, db)
    except HTTPException:
        auth = req.headers.get("authorization") or ""
        if not auth.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Login required to upload tracks")
        raise
    return int(user.id)


def _parse_artist_names(raw_artist: str) -> List[str]:
    return _sync_parse_artist_names(raw_artist)


def _get_or_create_artist(db: Session, name: str) -> Artist:
    artist_name = (name or "").strip()
    row = db.query(Artist).filter(Artist.name == artist_name).first()
    if row:
        return row

    row = Artist(name=artist_name)
    db.add(row)
    db.flush()
    return row


def _catalog_track_artist_text(track: CatalogTrack) -> str:
    names: List[str] = []
    for link in sorted(track.artist_links, key=lambda item: (item.position, item.artist_id)):
        if link.artist and link.artist.name:
            names.append(link.artist.name.strip())
    return ", ".join([n for n in names if n])


def _catalog_track_primary_asset(track: CatalogTrack, kind: str = "full") -> Optional[AudioAsset]:
    if track is None:
        return None
    ranked = sorted(
        [
            asset for asset in track.audio_assets
            if (asset.kind or "").strip().lower() == kind.lower()
        ],
        key=lambda asset: (0 if asset.is_primary else 1, str(asset.created_at or "")),
    )
    return ranked[0] if ranked else None


def _serialize_uploaded_catalog_track(track: CatalogTrack, db: Session | None = None) -> Dict[str, Any]:
    asset = _catalog_track_primary_asset(track, kind="full")
    item = {
        "id": track.id,
        "title": track.canonical_title,
        "artist": _catalog_track_artist_text(track),
        "imageUrl": track.image_url,
        "audioUrl": f"/api/uploads/{track.id}/stream" if asset else None,
        "mimeType": asset.mime_type if asset else None,
        "sizeBytes": int(asset.size_bytes or 0) if asset else 0,
        "durationMs": int(asset.duration_ms) if asset and asset.duration_ms is not None else track.duration_ms,
        "waveformPeaks": (json.loads(asset.waveform_peaks_json) if asset and asset.waveform_peaks_json else []),
        "processingStatus": asset.processing_status if asset else None,
        "processingError": asset.processing_error if asset else None,
        "storageBackend": storage_backend_for_path(asset.storage_path if asset else None),
        "storagePath": asset.storage_path if asset else None,
        "ownerUserId": getattr(track, "owner_user_id", None),
        "isPublished": bool(getattr(track, "is_published", True)),
        "createdAt": getattr(track, "created_at", None),
    }
    if db is not None:
        item.update(_upload_discovery_status(db, track))
    return item


QUALIFIED_ARTIST_EVENTS = {
    "play",
    "play_start",
    "play_30s",
    "play_complete",
    "upload_play",
    "like",
    "superlike",
    "save",
    "open_spotify",
    "click_recommendation",
    "artist_click",
    "follow_artist",
    "share",
}


CONVERSION_EVENTS = {"open_spotify", "artist_click", "follow_artist", "share"}


def _interaction_conversion_key(row: Interaction) -> str | None:
    event = (getattr(row, "event", "") or "").strip().lower()
    if event not in CONVERSION_EVENTS:
        return None
    context: Dict[str, Any] = {}
    raw = getattr(row, "context_json", None)
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                context = parsed
        except Exception:
            context = {}
    explicit = str(context.get("conversion") or context.get("conversion_type") or context.get("conversionType") or "").strip().lower()
    if explicit:
        allowed = {"spotify", "website", "merch", "tickets", "email_signup", "emailsignup", "support", "artist_profile", "profile"}
        if explicit in allowed:
            return "emailSignup" if explicit in {"email_signup", "emailsignup"} else ("artistProfile" if explicit in {"artist_profile", "profile"} else explicit)
    if event == "open_spotify":
        return "spotify"
    if event == "artist_click":
        return "artistProfile"
    if event == "follow_artist":
        return "follow"
    if event == "share":
        return "share"
    return None


def _safe_rate(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round(float(numerator) / float(denominator), 4)


def _discovery_score_from_metrics(metrics: Dict[str, Any], *, is_published: bool, has_audio: bool) -> Dict[str, Any]:
    events = metrics.get("eventCounts") or {}
    impressions = int(events.get("impression", 0) or 0)
    starts = int(events.get("play_start", 0) or 0) + int(events.get("play", 0) or 0) + int(events.get("upload_play", 0) or 0)
    completions = int(events.get("play_complete", 0) or 0)
    saves = int(events.get("save", 0) or 0) + int(events.get("like", 0) or 0) + int(events.get("superlike", 0) or 0)
    conversions = int(events.get("artist_click", 0) or 0) + int(events.get("follow_artist", 0) or 0) + int(events.get("open_spotify", 0) or 0)
    skips = int(events.get("skip", 0) or 0) + int(events.get("dislike", 0) or 0) + int(events.get("not_interested", 0) or 0)
    qualified = len(metrics.get("qualifiedListeners") or set())
    unique = len(metrics.get("uniqueListeners") or set())

    exposure_base = max(1, impressions or starts or unique)
    completion_rate = _safe_rate(completions, max(1, starts))
    save_rate = _safe_rate(saves, exposure_base)
    conversion_rate = _safe_rate(conversions, exposure_base)
    skip_rate = _safe_rate(skips, exposure_base)
    qualified_rate = _safe_rate(qualified, max(1, unique))

    readiness = 16 if is_published else 4
    readiness += 14 if has_audio else 0
    evidence = min(18, impressions * 0.35 + starts * 0.55 + unique * 0.9)
    quality = 26 * qualified_rate + 18 * completion_rate + 18 * save_rate + 16 * conversion_rate
    penalty = 24 * skip_rate
    value = int(round(max(0, min(100, readiness + evidence + quality - penalty))))

    if not has_audio:
        label = "Needs audio"
        next_action = "Add playable audio so listeners can complete the track."
    elif not is_published:
        label = "Hidden"
        next_action = "Publish the track when you are ready to test discovery."
    elif impressions < 20:
        label = "Needs exposure"
        next_action = "Send this track through recommendations and share it to collect first listener signals."
    elif skip_rate >= 0.35:
        label = "At risk"
        next_action = "Review the opening seconds, artwork, and listener fit before pushing more discovery."
    elif value >= 72:
        label = "Strong"
        next_action = "Keep this track in discovery and route listeners to follow, merch, tickets, or Spotify."
    elif value >= 52:
        label = "Promising"
        next_action = "Push another discovery round and watch saves, completions, and artist clicks."
    else:
        label = "Needs tuning"
        next_action = "Improve metadata, cover, or targeting before expanding exposure."

    reasons: List[str] = []
    if completion_rate >= 0.35:
        reasons.append("Listeners are finishing the track.")
    if save_rate >= 0.12:
        reasons.append("Saves and likes are above early benchmark.")
    if conversion_rate >= 0.08:
        reasons.append("Listeners are clicking through to the artist.")
    if skip_rate >= 0.25:
        reasons.append("Skip or negative feedback is high.")
    if impressions < 20 and is_published and has_audio:
        reasons.append("More listener data is needed.")
    if not reasons:
        reasons.append("Discovery score is based on early listener actions.")

    return {
        "value": value,
        "label": label,
        "nextAction": next_action,
        "reasons": reasons[:3],
        "rates": {
            "completion": completion_rate,
            "save": save_rate,
            "conversion": conversion_rate,
            "skip": skip_rate,
            "qualified": qualified_rate,
        },
    }


def _artist_upload_metrics(db: Session, track_ids: List[str]) -> tuple[Dict[str, Dict[str, Any]], Dict[str, int], Dict[str, int], List[Interaction]]:
    track_metrics: Dict[str, Dict[str, Any]] = {
        track_id: {
            "eventCounts": {},
            "sourceCounts": {},
            "conversionBreakdown": {},
            "uniqueListeners": set(),
            "qualifiedListeners": set(),
            "lastInteractionAt": None,
        }
        for track_id in track_ids
    }
    event_counts: Dict[str, int] = {}
    source_counts: Dict[str, int] = {}
    recent_rows: List[Interaction] = []

    if not track_ids:
        return track_metrics, event_counts, source_counts, recent_rows

    try:
        recent_rows = (
            db.query(Interaction)
            .filter(Interaction.track_id.in_(track_ids))
            .order_by(Interaction.created_at.desc())
            .limit(1000)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    for row in recent_rows:
        tid = (row.track_id or "").strip()
        if tid not in track_metrics:
            continue
        event = (row.event or "interaction").strip().lower()
        source_page = (row.source_page or "unknown").strip() or "unknown"
        distinct_id = (row.distinct_id or "anonymous").strip() or "anonymous"
        metrics = track_metrics[tid]
        metrics["eventCounts"][event] = int(metrics["eventCounts"].get(event, 0)) + 1
        metrics["sourceCounts"][source_page] = int(metrics["sourceCounts"].get(source_page, 0)) + 1
        metrics["uniqueListeners"].add(distinct_id)
        event_counts[event] = int(event_counts.get(event, 0)) + 1
        source_counts[source_page] = int(source_counts.get(source_page, 0)) + 1
        conversion_key = _interaction_conversion_key(row)
        if conversion_key:
            metrics["conversionBreakdown"][conversion_key] = int(metrics["conversionBreakdown"].get(conversion_key, 0)) + 1
        if event in QUALIFIED_ARTIST_EVENTS:
            metrics["qualifiedListeners"].add(distinct_id)
        if not metrics["lastInteractionAt"]:
            metrics["lastInteractionAt"] = row.created_at

    return track_metrics, event_counts, source_counts, recent_rows


def _attach_upload_metrics(track: CatalogTrack, item: Dict[str, Any], metrics: Dict[str, Any]) -> Dict[str, Any]:
    has_audio = bool(item.get("audioUrl"))
    is_published = bool(getattr(track, "is_published", True))
    item["metrics"] = {
        "eventCounts": metrics.get("eventCounts") or {},
        "sourceCounts": metrics.get("sourceCounts") or {},
        "conversionBreakdown": metrics.get("conversionBreakdown") or {},
        "uniqueListeners": len(metrics.get("uniqueListeners") or set()),
        "qualifiedListeners": len(metrics.get("qualifiedListeners") or set()),
        "lastInteractionAt": metrics.get("lastInteractionAt"),
        "discoveryScore": _discovery_score_from_metrics(metrics, is_published=is_published, has_audio=has_audio),
    }
    return item


def _uploaded_track_recommendation(track: CatalogTrack) -> Dict[str, Any]:
    asset = _catalog_track_primary_asset(track, kind="full")
    artist = _catalog_track_artist_text(track)
    reasons = ["Independent musician on Offtrack"]
    if asset:
        reasons.append("Full track uploaded by the artist")
    if getattr(track, "owner_user_id", None) is not None:
        reasons.append("Claimed artist upload")
    return {
        "id": track.id,
        "title": track.canonical_title,
        "artist": artist,
        "year": _safe_year(getattr(track, "release_year", None)),
        "imageUrl": track.image_url,
        "popularity": 0,
        "source": "upload",
        "sourceType": "upload",
        "previewUrl": None,
        "audioUrl": f"/api/uploads/{track.id}/stream" if asset else None,
        "spotifyUrl": None,
        "spotifyUri": None,
        "durationMs": int(asset.duration_ms) if asset and asset.duration_ms is not None else track.duration_ms,
        "reasons": reasons[:3],
    }


def _attach_artist_conversion_fields(db: Session, item: Dict[str, Any], owner_user_id: int | None) -> Dict[str, Any]:
    links = _conversion_links_for_user(db, owner_user_id)
    artist_settings = _artist_settings_for_user(db, owner_user_id)
    item["artistConversionLinks"] = links
    item["artistProfilePublic"] = bool(artist_settings.get("publicProfile", True))
    return item


def _featured_upload_recommendations(db: Session, exclude_ids: set[str], limit: int = 3) -> List[Dict[str, Any]]:
    if limit <= 0:
        return []
    try:
        rows = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(
                CatalogTrack.source_type == "upload",
                CatalogTrack.is_published.is_(True),
                CatalogTrack.owner_user_id.isnot(None),
            )
            .order_by(CatalogTrack.created_at.desc(), CatalogTrack.id.asc())
            .limit(max(1, min(limit * 4, 24)))
            .all()
        )
    except SQLAlchemyError:
        return []

    out: List[Dict[str, Any]] = []
    for row in rows:
        if row.id in exclude_ids:
            continue
        if not _upload_discovery_enabled(db, row):
            continue
        rec = _uploaded_track_recommendation(row)
        if not rec.get("audioUrl"):
            continue
        _attach_artist_conversion_fields(db, rec, getattr(row, "owner_user_id", None))
        out.append(rec)
        exclude_ids.add(row.id)
        if len(out) >= limit:
            break
    return out


def _exploration_upload_recommendations(db: Session, exclude_ids: set[str], limit: int = 2) -> List[Dict[str, Any]]:
    if limit <= 0:
        return []
    try:
        rows = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(
                CatalogTrack.source_type == "upload",
                CatalogTrack.is_published.is_(True),
                CatalogTrack.owner_user_id.isnot(None),
            )
            .order_by(CatalogTrack.created_at.desc(), CatalogTrack.id.asc())
            .limit(80)
            .all()
        )
    except SQLAlchemyError:
        return []

    candidates: List[tuple[int, Any, Dict[str, Any]]] = []
    track_ids = [row.id for row in rows if row.id and row.id not in exclude_ids]
    impression_counts: Dict[str, int] = {}
    if track_ids:
        try:
            counted = (
                db.query(Interaction.track_id, func.count(Interaction.id))
                .filter(Interaction.event == "impression", Interaction.track_id.in_(track_ids))
                .group_by(Interaction.track_id)
                .all()
            )
            impression_counts = {str(track_id): int(count or 0) for track_id, count in counted}
        except SQLAlchemyError:
            impression_counts = {}

    for row in rows:
        if row.id in exclude_ids:
            continue
        if not _upload_discovery_enabled(db, row):
            continue
        rec = _uploaded_track_recommendation(row)
        if not rec.get("audioUrl"):
            continue
        _attach_artist_conversion_fields(db, rec, getattr(row, "owner_user_id", None))
        rec["exploration"] = True
        reasons = list(rec.get("reasons") or [])
        if "Exploration slot for new listener feedback" not in reasons:
            reasons.insert(0, "Exploration slot for new listener feedback")
        rec["reasons"] = reasons[:3]
        candidates.append((impression_counts.get(row.id, 0), row.created_at, rec))

    candidates.sort(key=lambda item: (item[0], item[1] or datetime.min.replace(tzinfo=timezone.utc)))
    out: List[Dict[str, Any]] = []
    for _, _, rec in candidates:
        item_id = str(rec.get("id") or "")
        if not item_id or item_id in exclude_ids:
            continue
        out.append(rec)
        exclude_ids.add(item_id)
        if len(out) >= limit:
            break
    return out


def _managed_upload_query(db: Session, upload_id: str) -> Optional[CatalogTrack]:
    return (
        db.query(CatalogTrack)
        .options(
            selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
            selectinload(CatalogTrack.audio_assets),
        )
        .filter(CatalogTrack.id == upload_id, CatalogTrack.source_type == "upload")
        .first()
    )


def _require_upload_owner(db: Session, req: Request, upload_id: str) -> tuple[int, CatalogTrack]:
    user = _require_artist_user(req, db)
    user_id = int(user.id)
    try:
        track = _managed_upload_query(db, upload_id)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not track:
        raise HTTPException(status_code=404, detail="Upload not found")
    owner_id = getattr(track, "owner_user_id", None)
    if owner_id is not None and int(owner_id) != int(user_id):
        raise HTTPException(status_code=403, detail="You can only manage your own uploads")
    if owner_id is None:
        raise HTTPException(status_code=403, detail="This upload has no owner and can only be managed by an admin migration")
    return user_id, track


def _replace_track_artists(db: Session, track_id: str, artist: str) -> None:
    db.query(TrackArtist).filter(TrackArtist.track_id == track_id).delete(synchronize_session="fetch")
    db.flush()
    for position, artist_name in enumerate(_parse_artist_names(artist)):
        artist_row = _get_or_create_artist(db, artist_name)
        db.add(
            TrackArtist(
                track_id=track_id,
                artist_id=artist_row.id,
                role="primary" if position == 0 else "featured",
                position=position,
            )
        )


# -----------------------------
# Spotify helpers (optional)
# -----------------------------
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()

_token = {"value": "", "expires_at": 0}


def spotify_enabled() -> bool:
    return bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET)


def get_spotify_token() -> str:
    if not spotify_enabled():
        return ""

    now = int(time.time())
    if _token["value"] and now < _token["expires_at"] - 30:
        return _token["value"]

    auth = base64.b64encode(
        f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
    ).decode()

    try:
        r = requests.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"},
            timeout=15,
        )
    except requests.RequestException:
        return ""
    if r.status_code != 200:
        return ""

    data = r.json()
    _token["value"] = data.get("access_token", "") or ""
    _token["expires_at"] = now + int(data.get("expires_in", 0) or 0)
    return _token["value"]


def _safe_year(y: Optional[int]) -> Optional[int]:
    if y is None:
        return None
    try:
        y = int(y)
        if 1800 <= y <= 2100:
            return y
    except Exception:
        pass
    return None


def _track_to_playback_fields(track_obj: Dict[str, Any]) -> Dict[str, Any]:
    artists = track_obj.get("artists") or []
    first_artist = (artists[0] if artists else {}) or {}
    return {
        "previewUrl": track_obj.get("preview_url"),
        "spotifyUrl": (track_obj.get("external_urls") or {}).get("spotify"),
        "spotifyUri": track_obj.get("uri"),
        "durationMs": track_obj.get("duration_ms"),
        "spotifyArtistUrl": (first_artist.get("external_urls") or {}).get("spotify"),
        "spotifyArtistName": first_artist.get("name"),
    }


@lru_cache(maxsize=2048)
def spotify_track_lookup(title: str, artist: str) -> Optional[Dict[str, Any]]:
    token = get_spotify_token()
    if not token:
        return None

    headers = {"Authorization": f"Bearer {token}"}
    q = f'track:"{title}" artist:"{artist}"'
    url = "https://api.spotify.com/v1/search"
    params = {"q": q, "type": "track", "limit": 1}

    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
    except requests.RequestException:
        return None

    if r.status_code != 200:
        return None

    items = (r.json().get("tracks") or {}).get("items") or []
    if not items:
        return None

    t = items[0]
    images = (t.get("album") or {}).get("images") or []
    image_url = images[0]["url"] if images else None

    return {
        "spotifyId": t.get("id"),
        "imageUrl": image_url,
        "album": (t.get("album") or {}).get("name"),
        **_track_to_playback_fields(t),
    }


def spotify_search(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    token = get_spotify_token()
    if not token:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    url = "https://api.spotify.com/v1/search"
    params = {"q": query, "type": "track", "limit": int(limit)}

    try:
        response = requests.get(url, headers=headers,
                                params=params, timeout=15)
    except requests.RequestException:
        return []

    if response.status_code != 200:
        return []

    tracks = (response.json().get("tracks") or {}).get("items") or []
    results: List[Dict[str, Any]] = []

    for track in tracks:
        images = (track.get("album") or {}).get("images") or []
        image_url = images[0]["url"] if images else None

        year: Optional[str] = None
        release_date = (track.get("album") or {}).get("release_date")
        if release_date:
            year = release_date.split("-")[0]

        results.append(
            {
                "id": track.get("id"),
                "title": track.get("name"),
                "artist": (track.get("artists") or [{}])[0].get("name"),
                "year": year,
                "imageUrl": image_url,
                "source": "spotify",
                **_track_to_playback_fields(track),
            }
        )

    return results


@lru_cache(maxsize=4096)
def itunes_track_lookup(title: str, artist: str) -> Optional[Dict[str, Any]]:
    term = quote(f"{title} {artist}".strip())
    url = f"https://itunes.apple.com/search?term={term}&entity=song&limit=1"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return None
        results = (r.json() or {}).get("results") or []
        if not results:
            return None
        item = results[0] or {}
        art = item.get("artworkUrl100") or item.get("artworkUrl60") or ""
        image_url = ""
        if art:
            image_url = (
                art.replace("100x100bb.jpg", "600x600bb.jpg")
                .replace("60x60bb.jpg", "600x600bb.jpg")
            )
        return {
            "imageUrl": image_url,
            "previewUrl": item.get("previewUrl"),
            "providerUrl": item.get("trackViewUrl"),
            "durationMs": item.get("trackTimeMillis"),
        }
    except Exception:
        return None


def itunes_cover(title: str, artist: str) -> str:
    details = itunes_track_lookup(title, artist)
    if not details:
        return ""
    image_url = details.get("imageUrl")
    return image_url if isinstance(image_url, str) else ""


def cover_for(title: str, artist: str) -> str:
    # Prefer Spotify if configured
    if spotify_enabled():
        token = get_spotify_token()
        if token:
            q = f'track:"{title}" artist:"{artist}"'
            url = f"https://api.spotify.com/v1/search?type=track&limit=1&q={quote(q)}"
            try:
                r = requests.get(
                    url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
                if r.status_code == 200:
                    items = (r.json().get("tracks") or {}).get("items") or []
                    if items:
                        images = (
                            (items[0].get("album") or {}).get("images") or [])
                        if images:
                            return images[0].get("url", "") or ""
            except Exception:
                pass
    return itunes_cover(title, artist).strip()


def _try_reload_recommender() -> str:
    try:
        get_recommender().load()
        app.state.recommender_error = ""
        return ""
    except Exception as e:
        app.state.recommender_error = str(e)
        return app.state.recommender_error


# -----------------------------
# API Models
# -----------------------------
class SeedSong(BaseModel):
    title: str
    artist: Optional[str] = ""
    year: Optional[int] = None
    id: Optional[str] = None


class RecommendRequest(BaseModel):
    seeds: List[SeedSong]
    n: int = Field(default=9, ge=1, le=50)
    mode: str = Field(default="all", pattern="^(all|indie|mainstream)$")
    # Avoid repeats across sessions / refreshes (frontend keeps a rolling list)
    already_shown_ids: Optional[List[str]] = None
    distinct_id: Optional[str] = None  # for analytics (PostHog)

class FeedbackRequest(BaseModel):
    """
    Anonymous interaction feedback used for personalization and analytics.
    Recommended events: "like", "dislike", "play", "open_spotify".
    """
    track_id: str
    event: str
    distinct_id: Optional[str] = None  # optional; otherwise derived from request headers
    artist_id: Optional[int] = None
    genre_id: Optional[int] = None
    duration_ms: Optional[int] = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)
    play_position_ms: Optional[int] = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)
    source_page: Optional[str] = Field(default=None, max_length=128)
    recommendation_request_id: Optional[str] = Field(default=None, max_length=80)
    recommendation_rank: Optional[int] = Field(default=None, ge=1, le=1000)
    context: Optional[Dict[str, Any]] = None


class CatalogSyncRequest(BaseModel):
    query: Optional[str] = Field(default="", max_length=300)
    limit: int = Field(default=10, ge=1, le=50)
    enrich: bool = True


class UploadUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    artist: Optional[str] = Field(default=None, max_length=1000)
    image_url: Optional[str] = Field(default=None, max_length=2000)
    is_published: Optional[bool] = None


class UploadDiscoveryControlRequest(BaseModel):
    discovery_paused: bool
    reason: Optional[str] = Field(default=None, max_length=500)


class AdminClaimUploadRequest(BaseModel):
    owner_user_id: int = Field(ge=1)



# -----------------------------
# Startup
# -----------------------------
@app.on_event("startup")
def _startup():
    _validate_production_runtime_config()
    app.state.recommender_error = ""
    try:
        wait_for_db(timeout_s=45)
        Base.metadata.create_all(engine)
        with SessionLocal() as db:
            ensure_catalog_backfill(db)
        get_recommender().load()
        app.state.recommender_error = ""
    except Exception as e:
        app.state.recommender_error = str(e)


# -----------------------------
# Health + DB Status
# -----------------------------
@app.get("/api/ping")
def ping():
    err = getattr(app.state, "recommender_error", "")
    if err:
        err = _try_reload_recommender()
    return {"ok": True, "recommender_ready": not bool(err), "recommender_error": err}


@app.get("/api/db_status")
def db_status():
    try:
        wait_for_db(timeout_s=10)
        Base.metadata.create_all(engine)
        with engine.connect() as conn:
            dialect = (getattr(engine.dialect, "name", "") or "").lower()
            if dialect == "postgresql":
                legacy_exists = bool(conn.execute(text("SELECT to_regclass('public.tracks')")).scalar_one())
                catalog_exists = bool(conn.execute(text("SELECT to_regclass('public.catalog_tracks')")).scalar_one())
                features_exists = bool(conn.execute(text("SELECT to_regclass('public.audio_features')")).scalar_one())
            else:
                inspector = inspect(engine)
                legacy_exists = inspector.has_table("tracks")
                catalog_exists = inspector.has_table("catalog_tracks")
                features_exists = inspector.has_table("audio_features")

            legacy_count = int(conn.execute(text("SELECT COUNT(*) FROM tracks")).scalar_one()) if legacy_exists else 0
            catalog_count = int(conn.execute(text("SELECT COUNT(*) FROM catalog_tracks")).scalar_one()) if catalog_exists else 0
            feature_count = int(conn.execute(text("SELECT COUNT(*) FROM audio_features")).scalar_one()) if features_exists else 0
            return {
                "ok": True,
                "tracks_exists": legacy_exists,
                "tracks_count": legacy_count,
                "catalog_tracks_exists": catalog_exists,
                "catalog_tracks_count": catalog_count,
                "audio_features_exists": features_exists,
                "audio_features_count": feature_count,
                "catalog_ready": bool(catalog_exists and features_exists and catalog_count > 0 and feature_count > 0),
            }
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.get("/api/catalog/sync/status")
def catalog_sync_status_endpoint(limit: int = 5, db: Session = Depends(get_db)):
    try:
        return catalog_sync_status(db, limit=limit)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.post("/api/admin/catalog/sync")
def catalog_sync_endpoint(req: CatalogSyncRequest, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        return sync_current_catalog(
            db,
            query=(req.query or "").strip(),
            limit=req.limit,
            enrich=bool(req.enrich),
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Catalog sync failed: {exc}")


@app.post("/api/admin/recommender/reward-artifact")
def recommender_reward_artifact_endpoint(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        artifact = write_reward_artifact(db=db)
        return {
            "ok": True,
            "version": artifact.get("version"),
            "generatedAt": artifact.get("generatedAt"),
            "trackCount": artifact.get("trackCount", 0),
            "artifactStore": artifact.get("artifactStore", "file"),
            "artifactName": artifact.get("artifactName") or artifact.get("artifactPath"),
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not build recommender reward artifact: {exc}")


@app.get("/api/admin/recommender/metrics")
def recommender_metrics_endpoint(request: Request, days: int = 7, db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        return compute_recommender_metrics(db, days=max(1, min(int(days or 7), 90)))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not compute recommender metrics: {exc}")


@app.get("/api/admin/recommender/evaluation")
def recommender_evaluation_endpoint(request: Request, days: int = 30, db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        return evaluate_reward_artifact(db, days=max(1, min(int(days or 30), 180)))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not evaluate recommender artifact: {exc}")


@app.get("/api/admin/recommender/artifacts")
def recommender_artifacts_endpoint(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        return list_reward_artifacts(db=db)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not list recommender artifacts: {exc}")


@app.post("/api/admin/recommender/rollback")
def recommender_rollback_endpoint(request: Request, payload: Dict[str, Any] = Body(default_factory=dict), db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        name = str(payload.get("name") or "").strip() or None
        return rollback_reward_artifact(name=name, db=db)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not rollback recommender artifact: {exc}")


@app.post("/api/admin/recommender/training-dataset")
def recommender_training_dataset_endpoint(request: Request, payload: Dict[str, Any] = Body(default_factory=dict), db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        days = max(1, min(int(payload.get("days") or 90), 365))
        return write_training_dataset(db=db, days=days)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not build recommender training dataset: {exc}")


@app.post("/api/admin/recommender/train-ranker")
def recommender_train_ranker_endpoint(request: Request, payload: Dict[str, Any] = Body(default_factory=dict), db: Session = Depends(get_db)):
    _require_admin(request)
    try:
        days = max(1, min(int(payload.get("days") or 90), 365))
        dataset = write_training_dataset(db=db, days=days)
        ranker = train_ranker_artifact(db=db, days=days)
        return {
            "ok": True,
            "dataset": dataset,
            "ranker": {
                "kind": ranker.get("kind"),
                "generatedAt": ranker.get("generatedAt"),
                "trackCount": ranker.get("trackCount", 0),
                "artifactStore": ranker.get("artifactStore", "file"),
                "artifactName": ranker.get("artifactName") or ranker.get("artifactPath"),
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not train recommender ranker: {exc}")


@app.post("/api/reload")
def reload_now():
    err = _try_reload_recommender()
    return {"ok": True, "recommender_ready": not bool(err), "recommender_error": err}


# -----------------------------
# Search
# -----------------------------
def _catalog_search_schema_ready() -> bool:
    inspector = inspect(engine)
    required = {
        "catalog_tracks": {column.name for column in CatalogTrack.__table__.columns},
        "audio_features": {column.name for column in AudioFeatures.__table__.columns},
        "track_artists": {column.name for column in TrackArtist.__table__.columns},
        "artists": {column.name for column in Artist.__table__.columns},
    }
    existing_tables = set(inspector.get_table_names())
    if not set(required).issubset(existing_tables):
        return False

    for table_name, columns in required.items():
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        if not columns.issubset(existing_columns):
            return False

    return True


def db_search(db: Session, q: str, limit: int = 8):
    q2 = f"%{q}%"
    ranked_track_ids = []

    if _catalog_search_schema_ready():
        try:
            ranked_track_ids = (
                db.query(
                    CatalogTrack.id.label("track_id"),
                    func.max(func.coalesce(AudioFeatures.popularity, -1)).label("rank_popularity"),
                    func.max(CatalogTrack.created_at).label("rank_created_at"),
                )
                .outerjoin(AudioFeatures, AudioFeatures.track_id == CatalogTrack.id)
                .outerjoin(TrackArtist, TrackArtist.track_id == CatalogTrack.id)
                .outerjoin(Artist, Artist.id == TrackArtist.artist_id)
                .filter(
                    CatalogTrack.is_published.is_(True),
                    or_(CatalogTrack.canonical_title.ilike(q2), Artist.name.ilike(q2)),
                )
                .group_by(CatalogTrack.id)
                .order_by(
                    func.max(func.coalesce(AudioFeatures.popularity, -1)).desc(),
                    func.max(CatalogTrack.created_at).desc(),
                )
                .limit(int(limit))
                .all()
            )
        except SQLAlchemyError:
            db.rollback()
            ranked_track_ids = []

    track_ids = [row.track_id for row in ranked_track_ids]
    if track_ids:
        rows = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_features),
            )
            .filter(CatalogTrack.id.in_(track_ids))
            .all()
        )
        row_map = {row.id: row for row in rows}
        return [
            {
                "title": row_map[track_id].canonical_title,
                "artist": _catalog_track_artist_text(row_map[track_id]),
                "year": int(row_map[track_id].release_year) if row_map[track_id].release_year is not None else None,
                "id": row_map[track_id].id,
                "imageUrl": (getattr(row_map[track_id], "image_url", "") or ""),
                "source": "db",
                "previewUrl": None,
                "spotifyUrl": None,
                "spotifyUri": None,
                "durationMs": row_map[track_id].duration_ms,
            }
            for track_id in track_ids
            if track_id in row_map
        ]

    legacy_rows = (
        db.query(Track)
        .filter(or_(Track.name.ilike(q2), Track.artists.ilike(q2)))
        .order_by(Track.popularity.desc())
        .limit(int(limit))
        .all()
    )
    return [
        {
            "title": r.name,
            "artist": r.artists,
            "year": int(r.year),
            "id": r.id,
            "imageUrl": (getattr(r, "image_url", "") or ""),
            "source": "db",
            "previewUrl": None,
            "spotifyUrl": None,
            "spotifyUri": None,
            "durationMs": None,
        }
        for r in legacy_rows
    ]


@app.get("/api/search")
def search_endpoint(
    q: str,
    limit: int = 8,
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    q = (q or "").strip()
    limit = max(1, min(int(limit or 8), 50))

    source = "db"
    results: List[Dict[str, Any]] = []

    if len(q) >= 2:
        res = spotify_search(q, limit=limit)
        if res:
            source = "spotify"
            results = res
        else:
            results = db_search(db, q, limit=limit)

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request)
            a.capture(
                background_tasks,
                distinct_id=did,
                event="search",
                properties={
                    "q_len": len(q),
                    "limit": limit,
                    "source": source,
                },
            )
    except Exception:
        pass

    return {"results": results}


# -----------------------------
# Recommend
# -----------------------------
@app.post("/api/recommend")
def recommend_endpoint(req: RecommendRequest, request: Request = None, background_tasks: BackgroundTasks = None, db: Session = Depends(get_db)):
    recommendation_request_id = uuid.uuid4().hex
    err = getattr(app.state, "recommender_error", "")
    if err:
        err = _try_reload_recommender()
    if err:
        raise HTTPException(status_code=500, detail=f"Recommender not ready: {err}")

    seeds: List[Dict[str, Any]] = []
    for s in req.seeds:
        seeds.append(
            {
                "title": s.title,
                "artist": s.artist or "",
                "year": _safe_year(s.year),
                "id": (s.id or "").strip() or None,
            }
        )

    try:
        did = None
        user_id = None
        try:
            if request is not None:
                did = get_analytics().distinct_id(request, explicit=req.distinct_id)
        except Exception:
            did = req.distinct_id
        try:
            if request is not None:
                user_id = get_current_user_id(request)
        except Exception:
            user_id = None

        # Personalization signals from feedback (best-effort)
        liked_ids: List[str] = []
        superliked_ids: List[str] = []
        disliked_ids: List[str] = []
        if did:
            try:
                rows = (
                    db.query(Interaction)
                    .filter(Interaction.distinct_id == did)
                    .order_by(Interaction.created_at.desc())
                    .limit(200)
                    .all()
                )
                # Use latest signal per track to avoid conflicting history (e.g., liked then disliked).
                latest_by_track: Dict[str, str] = {}
                for r0 in rows:
                    tid = (r0.track_id or "").strip()
                    ev = (r0.event or "").strip().lower()
                    if not tid or ev not in {"like", "superlike", "dislike"}:
                        continue
                    if tid in latest_by_track:
                        continue
                    latest_by_track[tid] = ev

                for tid, ev in latest_by_track.items():
                    if ev == "like":
                        liked_ids.append(tid)
                    elif ev == "superlike":
                        superliked_ids.append(tid)
                    elif ev == "dislike":
                        disliked_ids.append(tid)
            except Exception:
                pass

        listener_settings = _settings_for_user_id(db, user_id) if user_id is not None else _settings_payload(None)
        personalized_enabled = bool((listener_settings.get("privacy") or {}).get("personalizedRecommendations", True))
        if not personalized_enabled:
            liked_ids = []
            superliked_ids = []
            disliked_ids = []
        engagement_scores = _recommendation_engagement_scores(db, did) if personalized_enabled else {}
        exclude_ids = [x for x in (req.already_shown_ids or []) if isinstance(x, str) and x.strip()]
        recs = get_recommender().recommend(
            seeds,
            n=req.n,
            mode=req.mode,
            liked_ids=liked_ids,
            superliked_ids=superliked_ids,
            disliked_ids=disliked_ids,
            exclude_ids=exclude_ids,
            engagement_scores=engagement_scores,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommender failed: {str(e)}")

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request, explicit=req.distinct_id)
            a.capture(
                background_tasks,
                distinct_id=did,
                event="recommend",
                properties={
                    "n": int(req.n),
                    "mode": (req.mode or "all"),
                    "seeds_count": len(req.seeds or []),
                    "already_shown_count": len(req.already_shown_ids or []),
                },
            )
    except Exception:
        pass

    out: List[Dict[str, Any]] = []
    musicians: Dict[str, Dict[str, Any]] = {}
    updates: List[Dict[str, str]] = []  # for bulk image_url persistence

    # If a track has an uploaded full-audio file, include an `audioUrl` the frontend can play.
    audio_ids: set[str] = set()
    try:
        candidate_ids = [str(r.get("id") or "").strip() for r in recs]
        candidate_ids = [x for x in candidate_ids if x]
        if candidate_ids:
            rows = db.query(TrackAudio.track_id).filter(TrackAudio.track_id.in_(candidate_ids)).all()
            audio_ids = set([r0[0] for r0 in rows if r0 and r0[0]])
    except Exception:
        audio_ids = set()

    for rank, r in enumerate(recs, start=1):
        title = (r.get("title") or "").strip()
        artist = (r.get("artist") or "").strip()
        details: Optional[Dict[str, Any]] = None

        raw_image = r.get("imageUrl", "")
        image_url = (raw_image if isinstance(raw_image, str) else "").strip()
        if not image_url:
            image_url = cover_for(title, artist).strip()

        preview_url = r.get("previewUrl")
        spotify_url = r.get("spotifyUrl")
        spotify_uri = r.get("spotifyUri")
        duration_ms = r.get("durationMs")

        if spotify_enabled():
            details = spotify_track_lookup(title, artist)
            if details:
                preview_url = details.get("previewUrl") or preview_url
                spotify_url = details.get("spotifyUrl") or spotify_url
                spotify_uri = details.get("spotifyUri") or spotify_uri
                duration_ms = details.get("durationMs") or duration_ms
                if not image_url:
                    dimg = details.get("imageUrl")
                    if isinstance(dimg, str) and dimg.strip():
                        image_url = dimg.strip()

        if not preview_url:
            apple_details = itunes_track_lookup(title, artist)
            if apple_details:
                preview_url = apple_details.get("previewUrl") or preview_url
                duration_ms = apple_details.get("durationMs") or duration_ms
                if not image_url:
                    dimg = apple_details.get("imageUrl")
                    if isinstance(dimg, str) and dimg.strip():
                        image_url = dimg.strip()

        tid = (r.get("id") or "").strip()
        if image_url and tid:
            updates.append({"u": image_url, "i": tid})

        audio_url = f"/api/audio/{tid}" if tid and tid in audio_ids else None

        out.append(
            {
                **r,
                "recommendationRequestId": recommendation_request_id,
                "recommendationRank": rank,
                "imageUrl": image_url,
                "previewUrl": preview_url,
                "spotifyUrl": spotify_url,
                "spotifyUri": spotify_uri,
                "durationMs": duration_ms,
                "audioUrl": audio_url,
                "spotifyArtistUrl": (details.get("spotifyArtistUrl") if spotify_enabled() and details else None),
            }
        )

        artist_name = artist or "Unknown Artist"
        key = artist_name.lower().strip()
        if key not in musicians:
            musicians[key] = {
                "id": str(uuid.uuid4()),
                "name": artist_name,
                "imageUrl": image_url,
                "spotifyUrl": (details.get("spotifyArtistUrl") if spotify_enabled() and details else None),
                "topTracks": [],
                "reasons": [],
                "concertsUrl": f"https://www.songkick.com/search?query={quote(artist_name)}",
            }
        m = musicians[key]
        if title and title not in m["topTracks"] and len(m["topTracks"]) < 3:
            m["topTracks"].append(title)
        for reason in (r.get("reasons") or []):
            if isinstance(reason, str) and reason and reason not in m["reasons"] and len(m["reasons"]) < 2:
                m["reasons"].append(reason)

    # Best-effort bulk persistence (single session)
    if updates:
        try:
            db = SessionLocal()
            db.execute(
                text(
                    "UPDATE tracks SET image_url = :u "
                    "WHERE id = :i AND (image_url IS NULL OR image_url = '')"
                ),
                updates,
            )
            db.commit()
        except Exception:
            pass
        finally:
            try:
                db.close()
            except Exception:
                pass

    try:
        current_ids = {str(item.get("id") or "").strip() for item in out if str(item.get("id") or "").strip()}
        seed_ids = {str(seed.get("id") or "").strip() for seed in seeds if str(seed.get("id") or "").strip()}
        excluded_for_uploads = current_ids | seed_ids | {str(x).strip() for x in exclude_ids if str(x).strip()}
        upload_limit = 3 if (req.mode or "all") == "indie" else 2
        upload_recs = _featured_upload_recommendations(db, excluded_for_uploads, upload_limit)
        if upload_recs:
            if (req.mode or "all") == "indie":
                mixed = upload_recs + out
            else:
                split_at = min(3, len(out))
                mixed = out[:split_at] + upload_recs + out[split_at:]

            deduped: List[Dict[str, Any]] = []
            seen: set[str] = set()
            for item in mixed:
                item_id = str(item.get("id") or "").strip()
                if not item_id or item_id in seen:
                    continue
                seen.add(item_id)
                deduped.append(item)
            out = deduped[: int(req.n)]
    except Exception:
        pass

    try:
        current_ids = {str(item.get("id") or "").strip() for item in out if str(item.get("id") or "").strip()}
        seed_ids = {str(seed.get("id") or "").strip() for seed in seeds if str(seed.get("id") or "").strip()}
        excluded_for_exploration = current_ids | seed_ids | {str(x).strip() for x in exclude_ids if str(x).strip()}
        exploration_limit = 2 if (req.mode or "all") == "indie" else 1
        exploration_recs = _exploration_upload_recommendations(db, excluded_for_exploration, exploration_limit)
        if exploration_recs:
            base_limit = max(0, int(req.n) - len(exploration_recs))
            out = (out[:base_limit] + exploration_recs)[: int(req.n)]
    except Exception:
        pass

    for rank, item in enumerate(out, start=1):
        item["recommendationRequestId"] = recommendation_request_id
        item["recommendationRank"] = rank
        if item.get("sourceType") == "upload" or item.get("source") == "upload":
            artist_name = str(item.get("artist") or "Unknown Artist").strip() or "Unknown Artist"
            key = artist_name.lower()
            if key not in musicians:
                musicians[key] = {
                    "id": str(uuid.uuid4()),
                    "name": artist_name,
                    "imageUrl": item.get("imageUrl"),
                    "spotifyUrl": None,
                    "topTracks": [],
                    "reasons": [],
                    "concertsUrl": f"https://www.songkick.com/search?query={quote(artist_name)}",
                    "conversionLinks": item.get("artistConversionLinks") or {},
                }
            if item.get("artistConversionLinks"):
                musicians[key]["conversionLinks"] = item.get("artistConversionLinks")
            title = str(item.get("title") or "").strip()
            if title and title not in musicians[key]["topTracks"] and len(musicians[key]["topTracks"]) < 3:
                musicians[key]["topTracks"].append(title)

    try:
        _record_recommendation_impressions(
            db,
            distinct_id=did,
            user_id=user_id,
            request_id=recommendation_request_id,
            recommendations=out,
            seeds=seeds,
            mode=(req.mode or "all"),
        )
    except Exception:
        pass

    musician_list = list(musicians.values())[:6]
    return {"recommendationRequestId": recommendation_request_id, "recommendations": out, "musicians": musician_list}




@app.post("/api/feedback")
def feedback_endpoint(
    req: FeedbackRequest,
    request: Request = None,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    """
    Records a user interaction. This enables:
      - "thumbs up/down" personalization
      - better re-ranking (avoid disliked tracks)
      - product analytics (PostHog)
    """
    event = (req.event or "").strip().lower()
    allowed_events = {
        "impression",
        "like",
        "superlike",
        "dislike",
        "not_interested",
        "save",
        "share",
        "replay",
        "play",
        "play_start",
        "play_30s",
        "play_complete",
        "skip",
        "open_spotify",
        "click_recommendation",
        "upload_play",
        "genre_click",
        "artist_click",
        "follow_artist",
    }
    if event not in allowed_events:
        raise HTTPException(status_code=400, detail="Invalid event")

    track_id = (req.track_id or "").strip()
    if not track_id:
        raise HTTPException(status_code=400, detail="Missing track_id")
    if len(track_id) > 256:
        raise HTTPException(status_code=400, detail="Invalid track_id")

    explicit_distinct = (req.distinct_id or "").strip() or None
    distinct_id = explicit_distinct or "anonymous"
    try:
        if request is not None:
            distinct_id = get_analytics().distinct_id(request, explicit=explicit_distinct) or distinct_id
    except Exception:
        pass

    user_id = None
    try:
        if request is not None:
            user_id = get_current_user_id(request)
    except Exception:
        user_id = None

    # persist interaction
    try:
        # Suppress immediate duplicate signals for same user/track/event.
        last = (
            db.query(Interaction)
            .filter(
                Interaction.distinct_id == distinct_id,
                Interaction.track_id == track_id,
                Interaction.event == event,
            )
            .order_by(Interaction.created_at.desc())
            .first()
        )
        should_insert = True
        if last and getattr(last, "created_at", None):
            try:
                delta = (_now_utc() - last.created_at).total_seconds()
                if delta < 5:
                    should_insert = False
            except Exception:
                pass

        if should_insert:
            context_payload = dict(req.context or {})
            if req.recommendation_request_id:
                context_payload["request_id"] = req.recommendation_request_id
            if req.recommendation_rank is not None:
                context_payload["rank"] = req.recommendation_rank
            context_json = (
                json.dumps(context_payload, ensure_ascii=True, default=str)[:20000]
                if context_payload
                else None
            )
            db.add(
                Interaction(
                    distinct_id=distinct_id,
                    user_id=user_id,
                    track_id=track_id,
                    artist_id=req.artist_id,
                    genre_id=req.genre_id,
                    event=event,
                    duration_ms=req.duration_ms,
                    play_position_ms=req.play_position_ms,
                    source_page=(req.source_page or "").strip() or None,
                    context_json=context_json,
                )
            )
            if event in QUALIFIED_ARTIST_EVENTS:
                owned_track = (
                    db.query(CatalogTrack)
                    .filter(
                        CatalogTrack.id == track_id,
                        CatalogTrack.source_type == "upload",
                        CatalogTrack.owner_user_id.isnot(None),
                    )
                    .first()
                )
                owner_id = int(getattr(owned_track, "owner_user_id", 0) or 0) if owned_track else 0
                if owner_id and owner_id != user_id:
                    notification_type = "conversion" if event in CONVERSION_EVENTS else "listener"
                    event_label = {
                        "like": "liked",
                        "superlike": "superliked",
                        "save": "saved",
                        "play_complete": "finished",
                        "open_spotify": "opened your Spotify link for",
                        "artist_click": "opened your artist profile from",
                        "follow_artist": "followed after hearing",
                        "share": "shared",
                    }.get(event, event.replace("_", " "))
                    title = "New conversion" if notification_type == "conversion" else "New listener signal"
                    _create_notification(
                        db,
                        owner_id,
                        notification_type,
                        title,
                        f"A listener {event_label} {owned_track.canonical_title}.",
                        "/profile/dashboard",
                    )
            db.commit()
    except Exception:
        db.rollback()

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request, explicit=distinct_id)
            a.capture(
                background_tasks,
                distinct_id=did,
                event="feedback",
                properties={"event": event, "source_page": (req.source_page or None)},
            )
    except Exception:
        pass

    return {"ok": True}


def _interaction_weight(event: str) -> float:
    return {
        "impression": 0.0,
        "superlike": 6.0,
        "save": 5.0,
        "follow_artist": 4.5,
        "replay": 4.5,
        "like": 4.0,
        "play_complete": 4.0,
        "play_30s": 3.0,
        "upload_play": 3.0,
        "play": 2.0,
        "play_start": 1.5,
        "click_recommendation": 1.5,
        "open_spotify": 1.0,
        "artist_click": 1.0,
        "genre_click": 1.0,
        "share": 1.0,
        "skip": -1.5,
        "dislike": -2.0,
        "not_interested": -4.0,
    }.get((event or "").strip().lower(), 1.0)


def _reward_score(raw_score: float, impressions: int = 0) -> float:
    exposure = max(1.0, float(impressions or 0) ** 0.5)
    return max(-1.0, min(1.0, float(raw_score) / (8.0 + exposure)))


def _recommendation_engagement_scores(db: Session, distinct_id: Optional[str]) -> Dict[str, float]:
    """
    Compact behavior score used by the online ranker.

    This is intentionally simple and explainable for production MVP:
    global track quality gives every listener a cold-start signal, while a
    listener's own events have stronger weight. A learned ranker can later train
    from the same impressions and feedback rows.
    """
    allowed_events = {
        "impression",
        "superlike",
        "save",
        "follow_artist",
        "replay",
        "like",
        "play_complete",
        "play_30s",
        "upload_play",
        "play",
        "play_start",
        "click_recommendation",
        "open_spotify",
        "artist_click",
        "share",
        "skip",
        "dislike",
        "not_interested",
    }
    scores: Dict[str, float] = {}
    try:
        scores.update(load_reward_scores(db=db))
    except Exception:
        scores = {}
    try:
        for tid, value in load_ranker_scores(db=db).items():
            scores[tid] = max(-1.0, min(1.0, scores.get(tid, 0.0) + 0.35 * float(value)))
    except Exception:
        pass
    impressions: Dict[str, int] = {}

    try:
        rows = (
            db.query(Interaction.track_id, Interaction.event, func.count(Interaction.id))
            .filter(Interaction.event.in_(allowed_events))
            .group_by(Interaction.track_id, Interaction.event)
            .limit(5000)
            .all()
        )
        raw: Dict[str, float] = {}
        for track_id, event, count in rows:
            tid = (track_id or "").strip()
            if not tid:
                continue
            c = int(count or 0)
            ev = (event or "").strip().lower()
            if ev == "impression":
                impressions[tid] = impressions.get(tid, 0) + c
                continue
            raw[tid] = raw.get(tid, 0.0) + _interaction_weight(ev) * c

        for tid, value in raw.items():
            scores[tid] = 0.45 * _reward_score(value, impressions.get(tid, 0))
    except Exception:
        pass

    if distinct_id:
        try:
            rows = (
                db.query(Interaction)
                .filter(Interaction.distinct_id == distinct_id)
                .order_by(Interaction.created_at.desc())
                .limit(400)
                .all()
            )
            personal_raw: Dict[str, float] = {}
            personal_impressions: Dict[str, int] = {}
            for row in rows:
                tid = (row.track_id or "").strip()
                ev = (row.event or "").strip().lower()
                if not tid or ev not in allowed_events:
                    continue
                if ev == "impression":
                    personal_impressions[tid] = personal_impressions.get(tid, 0) + 1
                    continue
                personal_raw[tid] = personal_raw.get(tid, 0.0) + _interaction_weight(ev)
            for tid, value in personal_raw.items():
                scores[tid] = max(-1.0, min(1.0, scores.get(tid, 0.0) + 0.75 * _reward_score(value, personal_impressions.get(tid, 0))))
        except Exception:
            pass

    return scores


def _record_recommendation_impressions(
    db: Session,
    *,
    distinct_id: Optional[str],
    user_id: Optional[int],
    request_id: str,
    recommendations: List[Dict[str, Any]],
    seeds: List[Dict[str, Any]],
    mode: str,
) -> None:
    if not distinct_id or not recommendations:
        return
    seed_ids = [str(seed.get("id") or "").strip() for seed in seeds if str(seed.get("id") or "").strip()]
    try:
        for rank, item in enumerate(recommendations, start=1):
            track_id = str(item.get("id") or "").strip()
            if not track_id:
                continue
            context = {
                "request_id": request_id,
                "rank": rank,
                "mode": mode,
                "seed_ids": seed_ids,
                "source": item.get("source"),
                "source_type": item.get("sourceType"),
                "reasons": item.get("reasons") or [],
            }
            db.add(
                Interaction(
                    distinct_id=distinct_id,
                    user_id=user_id,
                    track_id=track_id,
                    event="impression",
                    source_page="recommendations",
                    context_json=json.dumps(context, ensure_ascii=True, default=str)[:20000],
                )
            )
        db.commit()
    except Exception:
        db.rollback()


def _add_graph_node(nodes: Dict[str, Dict[str, Any]], node_id: str, **values: Any) -> Dict[str, Any]:
    node = nodes.get(node_id)
    if node is None:
        node = {"id": node_id, **values}
        nodes[node_id] = node
    else:
        for key, value in values.items():
            if value not in (None, "", []):
                node[key] = value
    return node


def _add_graph_edge(edges: Dict[str, Dict[str, Any]], source: str, target: str, relation: str, weight: float = 1.0) -> None:
    edge_id = f"{source}->{target}:{relation}"
    edge = edges.get(edge_id)
    if edge is None:
        edges[edge_id] = {
            "id": edge_id,
            "source": source,
            "target": target,
            "relation": relation,
            "weight": float(weight),
        }
    else:
        edge["weight"] = float(edge.get("weight", 0)) + float(weight)


@app.get("/api/profile/music-web")
def profile_music_web(
    distinct_id: str = "",
    limit: int = 120,
    request: Request = None,
    db: Session = Depends(get_db),
):
    explicit_distinct = (distinct_id or "").strip() or None
    did = explicit_distinct or "anonymous"
    try:
        if request is not None:
            did = get_analytics().distinct_id(request, explicit=explicit_distinct) or did
    except Exception:
        pass

    user_id = None
    try:
        if request is not None:
            user_id = get_current_user_id(request)
    except Exception:
        user_id = None

    limit = max(20, min(int(limit or 120), 300))
    try:
        filters = [Interaction.distinct_id == did]
        if user_id is not None:
            filters.append(Interaction.user_id == user_id)
        rows = (
            db.query(Interaction)
            .filter(or_(*filters))
            .order_by(Interaction.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable")

    track_ids = []
    for row in rows:
        tid = (row.track_id or "").strip()
        if tid and tid not in track_ids:
            track_ids.append(tid)

    catalog_rows: Dict[str, CatalogTrack] = {}
    legacy_rows: Dict[str, Track] = {}
    if track_ids:
        try:
            catalog = (
                db.query(CatalogTrack)
                .options(
                    selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                    selectinload(CatalogTrack.genre_links).selectinload(TrackGenre.genre),
                    selectinload(CatalogTrack.audio_assets),
                )
                .filter(CatalogTrack.id.in_(track_ids))
                .all()
            )
            catalog_rows = {row.id: row for row in catalog}
            missing = [tid for tid in track_ids if tid not in catalog_rows]
            if missing:
                legacy = db.query(Track).filter(Track.id.in_(missing)).all()
                legacy_rows = {row.id: row for row in legacy}
        except SQLAlchemyError:
            raise HTTPException(status_code=503, detail="Database unavailable")

    nodes: Dict[str, Dict[str, Any]] = {}
    edges: Dict[str, Dict[str, Any]] = {}
    user_node_id = f"user:{did}"
    _add_graph_node(nodes, user_node_id, type="user", label="You", weight=8)

    artist_scores: Dict[str, float] = {}
    genre_scores: Dict[str, float] = {}
    event_counts: Dict[str, int] = {}

    for row in rows:
        event = (row.event or "").strip().lower()
        event_counts[event] = event_counts.get(event, 0) + 1
        weight = _interaction_weight(event)
        tid = (row.track_id or "").strip()
        if not tid:
            continue

        track_node_id = f"track:{tid}"
        catalog_track = catalog_rows.get(tid)
        legacy_track = legacy_rows.get(tid)
        title = tid
        artist_text = ""
        image_url = None
        source = "interaction"
        if catalog_track:
            title = catalog_track.canonical_title
            artist_text = _catalog_track_artist_text(catalog_track)
            image_url = catalog_track.image_url
            source = catalog_track.source_type or "catalog"
        elif legacy_track:
            title = legacy_track.name
            artist_text = legacy_track.artists
            image_url = legacy_track.image_url
            source = "legacy"

        track_node = _add_graph_node(
            nodes,
            track_node_id,
            type="track",
            label=title,
            subtitle=artist_text,
            imageUrl=image_url,
            source=source,
            sourceType=getattr(catalog_track, "source_type", None) if catalog_track else source,
            audioUrl=f"/api/uploads/{tid}/stream" if catalog_track and _catalog_track_primary_asset(catalog_track, kind="full") else None,
            weight=1,
        )
        track_node["weight"] = float(track_node.get("weight", 0)) + max(0.25, abs(weight))
        track_node["lastEvent"] = event
        track_node["lastSeenAt"] = row.created_at
        _add_graph_edge(edges, user_node_id, track_node_id, event or "interaction", weight)

        if catalog_track:
            for link in catalog_track.artist_links:
                if not link.artist:
                    continue
                artist_node_id = f"artist:{link.artist_id}"
                artist_scores[link.artist.name] = artist_scores.get(link.artist.name, 0) + max(0.25, weight)
                _add_graph_node(
                    nodes,
                    artist_node_id,
                    type="artist",
                    label=link.artist.name,
                    weight=artist_scores[link.artist.name],
                )
                _add_graph_edge(edges, track_node_id, artist_node_id, "artist", 1.0)
                _add_graph_edge(edges, user_node_id, artist_node_id, "taste", max(0.25, weight / 2))

            for link in catalog_track.genre_links:
                if not link.genre:
                    continue
                genre_node_id = f"genre:{link.genre_id}"
                genre_scores[link.genre.name] = genre_scores.get(link.genre.name, 0) + max(0.25, weight)
                _add_graph_node(
                    nodes,
                    genre_node_id,
                    type="genre",
                    label=link.genre.name,
                    weight=genre_scores[link.genre.name],
                )
                _add_graph_edge(edges, track_node_id, genre_node_id, "genre", float(link.weight or 1.0))
                _add_graph_edge(edges, user_node_id, genre_node_id, "taste", max(0.25, weight / 2))

    listener_artist_scores = dict(artist_scores)
    listener_genre_scores = dict(genre_scores)

    try:
        discovery_uploads = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.genre_links).selectinload(TrackGenre.genre),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(CatalogTrack.source_type == "upload", CatalogTrack.is_published.is_(True))
            .order_by(CatalogTrack.created_at.desc())
            .limit(24)
            .all()
        )
    except SQLAlchemyError:
        discovery_uploads = []

    def _candidate_fit(track: CatalogTrack) -> tuple[float, str]:
        artist_names = [
            link.artist.name
            for link in track.artist_links
            if link.artist and link.artist.name
        ]
        genre_names = [
            link.genre.name
            for link in track.genre_links
            if link.genre and link.genre.name
        ]
        artist_fit = sum(float(listener_artist_scores.get(name, 0)) for name in artist_names)
        genre_fit = sum(float(listener_genre_scores.get(name, 0)) for name in genre_names)
        fit = artist_fit * 1.4 + genre_fit
        if genre_fit > 0 and genre_names:
            matched = max(genre_names, key=lambda name: float(listener_genre_scores.get(name, 0)))
            return fit, f"Matches your {matched} taste and needs real listener signals."
        if artist_fit > 0 and artist_names:
            matched = max(artist_names, key=lambda name: float(listener_artist_scores.get(name, 0)))
            return fit, f"Near your {matched} graph and ready for a discovery test."
        return fit, "Under-discovered musician upload ready for a first listener test."

    playable_uploads = [
        track
        for track in discovery_uploads
        if track.id not in track_ids and _catalog_track_primary_asset(track, kind="full") is not None and _upload_discovery_enabled(db, track)
    ]
    ranked_uploads = sorted(
        playable_uploads,
        key=lambda track: (_candidate_fit(track)[0], str(getattr(track, "created_at", ""))),
        reverse=True,
    )
    upload_candidates = ranked_uploads[:12]
    upload_metrics, _, _, _ = _artist_upload_metrics(db, [track.id for track in upload_candidates])
    for index, track in enumerate(upload_candidates):
        item = _attach_upload_metrics(track, _serialize_uploaded_catalog_track(track, db), upload_metrics.get(track.id) or {})
        score = ((item.get("metrics") or {}).get("discoveryScore") or {})
        fit_score, discovery_reason = _candidate_fit(track)
        track_node_id = f"track:{track.id}"
        artist_text = _catalog_track_artist_text(track)
        node = _add_graph_node(
            nodes,
            track_node_id,
            type="track",
            label=track.canonical_title,
            subtitle=artist_text,
            imageUrl=track.image_url,
            source="upload",
            sourceType="upload",
            audioUrl=item.get("audioUrl"),
            artistConversionLinks=_conversion_links_for_user(db, getattr(track, "owner_user_id", None)),
            discoveryScore=score,
            discoveryReason=discovery_reason,
            isDiscoveryCandidate=True,
            weight=max(2.0, 9.0 - index * 0.35 + min(6.0, fit_score) + float(score.get("value") or 0) / 18.0),
        )
        node["lastEvent"] = node.get("lastEvent") or "discovery_candidate"
        _add_graph_edge(
            edges,
            user_node_id,
            track_node_id,
            "discovery",
            max(1.5, 1.0 + min(4.0, fit_score) + float(score.get("value") or 35) / 22.0),
        )

        for link in track.artist_links:
            if not link.artist:
                continue
            artist_node_id = f"artist:{link.artist_id}"
            artist_scores[link.artist.name] = artist_scores.get(link.artist.name, 0) + 1.25
            _add_graph_node(nodes, artist_node_id, type="artist", label=link.artist.name, weight=artist_scores[link.artist.name])
            _add_graph_edge(edges, track_node_id, artist_node_id, "artist", 1.0)
        for link in track.genre_links:
            if not link.genre:
                continue
            genre_node_id = f"genre:{link.genre_id}"
            genre_scores[link.genre.name] = genre_scores.get(link.genre.name, 0) + 1.0
            _add_graph_node(nodes, genre_node_id, type="genre", label=link.genre.name, weight=genre_scores[link.genre.name])
            _add_graph_edge(edges, track_node_id, genre_node_id, "genre", float(link.weight or 1.0))

    top_artists = [
        {"name": name, "score": round(score, 2)}
        for name, score in sorted(artist_scores.items(), key=lambda item: item[1], reverse=True)[:8]
    ]
    top_genres = [
        {"name": name, "score": round(score, 2)}
        for name, score in sorted(genre_scores.items(), key=lambda item: item[1], reverse=True)[:8]
    ]

    return {
        "distinctId": did,
        "hasData": bool(rows or upload_candidates),
        "nodes": list(nodes.values()),
        "edges": list(edges.values()),
        "stats": {
            "events": event_counts,
            "topArtists": top_artists,
            "topGenres": top_genres,
            "trackCount": len(track_ids),
            "interactionCount": len(rows),
            "discoveryCandidateCount": len(upload_candidates),
        },
    }


class PreviewRequest(BaseModel):
    title: str
    artist: Optional[str] = ""
    distinct_id: Optional[str] = None  # for analytics (PostHog)


@app.post("/api/preview")
def preview_endpoint(req: PreviewRequest, request: Request = None, background_tasks: BackgroundTasks = None):
    """
    Returns previewUrl + spotifyUrl for a track, if Spotify is configured.
    """
    if not spotify_enabled():
        return {"ok": False, "error": "Spotify not configured", "previewUrl": None, "spotifyUrl": None}

    title = (req.title or "").strip()
    artist = (req.artist or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")

    details = spotify_track_lookup(title, artist)
    if not details:
        # analytics (never blocks)
        try:
            if request is not None and background_tasks is not None:
                a = get_analytics()
                did = a.distinct_id(request, explicit=req.distinct_id)
                a.capture(background_tasks, distinct_id=did, event="preview_lookup", properties={"has_match": False})
        except Exception:
            pass
        return {"ok": False, "error": "No Spotify match", "previewUrl": None, "spotifyUrl": None}

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request, explicit=req.distinct_id)
            a.capture(background_tasks, distinct_id=did, event="preview_lookup", properties={"has_match": True})
    except Exception:
        pass

    return {
        "ok": True,
        "previewUrl": details.get("previewUrl"),
        "spotifyUrl": details.get("spotifyUrl"),
        "spotifyUri": details.get("spotifyUri"),
        "durationMs": details.get("durationMs"),
        "imageUrl": details.get("imageUrl"),
    }


@app.get("/api/track")
def track_detail(
    track_id: str = "",
    title: str = "",
    artist: str = "",
    db: Session = Depends(get_db),
):
    tid = (track_id or "").strip()
    t = (title or "").strip()
    a = (artist or "").strip()

    row = None
    catalog_row = None
    if tid:
        try:
            row = db.query(Track).filter(Track.id == tid).first()
        except Exception:
            row = None
        if not row:
            try:
                catalog_row = (
                    db.query(CatalogTrack)
                    .options(
                        selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                        selectinload(CatalogTrack.audio_assets),
                    )
                    .filter(CatalogTrack.id == tid, CatalogTrack.is_published.is_(True))
                    .first()
                )
            except Exception:
                catalog_row = None

    if row:
        t = (row.name or "").strip() or t
        a = (row.artists or "").strip() or a
    elif catalog_row:
        t = (catalog_row.canonical_title or "").strip() or t
        a = _catalog_track_artist_text(catalog_row) or a
    if not t:
        raise HTTPException(status_code=404, detail="Track not found")

    details = None
    if spotify_enabled() and not (catalog_row and (catalog_row.source_type or "").strip() == "upload"):
        details = spotify_track_lookup(t, a)
    image_url = ""
    if row and isinstance(getattr(row, "image_url", None), str):
        image_url = (row.image_url or "").strip()
    elif catalog_row and isinstance(getattr(catalog_row, "image_url", None), str):
        image_url = (catalog_row.image_url or "").strip()
    if not image_url and details:
        dimg = details.get("imageUrl")
        if isinstance(dimg, str):
            image_url = dimg.strip()
    if not image_url:
        image_url = cover_for(t, a).strip()

    audio_url = None
    artist_conversion_links: Dict[str, str] = {}
    artist_profile_public = True
    if tid:
        try:
            if row:
                has_audio = db.query(TrackAudio.track_id).filter(TrackAudio.track_id == tid).first()
                if has_audio:
                    audio_url = f"/api/audio/{quote(tid)}"
            elif catalog_row:
                asset = _catalog_track_primary_asset(catalog_row, kind="full")
                if asset:
                    audio_url = f"/api/uploads/{quote(tid)}/stream"
                artist_conversion_links = _conversion_links_for_user(db, getattr(catalog_row, "owner_user_id", None))
                artist_profile_public = _upload_public_profile_enabled(db, catalog_row)
        except Exception:
            audio_url = None

    return {
        "id": tid or (details.get("spotifyId") if details else None),
        "title": t,
        "artist": a,
        "imageUrl": image_url,
        "audioUrl": audio_url,
        "previewUrl": (details.get("previewUrl") if details else None),
        "spotifyUrl": (details.get("spotifyUrl") if details else None),
        "spotifyUri": (details.get("spotifyUri") if details else None),
        "durationMs": (details.get("durationMs") if details else None),
        "source": "db" if row else ("upload" if catalog_row else ("spotify" if details else "unknown")),
        "artistConversionLinks": artist_conversion_links,
        "artistProfilePublic": artist_profile_public,
    }


@app.get("/api/artist-profile")
def artist_profile_endpoint(name: str, db: Session = Depends(get_db)):
    artist_name = (name or "").strip()
    if not artist_name:
        raise HTTPException(status_code=400, detail="Artist name is required")

    try:
        artist_row = db.query(Artist).filter(func.lower(Artist.name) == artist_name.lower()).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    if not artist_row:
        return {
            "name": artist_name,
            "found": False,
            "publicProfile": True,
            "conversionLinks": {},
            "tracks": [],
        }

    try:
        tracks = (
            db.query(CatalogTrack)
            .join(TrackArtist, TrackArtist.track_id == CatalogTrack.id)
            .options(selectinload(CatalogTrack.audio_assets))
            .filter(
                TrackArtist.artist_id == artist_row.id,
                CatalogTrack.source_type == "upload",
                CatalogTrack.is_published.is_(True),
            )
            .order_by(CatalogTrack.created_at.desc(), CatalogTrack.id.asc())
            .limit(25)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    owner_id = next((getattr(track, "owner_user_id", None) for track in tracks if getattr(track, "owner_user_id", None) is not None), None)
    artist_settings = _artist_settings_for_user(db, int(owner_id)) if owner_id is not None else dict(SETTINGS_DEFAULTS["artist"])
    public_profile = bool(artist_settings.get("publicProfile", True))
    if not public_profile:
        return {
            "name": artist_row.name,
            "found": True,
            "publicProfile": False,
            "conversionLinks": {},
            "tracks": [],
        }

    return {
        "name": artist_row.name,
        "found": True,
        "publicProfile": True,
        "conversionLinks": _conversion_links_for_user(db, int(owner_id)) if owner_id is not None else {},
        "tracks": [
            {
                "id": track.id,
                "title": track.canonical_title,
                "imageUrl": track.image_url,
                "audioUrl": f"/api/uploads/{track.id}/stream" if _catalog_track_primary_asset(track, kind="full") else None,
                "durationMs": track.duration_ms,
                "createdAt": getattr(track, "created_at", None),
            }
            for track in tracks
        ],
    }


@app.get("/api/open_spotify")
def open_spotify(title: str, artist: str = "", request: Request = None, background_tasks: BackgroundTasks = None):
    """
    Demo endpoint: redirects user to Spotify track page if found.
    """
    if not spotify_enabled():
        raise HTTPException(status_code=400, detail="Spotify not configured")

    title = (title or "").strip()
    artist = (artist or "").strip()

    details = spotify_track_lookup(title, artist)

    # analytics (never blocks)
    try:
        if request is not None and background_tasks is not None:
            a = get_analytics()
            did = a.distinct_id(request)
            a.capture(background_tasks, distinct_id=did, event="open_spotify", properties={"has_match": bool(details)})
    except Exception:
        pass

    if not details or not details.get("spotifyUrl"):
        raise HTTPException(status_code=404, detail="No Spotify link found")

    # best-effort persistence (never blocks)
    db = None
    try:
        if request is not None:
            did = get_analytics().distinct_id(request)
            db = SessionLocal()
            db.add(
                Interaction(
                    distinct_id=did,
                    track_id=str(details.get("spotifyId") or ""),
                    event="open_spotify",
                )
            )
            db.commit()
    except Exception:
        try:
            if db is not None:
                db.rollback()
        except Exception:
            pass
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass

    return RedirectResponse(url=details["spotifyUrl"], status_code=302)


# -----------------------------
# Full-song uploads + streaming
# -----------------------------


@app.post("/api/audio/upload")
async def upload_catalog_track_audio(
    request: Request,
    track_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Attach a full-audio file to an existing `tracks` row (seeded catalog).

    Frontend can then play `/api/audio/<track_id>` instead of Spotify previews.
    """
    _enforce_rate_limit("upload", request, RATE_LIMIT_UPLOAD_PER_MIN, 60)
    if not _has_valid_upload_secret(request):
        raise HTTPException(status_code=403, detail="Admin upload secret required for catalog audio")
    _require_uploader_identity(request, db)

    tid = (track_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="track_id is required")

    # Ensure the track exists in the dataset catalog
    try:
        t = db.query(Track).filter(Track.id == tid).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not t:
        raise HTTPException(status_code=404, detail="Unknown track_id")

    mime_type, ext = _guess_mime_and_ext(file.filename, file.content_type)
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    stored = await save_upload_file(
        file,
        local_dir=MEDIA_TRACKS_DIR,
        object_kind="tracks",
        object_id=tid,
        ext=ext,
        mime_type=mime_type,
        max_bytes=max_bytes,
    )
    processing = process_audio_file(stored.storage_path, stored.mime_type)

    try:
        row = db.query(TrackAudio).filter(TrackAudio.track_id == tid).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if row:
        row.file_path = stored.storage_path
        row.mime_type = stored.mime_type
        row.size_bytes = int(stored.size_bytes)
    else:
        db.add(
            TrackAudio(
                track_id=tid,
                file_path=stored.storage_path,
                mime_type=stored.mime_type,
                size_bytes=int(stored.size_bytes),
            )
        )
    try:
        catalog_track = db.query(CatalogTrack).filter(CatalogTrack.id == tid).first()
        if catalog_track and processing.duration_ms is not None:
            catalog_track.duration_ms = int(processing.duration_ms)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not save upload metadata. Please try again.")

    return {"ok": True, "audioUrl": f"/api/audio/{quote(tid)}"}


@app.get("/api/audio/{track_id}")
def stream_catalog_track_audio(track_id: str, request: Request, db: Session = Depends(get_db)):
    """Stream a catalog track's full audio (if uploaded)."""
    tid = (track_id or "").strip()
    row = db.query(TrackAudio).filter(TrackAudio.track_id == tid).first()
    if not row:
        raise HTTPException(status_code=404, detail="No full audio uploaded for this track")

    return _stream_file(row.file_path, row.mime_type or "audio/mpeg", request)


@app.post("/api/uploads")
async def upload_new_track(
    request: Request,
    title: str = Form(...),
    artist: str = Form(""),
    image_url: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a brand-new track to Offtrack's streaming library."""
    _enforce_rate_limit("upload", request, RATE_LIMIT_UPLOAD_PER_MIN, 60)
    if not _check_upload_secret(request):
        raise HTTPException(status_code=403, detail="Upload secret required")
    owner_user_id = _require_uploader_identity(request, db)

    title = (title or "").strip()
    artist = (artist or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    tid = str(uuid.uuid4())
    mime_type, ext = _guess_mime_and_ext(file.filename, file.content_type)
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    stored = await save_upload_file(
        file,
        local_dir=MEDIA_UPLOADS_DIR,
        object_kind="uploads",
        object_id=tid,
        ext=ext,
        mime_type=mime_type,
        max_bytes=max_bytes,
    )
    processing = process_audio_file(stored.storage_path, stored.mime_type)

    canonical_track = CatalogTrack(
        id=tid,
        canonical_title=title,
        source_type="upload",
        release_year=None,
        duration_ms=processing.duration_ms,
        explicit=False,
        is_published=True,
        owner_user_id=owner_user_id,
        image_url=_sanitize_optional_http_url(image_url, "image URL"),
        legacy_uploaded_track_id=None,
    )
    db.add(canonical_track)
    db.flush()

    artist_names = _parse_artist_names(artist)
    for position, artist_name in enumerate(artist_names):
        artist_row = _get_or_create_artist(db, artist_name)
        db.add(
            TrackArtist(
                track_id=canonical_track.id,
                artist_id=artist_row.id,
                role="primary" if position == 0 else "featured",
                position=position,
            )
        )

    db.add(
        AudioAsset(
            id=str(uuid.uuid4()),
            track_id=canonical_track.id,
            storage_path=stored.storage_path,
            mime_type=stored.mime_type,
            size_bytes=int(stored.size_bytes),
            duration_ms=processing.duration_ms,
            waveform_peaks_json=processing.peaks_json(),
            processing_status=processing.status,
            processing_error=processing.error,
            kind="full",
            is_primary=True,
        )
    )
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not save upload metadata. Please try again.")

    return {
        "id": tid,
        "title": title,
        "artist": artist,
        "imageUrl": canonical_track.image_url,
        "audioUrl": f"/api/uploads/{tid}/stream",
        "mimeType": stored.mime_type,
        "sizeBytes": int(stored.size_bytes),
        "durationMs": processing.duration_ms,
        "waveformPeaks": processing.waveform_peaks,
        "processingStatus": processing.status,
        "processingError": processing.error,
    }


@app.get("/api/uploads/manage")
def list_managed_uploads(limit: int = 100, request: Request = None, db: Session = Depends(get_db)):
    user = _require_artist_user(request, db)
    user_id = int(user.id)
    limit = max(1, min(int(limit or 100), 200))
    try:
        rows = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(CatalogTrack.source_type == "upload", CatalogTrack.owner_user_id == user_id)
            .order_by(CatalogTrack.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    track_ids = [row.id for row in rows]
    track_metrics, _, _, _ = _artist_upload_metrics(db, track_ids)
    return {
        "tracks": [
            _attach_upload_metrics(row, _serialize_uploaded_catalog_track(row, db), track_metrics.get(row.id) or {})
            for row in rows
        ]
    }


@app.get("/api/artist/dashboard")
def artist_dashboard(request: Request, db: Session = Depends(get_db)):
    user = _require_artist_user(request, db)
    user_id = int(user.id)
    try:
        tracks = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(CatalogTrack.source_type == "upload", CatalogTrack.owner_user_id == user_id)
            .order_by(CatalogTrack.created_at.desc(), CatalogTrack.id.asc())
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    track_ids = [track.id for track in tracks]
    track_metrics, event_counts, source_counts, recent_rows = _artist_upload_metrics(db, track_ids)
    total_unique_listeners: set[str] = set()
    qualified_connections = 0
    conversion_breakdown: Dict[str, int] = {}
    for metrics in track_metrics.values():
        total_unique_listeners.update(metrics.get("uniqueListeners") or set())
        qualified_connections += len(metrics.get("qualifiedListeners") or set())
        for key, value in (metrics.get("conversionBreakdown") or {}).items():
            conversion_breakdown[str(key)] = int(conversion_breakdown.get(str(key), 0)) + int(value or 0)

    def _count_events(events: set[str]) -> int:
        return sum(int(event_counts.get(event, 0)) for event in events)

    serialized_tracks = []
    for track in tracks:
        item = _serialize_uploaded_catalog_track(track, db)
        serialized_tracks.append(_attach_upload_metrics(track, item, track_metrics.get(track.id) or {}))

    score_values = [
        int(((item.get("metrics") or {}).get("discoveryScore") or {}).get("value") or 0)
        for item in serialized_tracks
        if bool(item.get("isPublished"))
    ]
    average_discovery_score = round(sum(score_values) / len(score_values), 1) if score_values else 0
    discovery_paused_tracks = sum(1 for item in serialized_tracks if bool(item.get("discoveryPaused")))

    recent = []
    track_title_by_id = {track.id: track.canonical_title for track in tracks}
    for row in recent_rows[:25]:
        did = (row.distinct_id or "anonymous").strip() or "anonymous"
        recent.append(
            {
                "id": row.id,
                "trackId": row.track_id,
                "trackTitle": track_title_by_id.get(row.track_id, row.track_id),
                "event": row.event,
                "sourcePage": row.source_page,
                "listenerKey": f"listener-{hashlib.sha256(did.encode('utf-8')).hexdigest()[:8]}",
                "createdAt": row.created_at,
            }
        )

    return {
        "artist": {
            "id": user.id,
            "name": user.name or "",
            "email": user.email,
            "emailVerified": _email_verified(user),
        },
        "summary": {
            "totalTracks": len(tracks),
            "publishedTracks": sum(1 for track in tracks if bool(getattr(track, "is_published", True))),
            "totalInteractions": len(recent_rows),
            "uniqueListeners": len(total_unique_listeners),
            "qualifiedConnections": qualified_connections,
            "plays": _count_events({"play", "play_start", "play_30s", "play_complete", "upload_play"}),
            "likes": _count_events({"like", "superlike"}),
            "recommendationClicks": _count_events({"click_recommendation"}),
            "conversionClicks": _count_events(CONVERSION_EVENTS),
            "conversionBreakdown": conversion_breakdown,
            "averageDiscoveryScore": average_discovery_score,
            "discoveryPausedTracks": discovery_paused_tracks,
        },
        "eventCounts": event_counts,
        "sourceCounts": source_counts,
        "tracks": serialized_tracks,
        "recentInteractions": recent,
    }


@app.patch("/api/uploads/{upload_id}")
def update_managed_upload(upload_id: str, payload: UploadUpdateRequest, request: Request, db: Session = Depends(get_db)):
    uid = (upload_id or "").strip()
    _, track = _require_upload_owner(db, request, uid)

    if payload.title is not None:
        title = (payload.title or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title is required")
        track.canonical_title = title
    if payload.image_url is not None:
        track.image_url = _sanitize_optional_http_url(payload.image_url, "image URL")
    if payload.is_published is not None:
        track.is_published = bool(payload.is_published)
    if payload.artist is not None:
        _replace_track_artists(db, track.id, payload.artist)

    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not update upload. Please try again.")

    db.refresh(track)
    refreshed = _managed_upload_query(db, track.id)
    return _serialize_uploaded_catalog_track(refreshed or track, db)


@app.patch("/api/uploads/{upload_id}/discovery")
def update_upload_discovery_control(
    upload_id: str,
    payload: UploadDiscoveryControlRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    uid = (upload_id or "").strip()
    user_id, track = _require_upload_owner(db, request, uid)
    reason = (payload.reason or "").strip()[:500] or None
    try:
        control = _upload_discovery_control(db, track.id)
        if not control:
            control = UploadDiscoveryControl(track_id=track.id, user_id=int(user_id))
        control.user_id = int(user_id)
        control.discovery_paused = bool(payload.discovery_paused)
        control.reason = reason if control.discovery_paused else None
        db.add(control)
        _create_notification(
            db,
            int(user_id),
            "discovery",
            "Discovery paused" if control.discovery_paused else "Discovery resumed",
            f"{track.canonical_title} is {'paused from' if control.discovery_paused else 'back in'} listener discovery.",
            "/profile/uploads",
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not update discovery control. Please try again.")

    refreshed = _managed_upload_query(db, track.id)
    item = _serialize_uploaded_catalog_track(refreshed or track, db)
    metrics, _, _, _ = _artist_upload_metrics(db, [track.id])
    return _attach_upload_metrics(refreshed or track, item, metrics.get(track.id) or {})


@app.post("/api/uploads/{upload_id}/replace")
async def replace_managed_upload_audio(
    upload_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _enforce_rate_limit("upload", request, RATE_LIMIT_UPLOAD_PER_MIN, 60)
    if not _check_upload_secret(request):
        raise HTTPException(status_code=403, detail="Upload secret required")
    uid = (upload_id or "").strip()
    _, track = _require_upload_owner(db, request, uid)

    mime_type, ext = _guess_mime_and_ext(file.filename, file.content_type)
    stored = await save_upload_file(
        file,
        local_dir=MEDIA_UPLOADS_DIR,
        object_kind="uploads",
        object_id=uid,
        ext=ext,
        mime_type=mime_type,
        max_bytes=MAX_UPLOAD_MB * 1024 * 1024,
    )
    processing = process_audio_file(stored.storage_path, stored.mime_type)

    asset = _catalog_track_primary_asset(track, kind="full")
    if asset is None:
        db.add(
            AudioAsset(
                id=str(uuid.uuid4()),
                track_id=track.id,
                storage_path=stored.storage_path,
                mime_type=stored.mime_type,
                size_bytes=int(stored.size_bytes),
                duration_ms=processing.duration_ms,
                waveform_peaks_json=processing.peaks_json(),
                processing_status=processing.status,
                processing_error=processing.error,
                kind="full",
                is_primary=True,
            )
        )
    else:
        asset.storage_path = stored.storage_path
        asset.mime_type = stored.mime_type
        asset.size_bytes = int(stored.size_bytes)
        asset.duration_ms = processing.duration_ms
        asset.waveform_peaks_json = processing.peaks_json()
        asset.processing_status = processing.status
        asset.processing_error = processing.error
        asset.is_primary = True

    try:
        if processing.duration_ms is not None:
            track.duration_ms = processing.duration_ms
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not replace audio. Please try again.")

    refreshed = _managed_upload_query(db, track.id)
    return _serialize_uploaded_catalog_track(refreshed or track, db)


@app.delete("/api/uploads/{upload_id}")
def unpublish_managed_upload(upload_id: str, request: Request, db: Session = Depends(get_db)):
    uid = (upload_id or "").strip()
    _, track = _require_upload_owner(db, request, uid)
    track.is_published = False
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Could not unpublish upload. Please try again.")
    refreshed = _managed_upload_query(db, track.id)
    return {"ok": True, "track": _serialize_uploaded_catalog_track(refreshed or track, db)}


@app.get("/api/uploads")
def list_uploads(limit: int = 50, db: Session = Depends(get_db)):
    limit = max(1, min(int(limit or 50), 200))
    try:
        normalized_rows = (
            db.query(CatalogTrack)
            .options(
                selectinload(CatalogTrack.artist_links).selectinload(TrackArtist.artist),
                selectinload(CatalogTrack.audio_assets),
            )
            .filter(CatalogTrack.source_type == "upload", CatalogTrack.is_published.is_(True))
            .order_by(CatalogTrack.created_at.desc())
            .limit(limit)
            .all()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    normalized_items = [_serialize_uploaded_catalog_track(row, db) for row in normalized_rows]
    if len(normalized_items) >= limit:
        return {"tracks": normalized_items}

    normalized_ids = {item["id"] for item in normalized_items}
    remaining = max(0, limit - len(normalized_items))
    try:
        legacy_query = db.query(UploadedTrack)
        if normalized_ids:
            legacy_query = legacy_query.filter(~UploadedTrack.id.in_(normalized_ids))
        legacy_rows = legacy_query.order_by(UploadedTrack.created_at.desc()).limit(remaining).all()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    return {
        "tracks": normalized_items + [
            {
                "id": r.id,
                "title": r.title,
                "artist": r.artist,
                "imageUrl": r.image_url,
                "audioUrl": f"/api/uploads/{r.id}/stream",
                "mimeType": r.mime_type,
                "sizeBytes": r.size_bytes,
                "createdAt": getattr(r, "created_at", None),
            }
            for r in legacy_rows
        ]
    }


@app.get("/api/uploads/{upload_id}/stream")
def stream_uploaded_track(upload_id: str, request: Request, db: Session = Depends(get_db)):
    uid = (upload_id or "").strip()
    try:
        catalog_track = (
            db.query(CatalogTrack)
            .options(selectinload(CatalogTrack.audio_assets))
            .filter(CatalogTrack.id == uid, CatalogTrack.source_type == "upload", CatalogTrack.is_published.is_(True))
            .first()
        )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    asset = _catalog_track_primary_asset(catalog_track, kind="full") if catalog_track else None
    if asset:
        return _stream_file(asset.storage_path, asset.mime_type or "audio/mpeg", request)

    try:
        row = db.query(UploadedTrack).filter(UploadedTrack.id == uid).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    if not row:
        raise HTTPException(status_code=404, detail="Unknown upload id")
    return _stream_file(row.file_path, row.mime_type or "audio/mpeg", request)


# -----------------------------
# Lyric AI reels
# -----------------------------
from PIL import Image, ImageDraw, ImageFont
import imageio.v2 as imageio
from io import BytesIO

LYRIC_AI_PROVIDER = (os.getenv("LYRIC_AI_PROVIDER", "openai").strip().lower() or "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_IMAGE_MODEL = (os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1").strip() or "gpt-image-1")
OPENAI_IMAGE_SIZE = (os.getenv("OPENAI_IMAGE_SIZE", "1024x1536").strip() or "1024x1536")
OPENAI_IMAGE_QUALITY = (os.getenv("OPENAI_IMAGE_QUALITY", "medium").strip() or "medium")
LYRIC_AI_ALLOW_LOCAL_FALLBACK = os.getenv("LYRIC_AI_ALLOW_LOCAL_FALLBACK", "false").strip().lower() in ("1", "true", "yes")


def _wrap_lines(text: str, max_chars: int) -> List[str]:
    words = [w for w in (text or "").split() if w]
    lines: List[str] = []
    cur: List[str] = []
    cur_len = 0
    for w in words:
        add = len(w) + (1 if cur else 0)
        if cur_len + add > max_chars and cur:
            lines.append(" ".join(cur))
            cur = [w]
            cur_len = len(w)
        else:
            cur.append(w)
            cur_len += add
    if cur:
        lines.append(" ".join(cur))
    return lines or [""]


def _render_caption_frame(w: int, h: int, title: str, subtitle: str) -> Image.Image:
    img = Image.new("RGB", (w, h), (15, 15, 15))
    draw = ImageDraw.Draw(img)

    # Use default fonts (portable). If you later bundle fonts, load TTF here.
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()

    # simple centered layout
    pad = 60
    y = int(h * 0.25)

    def draw_centered(text: str, y_pos: int, fill=(255, 255, 255)):
        bbox = draw.textbbox((0, 0), text, font=font_title)
        tw = bbox[2] - bbox[0]
        draw.text(((w - tw) // 2, y_pos), text, font=font_title, fill=fill)

    # Title lines
    for line in _wrap_lines(title, max_chars=26)[:6]:
        draw_centered(line, y)
        y += 26

    y += 18
    for line in _wrap_lines(subtitle, max_chars=34)[:6]:
        bbox = draw.textbbox((0, 0), line, font=font_sub)
        tw = bbox[2] - bbox[0]
        draw.text(((w - tw) // 2, y), line, font=font_sub, fill=(220, 220, 220))
        y += 22

    # bottom watermark
    wm = "Offtrack · Lyric AI"
    bbox = draw.textbbox((0, 0), wm, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, h - pad), wm, font=font_sub, fill=(160, 160, 160))
    return img


def _lyrics_chunks(lyrics: str) -> List[str]:
    chunks: List[str] = []
    for para in [p.strip() for p in lyrics.split("\n") if p.strip()]:
        if len(para) <= 140:
            chunks.append(para)
            continue
        words = para.split()
        buf: List[str] = []
        for w in words:
            buf.append(w)
            if len(" ".join(buf)) >= 120:
                chunks.append(" ".join(buf))
                buf = []
        if buf:
            chunks.append(" ".join(buf))
    return chunks


def _safe_slug(v: str, fallback: str = "lyric") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (v or "").lower()).strip("-")
    return s[:48] or fallback


def _build_visual_prompts(lyrics: str, title: str, artist: str, image_count: int) -> List[str]:
    head = f"Song: {title or 'Untitled'}"
    if artist:
        head += f" by {artist}"
    base_style = (
        "Cinematic vertical frame for a short social reel, high detail, dramatic lighting, "
        "rich color grading, no text, no logos, no watermarks."
    )
    chunks = _lyrics_chunks(lyrics)[: max(1, min(image_count, 8))]
    if not chunks:
        chunks = [lyrics[:140]]
    out: List[str] = []
    for chunk in chunks:
        out.append(
            f"{base_style} {head}. Visualize this lyric moment: {chunk}"
        )
    return out


def _openai_generate_images(prompts: List[str]) -> List[Image.Image]:
    if not OPENAI_API_KEY:
        return []
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    images: List[Image.Image] = []
    for prompt in prompts:
        payload: Dict[str, Any] = {
            "model": OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "size": OPENAI_IMAGE_SIZE,
            "quality": OPENAI_IMAGE_QUALITY,
        }
        resp = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers=headers,
            json=payload,
            timeout=120,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"image generation failed: {resp.text[:200]}")
        body = resp.json()
        data = body.get("data") or []
        b64 = ((data[0] if data else {}) or {}).get("b64_json")
        if not b64:
            continue
        raw = base64.b64decode(b64)
        img = Image.open(BytesIO(raw)).convert("RGB")
        images.append(img)
    return images


def _image_to_data_url(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def _ensure_lyric_reels_table() -> None:
    try:
        LyricReel.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        pass


def _render_reel_from_images(
    images: List[Image.Image],
    title: str,
    chunks: List[str],
    out_path: Path,
    w: int = 720,
    h: int = 1280,
    fps: int = 24,
) -> None:
    writer = imageio.get_writer(str(out_path), fps=fps)
    try:
        for idx, img in enumerate(images):
            canvas = img.resize((w, h))
            caption = chunks[idx % len(chunks)] if chunks else ""
            frame = _render_caption_frame(w, h, title, caption)
            blended = Image.blend(canvas, frame, alpha=0.32)
            import numpy as _np
            arr = _np.array(blended)
            for _ in range(int(fps * 1.35)):
                writer.append_data(arr)
    finally:
        try:
            writer.close()
        except Exception:
            pass


def _is_invalid_video(path: Path) -> bool:
    try:
        if not path.exists():
            return True
        # Empty or nearly-empty files are typically unplayable and show as 0:00
        return path.stat().st_size < 2048
    except Exception:
        return True


class ReelCreateIn(BaseModel):
    lyrics: str = Field(min_length=1, max_length=8000)
    title: str | None = None
    artist: str | None = None
    output: str = Field(default="video", pattern="^(video|images)$")
    image_count: int = Field(default=4, ge=1, le=8)


@app.post("/api/reels")
def create_reel(req: ReelCreateIn, db: Session = Depends(get_db)):
    """Generate images or a short vertical reel from lyrics."""
    _ensure_lyric_reels_table()
    lyrics = (req.lyrics or "").strip()
    if not lyrics:
        raise HTTPException(status_code=400, detail="lyrics required")

    header = (req.title or "Lyric Reel").strip()
    artist = (req.artist or "").strip()
    chunks = _lyrics_chunks(lyrics)
    if not chunks:
        chunks = [lyrics[:140]]

    prompts = _build_visual_prompts(lyrics, header, artist, req.image_count)
    generated_images: List[Image.Image] = []
    provider = "local"
    generation_error = ""

    if LYRIC_AI_PROVIDER in {"openai", "openai_images"}:
        if not OPENAI_API_KEY:
            generation_error = "OPENAI_API_KEY is not configured on backend."
        else:
            try:
                generated_images = _openai_generate_images(prompts)
                provider = "openai"
            except Exception as e:
                generation_error = str(e)
    else:
        generation_error = f"Unsupported LYRIC_AI_PROVIDER='{LYRIC_AI_PROVIDER}'"

    if not generated_images:
        if not LYRIC_AI_ALLOW_LOCAL_FALLBACK:
            msg = generation_error or "No images generated from provider."
            raise HTTPException(
                status_code=502,
                detail=f"Lyric AI provider failed: {msg}. Set OPENAI_API_KEY on backend or enable LYRIC_AI_ALLOW_LOCAL_FALLBACK=true.",
            )
        for chunk in chunks[: req.image_count]:
            generated_images.append(_render_caption_frame(1024, 1536, header, chunk))
        provider = "local"

    if req.output == "images":
        data_urls = [_image_to_data_url(img) for img in generated_images[: req.image_count]]
        return {
            "id": str(uuid.uuid4()),
            "mode": "images",
            "provider": provider,
            "imageDataUrls": data_urls,
        }

    rid = str(uuid.uuid4())
    out_path = MEDIA_REELS_DIR / f"{rid}.mp4"
    try:
        _render_reel_from_images(generated_images[: req.image_count], header, chunks, out_path)
    except Exception:
        if not LYRIC_AI_ALLOW_LOCAL_FALLBACK:
            raise HTTPException(status_code=502, detail="Video encoding failed. Check ffmpeg/imageio backend setup.")
        data_urls = [_image_to_data_url(img) for img in generated_images[: req.image_count]]
        return {
            "id": str(uuid.uuid4()),
            "mode": "images",
            "provider": provider,
            "imageDataUrls": data_urls,
            "detail": "Video encoder unavailable; returned images instead.",
        }

    if _is_invalid_video(out_path):
        if not LYRIC_AI_ALLOW_LOCAL_FALLBACK:
            raise HTTPException(status_code=502, detail="Generated video is invalid/empty (0s). Check ffmpeg/imageio backend setup.")
        data_urls = [_image_to_data_url(img) for img in generated_images[: req.image_count]]
        return {
            "id": str(uuid.uuid4()),
            "mode": "images",
            "provider": provider,
            "imageDataUrls": data_urls,
            "detail": "Generated video was invalid (0s); returned images instead.",
        }
    size = out_path.stat().st_size if out_path.exists() else 0

    row = LyricReel(
        id=rid,
        prompt=lyrics,
        file_path=str(out_path),
        mime_type="video/mp4",
        size_bytes=int(size),
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "id": rid,
        "mode": "video",
        "provider": provider,
        "downloadUrl": f"/api/reels/{rid}/download",
        "sizeBytes": int(size),
    }


@app.get("/api/reels")
def list_reels(limit: int = 20, db: Session = Depends(get_db)):
    _ensure_lyric_reels_table()
    limit = max(1, min(int(limit or 20), 100))
    try:
        rows = db.query(LyricReel).order_by(LyricReel.created_at.desc()).limit(limit).all()
    except Exception:
        return {"reels": []}
    return {
        "reels": [
            {
                "id": r.id,
                "downloadUrl": f"/api/reels/{r.id}/download",
                "sizeBytes": r.size_bytes,
                "createdAt": getattr(r, "created_at", None),
            }
            for r in rows
        ]
    }


@app.get("/api/reels/{reel_id}/download")
def download_reel(reel_id: str, request: Request, db: Session = Depends(get_db)):
    _ensure_lyric_reels_table()
    rid = (reel_id or "").strip()
    try:
        row = db.query(LyricReel).filter(LyricReel.id == rid).first()
    except Exception:
        row = None
    if not row:
        raise HTTPException(status_code=404, detail="Unknown reel id")
    path = Path(row.file_path)
    # Stream with range so browser video player can seek
    return _stream_file(path, row.mime_type or "video/mp4", request)
