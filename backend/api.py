from __future__ import annotations

import base64
import json
import os
import time
import uuid
import mimetypes
import re
import logging
import threading
from typing import List, Optional, Dict, Any
from urllib.parse import quote
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
    Track,
    TrackArtist,
    TrackAudio,
    TrackGenre,
    UploadedTrack,
    User,
)
from models import PaymentMethod, BillingReceipt, SecurityAuditLog
from recommender import get_recommender
from analytics import get_analytics
from audio_processing import process_audio_file, validate_audio_upload
from catalog_sync import ensure_catalog_backfill, parse_artist_names as _sync_parse_artist_names
from catalog_ingest import catalog_sync_status, sync_current_catalog
from storage import is_remote_storage_path, remote_redirect_response, save_upload_file, storage_backend_for_path

from fastapi.responses import RedirectResponse, StreamingResponse
from fastapi.responses import PlainTextResponse
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI(title="Offtrack API")
log = logging.getLogger("offtrack.api")

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
    if xff:
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
    """If UPLOAD_SECRET is set, require it in a header or query param.

    This keeps your demo instance from becoming an open file drop.
    """
    if not UPLOAD_SECRET:
        return True
    got = (request.headers.get("X-Upload-Secret") or "").strip()
    if not got:
        got = (request.query_params.get("secret") or "").strip()
    return bool(got) and got == UPLOAD_SECRET


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

    path = Path(path)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
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

# NOTE: We intentionally use PBKDF2 for password hashing.
# bcrypt can fail in slim Docker images due to native dependency issues,
# which shows up as a 500 "Internal Server Error" during signup.
# PBKDF2 is slower than bcrypt but is pure-Python and reliable for an MVP.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "dev_change_me").strip()
JWT_ALG = os.getenv("JWT_ALG", "HS256").strip() or "HS256"
ACCESS_TTL_MIN = int(os.getenv("ACCESS_TTL_MIN", "30"))
REFRESH_TTL_DAYS = int(os.getenv("REFRESH_TTL_DAYS", "30"))

REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "offtrack_refresh").strip() or "offtrack_refresh"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()  # lax|strict|none

def _hash_password(pw: str) -> str:
    return pwd_context.hash(pw)

def _verify_password(pw: str, pw_hash: str) -> bool:
    try:
        return pwd_context.verify(pw, pw_hash)
    except Exception:
        return False

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

def _create_access_token(user_id: int) -> str:
    now = _now_utc()
    exp = now + timedelta(minutes=ACCESS_TTL_MIN)
    return _encode({"sub": str(user_id), "type": "access", "iat": int(now.timestamp()), "exp": int(exp.timestamp())})

def _create_refresh_token(user_id: int) -> str:
    now = _now_utc()
    exp = now + timedelta(days=REFRESH_TTL_DAYS)
    return _encode({"sub": str(user_id), "type": "refresh", "iat": int(now.timestamp()), "exp": int(exp.timestamp())})

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

class MeOut(BaseModel):
    id: int
    email: EmailStr
    name: str | None = None
    account_type: str = "listener"


class PaymentMethodIn(BaseModel):
    card_number: str = Field(min_length=12, max_length=25)
    exp_month: int = Field(ge=1, le=12)
    exp_year: int = Field(ge=2024, le=2100)
    holder_name: str | None = Field(default=None, max_length=255)
    brand: str | None = Field(default="card", max_length=32)
    set_default: bool = True


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
    if supplied != admin_api_key:
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

@app.post("/api/auth/signup", response_model=AuthOut)
def auth_signup(payload: SignupIn, req: Request, resp: Response, db: Session = Depends(get_db)):
    _enforce_rate_limit("signup", req, RATE_LIMIT_SIGNUP_PER_MIN, 60)
    email = payload.email.lower().strip()
    name = (payload.name or "").strip() or None
    account_type = (payload.account_type or "listener").strip().lower()
    if account_type not in {"listener", "artist"}:
        account_type = "listener"
    try:
        exists = db.query(User).filter(User.email == email).first()
        if exists:
            raise HTTPException(status_code=409, detail="Email already exists")

        user = User(email=email, name=name, account_type=account_type, password_hash=_hash_password(payload.password))
        db.add(user)
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
    refresh = _create_refresh_token(user.id)
    _set_refresh_cookie(resp, refresh)
    return {"access_token": access}

@app.post("/api/auth/login", response_model=AuthOut)
def auth_login(payload: LoginIn, req: Request, resp: Response, db: Session = Depends(get_db)):
    _enforce_rate_limit("login", req, RATE_LIMIT_LOGIN_PER_MIN, 60)
    email = payload.email.lower().strip()
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
    if not user or not _verify_password(payload.password, user.password_hash):
        _record_auth_result(email, ip, ok=False)
        _audit_log(action="auth_login_failed", user_id=(user.id if user else None), email=email, req=req, reason="invalid_credentials")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _record_auth_result(email, ip, ok=True)
    _audit_log(action="auth_login_success", user_id=user.id, email=email, req=req)

    access = _create_access_token(user.id)
    refresh = _create_refresh_token(user.id)
    _set_refresh_cookie(resp, refresh)
    return {"access_token": access}

