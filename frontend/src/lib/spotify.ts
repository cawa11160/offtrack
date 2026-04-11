type SpotifyAccessTokenResponse = {
  access_token?: string;
};

type SpotifyStatusResponse = {
  ok?: boolean;
  configured?: boolean;
  hasRefreshCookie?: boolean;
};

type SpotifyPlayerReadyEvent = {
  device_id: string;
};

type SpotifyPlayerErrorEvent = {
  message: string;
};

type SpotifyPlayerInit = {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void | Promise<void>;
  volume?: number;
};

type SpotifyPlayerEventName =
  | "ready"
  | "not_ready"
  | "initialization_error"
  | "authentication_error"
  | "account_error";

export interface SpotifyPlayer {
  addListener(event: "ready", listener: (event: SpotifyPlayerReadyEvent) => void): boolean;
  addListener(event: "not_ready", listener: () => void): boolean;
  addListener(
    event: "initialization_error" | "authentication_error" | "account_error",
    listener: (event: SpotifyPlayerErrorEvent) => void
  ): boolean;
  addListener(event: SpotifyPlayerEventName, listener: (() => void) | ((event: SpotifyPlayerReadyEvent | SpotifyPlayerErrorEvent) => void)): boolean;
  connect(): Promise<boolean>;
}

interface SpotifyNamespace {
  Player: new (options: SpotifyPlayerInit) => SpotifyPlayer;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: SpotifyNamespace;
  }
}

export type SpotifySession = {
  player: SpotifyPlayer;
  deviceId: string;
};

// Extract track id from either a spotify URL or URI.
// Examples:
// - https://open.spotify.com/track/<id>
// - spotify:track:<id>
export function extractSpotifyTrackId(input?: string | null): string {
  const s = (input ?? "").trim();
  if (!s) return "";

  const m1 = s.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (m1?.[1]) return m1[1];

  const m2 = s.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (m2?.[1]) return m2[1];

  return "";
}

export async function loadSpotifySDK(): Promise<void> {
  if (window.Spotify) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Spotify Web Playback SDK"));
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
  });
}

export async function fetchSpotifyAccessToken(apiBase: string): Promise<string> {
  const r = await fetch(`${apiBase}/api/spotify/access-token`, { credentials: "include" });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    const err = new Error(txt || "Spotify not connected") as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  const j = (await r.json()) as SpotifyAccessTokenResponse;
  const t = (j.access_token ?? "").trim();
  if (!t) throw new Error("Spotify token missing");
  return t;
}

export async function fetchSpotifyStatus(apiBase: string): Promise<{
  ok: boolean;
  configured: boolean;
  hasRefreshCookie: boolean;
}> {
  const r = await fetch(`${apiBase}/api/spotify/status`, { credentials: "include" });
  if (!r.ok) return { ok: false, configured: false, hasRefreshCookie: false };
  const j = (await r.json().catch(() => ({}))) as SpotifyStatusResponse;
  return {
    ok: Boolean(j.ok),
    configured: Boolean(j.configured),
    hasRefreshCookie: Boolean(j.hasRefreshCookie),
  };
}

export async function initSpotifyPlayer(apiBase: string, name = "Offtrack Web Player"): Promise<SpotifySession> {
  await loadSpotifySDK();
  if (!window.Spotify) {
    throw new Error("Spotify Web Playback SDK unavailable");
  }

  const player = new window.Spotify.Player({
    name,
    getOAuthToken: async (cb: (token: string) => void) => {
      const t = await fetchSpotifyAccessToken(apiBase);
      cb(t);
    },
    volume: 0.8,
  });

  const deviceId: string = await new Promise((resolve, reject) => {
    player.addListener("ready", ({ device_id }) => resolve(device_id));
    player.addListener("not_ready", () => reject(new Error("Spotify player not ready")));
    player.addListener("initialization_error", ({ message }) => reject(new Error(message)));
    player.addListener("authentication_error", ({ message }) => reject(new Error(message)));
    player.addListener("account_error", ({ message }) => reject(new Error(message)));
    void player.connect();
  });

  await transferPlayback(apiBase, deviceId);
  return { player, deviceId };
}

export async function transferPlayback(apiBase: string, deviceId: string) {
  const token = await fetchSpotifyAccessToken(apiBase);
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

export async function playSpotifyTrack(apiBase: string, deviceId: string, trackId: string) {
  const token = await fetchSpotifyAccessToken(apiBase);
  const r = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    }
  );
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `Spotify play failed (${r.status})`);
  }
}
