import base64, hashlib, hmac, json, os, secrets, time
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

router = APIRouter(prefix="/api/spotify", tags=["spotify"])

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8080").strip()
COOKIE_SECRET = os.getenv("COOKIE_SECRET", "dev_cookie_secret_change_me").encode()
SPOTIFY_COOKIE_SECURE = os.getenv("SPOTIFY_COOKIE_SECURE", os.getenv("COOKIE_SECURE", "false")).strip().lower() in ("1", "true", "yes")
SPOTIFY_COOKIE_SAMESITE = os.getenv("SPOTIFY_COOKIE_SAMESITE", os.getenv("COOKIE_SAMESITE", "lax")).strip().lower() or "lax"

SCOPES = " ".join([
  "streaming",                 # required for Web Playback SDK :contentReference[oaicite:2]{index=2}
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",  # devices :contentReference[oaicite:3]{index=3}
  "user-modify-playback-state" # start playback / transfer device :contentReference[oaicite:4]{index=4}
])

def _sign(payload: dict) -> str:
  raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
  sig = hmac.new(COOKIE_SECRET, raw, hashlib.sha256).digest()
  return base64.urlsafe_b64encode(raw).decode() + "." + base64.urlsafe_b64encode(sig).decode()

def _unsign(token: str) -> dict | None:
  try:
    raw_b64, sig_b64 = token.split(".")
    raw = base64.urlsafe_b64decode(raw_b64.encode())
    sig = base64.urlsafe_b64decode(sig_b64.encode())
    exp_sig = hmac.new(COOKIE_SECRET, raw, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, exp_sig):
      return None
    return json.loads(raw.decode())
  except Exception:
    return None

def _runtime_redirect_uri(req: Request) -> str:
  proto = (req.headers.get("x-forwarded-proto") or req.url.scheme or "http").strip()
  host = (req.headers.get("x-forwarded-host") or req.headers.get("host") or req.url.netloc or "").strip()
  if not host:
    host = "localhost:8000"
  return f"{proto}://{host}/api/spotify/callback"

def _effective_redirect_uri(req: Request) -> str:
  # Prefer explicit env value, else derive from current request host.
  return SPOTIFY_REDIRECT_URI or _runtime_redirect_uri(req)

@router.get("/login")
async def login(req: Request):
  redirect_uri = _effective_redirect_uri(req)
  if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET and redirect_uri):
    return JSONResponse({"ok": False, "error": "spotify_auth_not_configured"}, status_code=500)
  state = secrets.token_urlsafe(24)
  params = {
    "client_id": SPOTIFY_CLIENT_ID,
    "response_type": "code",
    "redirect_uri": redirect_uri,
    "scope": SCOPES,
    "state": state,
    "show_dialog": "true",
  }
  r = RedirectResponse("https://accounts.spotify.com/authorize?" + urlencode(params))
  # Keep callback exchange consistent with the exact URI used at /login time.
  r.set_cookie("sp_ru", redirect_uri, httponly=True, secure=SPOTIFY_COOKIE_SECURE, samesite="lax", max_age=600)
  r.set_cookie("sp_st", state, httponly=True, secure=SPOTIFY_COOKIE_SECURE, samesite="lax", max_age=600)
  return r

@router.get("/callback")
async def callback(req: Request, code: str = "", state: str = "", error: str = ""):
  frontend_target = f"{FRONTEND_URL}/recommendations"
  if error:
    return RedirectResponse(f"{frontend_target}?spotify_error={error}")
  redirect_uri = (req.cookies.get("sp_ru") or "").strip() or _effective_redirect_uri(req)
  expected_state = (req.cookies.get("sp_st") or "").strip()
  if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET and redirect_uri):
    return JSONResponse({"ok": False, "error": "spotify_auth_not_configured"}, status_code=500)
  if not code:
    return RedirectResponse(f"{frontend_target}?spotify_error=missing_code")
  if expected_state and state != expected_state:
    return RedirectResponse(f"{frontend_target}?spotify_error=invalid_state")
  # Exchange code for access+refresh (Authorization Code flow) :contentReference[oaicite:5]{index=5}
  data = {
    "grant_type": "authorization_code",
    "code": code,
    "redirect_uri": redirect_uri,
  }
  basic = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()

  try:
    async with httpx.AsyncClient(timeout=20) as client:
      resp = await client.post(
        "https://accounts.spotify.com/api/token",
        data=data,
        headers={"Authorization": f"Basic {basic}"},
      )
      resp.raise_for_status()
      tok = resp.json()
  except Exception:
    return RedirectResponse(f"{frontend_target}?spotify_error=token_exchange_failed")

  # Store refresh token in a signed HttpOnly cookie (MVP approach)
  cookie_payload = {
    "refresh_token": tok.get("refresh_token"),
    "created_at": int(time.time())
  }
  signed = _sign(cookie_payload)

  r = RedirectResponse(frontend_target)
  samesite = SPOTIFY_COOKIE_SAMESITE
  if not SPOTIFY_COOKIE_SECURE and samesite == "none":
    # Browsers reject SameSite=None without Secure on HTTP localhost.
    samesite = "lax"
  r.set_cookie(
    "sp_rf",
    signed,
    httponly=True,
    secure=SPOTIFY_COOKIE_SECURE,
    samesite=samesite,
    max_age=60 * 60 * 24 * 30,
  )
  r.delete_cookie("sp_ru")
  r.delete_cookie("sp_st")
  return r

@router.get("/status")
async def status(req: Request):
  runtime_uri = _runtime_redirect_uri(req)
  effective_uri = _effective_redirect_uri(req)
  return {
    "ok": True,
    "configured": bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET and effective_uri),
    "configuredRedirectUri": SPOTIFY_REDIRECT_URI,
    "runtimeRedirectUri": runtime_uri,
    "redirectUri": effective_uri,
    "cookieSecure": SPOTIFY_COOKIE_SECURE,
    "cookieSameSite": SPOTIFY_COOKIE_SAMESITE,
    "hasRefreshCookie": bool(req.cookies.get("sp_rf")),
  }

@router.get("/access-token")
async def access_token(req: Request):
  if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET):
    return JSONResponse({"ok": False, "error": "spotify_auth_not_configured"}, status_code=500)
  # Return a fresh access token to the frontend SDK
  signed = req.cookies.get("sp_rf")
  payload = _unsign(signed) if signed else None
  if not payload or not payload.get("refresh_token"):
    return JSONResponse({"ok": False, "error": "not_authenticated"}, status_code=401)

  data = {"grant_type": "refresh_token", "refresh_token": payload["refresh_token"]}
  basic = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()

  try:
    async with httpx.AsyncClient(timeout=20) as client:
      resp = await client.post(
        "https://accounts.spotify.com/api/token",
        data=data,
        headers={"Authorization": f"Basic {basic}"},
      )
      resp.raise_for_status()
      tok = resp.json()
  except Exception:
    return JSONResponse({"ok": False, "error": "token_refresh_failed"}, status_code=502)

  return {"ok": True, "access_token": tok["access_token"], "expires_in": tok.get("expires_in", 3600)}