@app.post("/api/auth/refresh", response_model=AuthOut)
def auth_refresh(req: Request, resp: Response):
    token = req.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        data = _decode(token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    access = _create_access_token(user_id)
    # rotate refresh
    new_refresh = _create_refresh_token(user_id)
    _set_refresh_cookie(resp, new_refresh)
    return {"access_token": access}

@app.post("/api/auth/logout")
def auth_logout(resp: Response):
    _clear_refresh_cookie(resp)
    return {"ok": True}

@app.get("/api/auth/me", response_model=MeOut)
def auth_me(req: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(req)
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"id": user.id, "email": user.email, "name": user.name, "account_type": user.account_type or "listener"}


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
    _audit_log(
        action="admin_lock_user",
        db=db,
        user_id=user.id,
        email=user.email,
        req=req,
        reason=user.lock_reason,
        actor="admin",
        meta={"minutes": int(payload.minutes)},
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
    return {"tracks": [_serialize_uploaded_catalog_track(row) for row in rows]}


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
    return {"ok": True, "track": _serialize_uploaded_catalog_track(refreshed or track)}


@app.get("/api/billing/payment-methods")
def billing_list_payment_methods(req: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(req)
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
    user_id = get_current_user_id(req)
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
    user_id = get_current_user_id(req)
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
    user_id = get_current_user_id(req)
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
    user_id = get_current_user_id(req)
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
    # Make auth and upload tables available in fresh environments before first request.
    try:
        wait_for_db(timeout_s=45)
        Base.metadata.create_all(engine)
    except Exception:
        # Do not crash startup in environments that intentionally boot without DB.
        pass


def _require_uploader_identity(req: Request) -> Optional[int]:
    if not REQUIRE_AUTH_UPLOADS:
        return None
    try:
        user_id = get_current_user_id(req)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Login required to upload tracks")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if (getattr(user, "account_type", "listener") or "listener").strip().lower() != "artist":
            raise HTTPException(status_code=403, detail="Artist account required to upload tracks")
        return user_id
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Auth service unavailable. Please try again.")
    finally:
        db.close()


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


def _serialize_uploaded_catalog_track(track: CatalogTrack) -> Dict[str, Any]:
    asset = _catalog_track_primary_asset(track, kind="full")
    return {
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
    user_id = get_current_user_id(req)
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


def itunes_cover(title: str, artist: str) -> str:
    term = quote(f"{title} {artist}".strip())
    url = f"https://itunes.apple.com/search?term={term}&entity=song&limit=1"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return ""
        results = (r.json() or {}).get("results") or []
        if not results:
            return ""
        art = results[0].get("artworkUrl100") or results[0].get(
            "artworkUrl60") or ""
        if not art:
            return ""
        return (
            art.replace("100x100bb.jpg", "600x600bb.jpg")
            .replace("60x60bb.jpg", "600x600bb.jpg")
        )
    except Exception:
        return ""


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


class AdminClaimUploadRequest(BaseModel):
    owner_user_id: int = Field(ge=1)



# -----------------------------
# Startup
# -----------------------------
@app.on_event("startup")
def _startup():
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


@app.post("/api/reload")
def reload_now():
    err = _try_reload_recommender()
    return {"ok": True, "recommender_ready": not bool(err), "recommender_error": err}


# -----------------------------
# Search
# -----------------------------
def db_search(db: Session, q: str, limit: int = 8):
    q2 = f"%{q}%"
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
        try:
            if request is not None:
                did = get_analytics().distinct_id(request, explicit=req.distinct_id)
        except Exception:
            did = req.distinct_id

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

        exclude_ids = [x for x in (req.already_shown_ids or []) if isinstance(x, str) and x.strip()]
        recs = get_recommender().recommend(
            seeds,
            n=req.n,
            mode=req.mode,
            liked_ids=liked_ids,
            superliked_ids=superliked_ids,
            disliked_ids=disliked_ids,
            exclude_ids=exclude_ids,
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

    for r in recs:
        title = (r.get("title") or "").strip()
        artist = (r.get("artist") or "").strip()

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

        tid = (r.get("id") or "").strip()
        if image_url and tid:
            updates.append({"u": image_url, "i": tid})

        audio_url = f"/api/audio/{tid}" if tid and tid in audio_ids else None

        out.append(
            {
                **r,
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

    musician_list = list(musicians.values())[:6]
    return {"recommendations": out, "musicians": musician_list}




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
        "like",
        "superlike",
        "dislike",
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
                    context_json=json.dumps(req.context or {}, ensure_ascii=True, default=str)[:20000]
                    if req.context
                    else None,
                )
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
        "superlike": 6.0,
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
        "skip": 0.25,
        "dislike": -2.0,
    }.get((event or "").strip().lower(), 1.0)


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

    limit = max(20, min(int(limit or 120), 300))
    try:
        rows = (
            db.query(Interaction)
            .filter(Interaction.distinct_id == did)
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
        "hasData": bool(rows),
        "nodes": list(nodes.values()),
        "edges": list(edges.values()),
        "stats": {
            "events": event_counts,
            "topArtists": top_artists,
            "topGenres": top_genres,
            "trackCount": len(track_ids),
            "interactionCount": len(rows),
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
    if not _check_upload_secret(request):
        raise HTTPException(status_code=403, detail="Upload secret required")
    _require_uploader_identity(request)

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
    owner_user_id = _require_uploader_identity(request)

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
        image_url=(image_url or "").strip() or None,
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
    user_id = get_current_user_id(request)
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
    return {"tracks": [_serialize_uploaded_catalog_track(row) for row in rows]}


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
        track.image_url = (payload.image_url or "").strip() or None
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
    return _serialize_uploaded_catalog_track(refreshed or track)


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
    return _serialize_uploaded_catalog_track(refreshed or track)


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
    return {"ok": True, "track": _serialize_uploaded_catalog_track(refreshed or track)}


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

    normalized_items = [_serialize_uploaded_catalog_track(row) for row in normalized_rows]
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
