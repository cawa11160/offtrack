import base64, hashlib, hmac, json, os, time
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

router = APIRouter(prefix="/api/spotify", tags=["spotify"])

SPOTIFY_CLIENT_ID = os.environ["SPOTIFY_CLIENT_ID"]
SPOTIFY_CLIENT_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]
SPOTIFY_REDIRECT_URI = os.environ["SPOTIFY_REDIRECT_URI"]
FRONTEND_URL = os.environ["FRONTEND_URL"]
COOKIE_SECRET = os.environ["COOKIE_SECRET"].encode()

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

@router.get("/login")
async def login():
  params = {
    "client_id": SPOTIFY_CLIENT_ID,
    "response_type": "code",
    "redirect_uri": SPOTIFY_REDIRECT_URI,
    "scope": SCOPES,
    "show_dialog": "true",
  }
  return RedirectResponse("https://accounts.spotify.com/authorize?" + urlencode(params))

@router.get("/callback")
async def callback(code: str):
  # Exchange code for access+refresh (Authorization Code flow) :contentReference[oaicite:5]{index=5}
  data = {
    "grant_type": "authorization_code",
    "code": code,
    "redirect_uri": SPOTIFY_REDIRECT_URI,
  }
  basic = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()

  async with httpx.AsyncClient(timeout=20) as client:
    resp = await client.post(
      "https://accounts.spotify.com/api/token",
      data=data,
      headers={"Authorization": f"Basic {basic}"},
    )
    resp.raise_for_status()
    tok = resp.json()

  # Store refresh token in a signed HttpOnly cookie (MVP approach)
  cookie_payload = {
    "refresh_token": tok.get("refresh_token"),
    "created_at": int(time.time())
  }
  signed = _sign(cookie_payload)

  r = RedirectResponse(f"{FRONTEND_URL}/recommendations")
  r.set_cookie(
    "sp_rf",
    signed,
    httponly=True,
    secure=True,
    samesite="none",
    max_age=60 * 60 * 24 * 30,
  )
  return r

@router.get("/access-token")
async def access_token(req: Request):
  # Return a fresh access token to the frontend SDK
  signed = req.cookies.get("sp_rf")
  payload = _unsign(signed) if signed else None
  if not payload or not payload.get("refresh_token"):
    return JSONResponse({"ok": False, "error": "not_authenticated"}, status_code=401)

  data = {"grant_type": "refresh_token", "refresh_token": payload["refresh_token"]}
  basic = base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()

  async with httpx.AsyncClient(timeout=20) as client:
    resp = await client.post(
      "https://accounts.spotify.com/api/token",
      data=data,
      headers={"Authorization": f"Basic {basic}"},
    )
    resp.raise_for_status()
    tok = resp.json()

  return {"ok": True, "access_token": tok["access_token"], "expires_in": tok.get("expires_in", 3600)}
