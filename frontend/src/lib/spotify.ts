declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

// Extract track id from either a spotify URL or URI.
// Examples:
// - https://open.spotify.com/track/<id>
// - spotify:track:<id>
export function extractSpotifyTrackId(input?: string | null): string {
  const s = (input ?? "").trim();
  if (!s) return "";

  // URI
  const m1 = s.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (m1?.[1]) return m1[1];

  // URL
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
    const err = new Error(txt || "Spotify not connected");
    // @ts-expect-error - attach status for callers
    err.status = r.status;
    throw err;
  }
  const j = (await r.json()) as any;
  const t = (j?.access_token ?? "").trim();
  if (!t) throw new Error("Spotify token missing");
  return t;
}

export type SpotifySession = {
  player: any;
  deviceId: string;
};

export async function initSpotifyPlayer(apiBase: string, name = "Offtrack Web Player"): Promise<SpotifySession> {
  await loadSpotifySDK();
  const player = new window.Spotify.Player({
    name,
    getOAuthToken: async (cb: (token: string) => void) => {
      const t = await fetchSpotifyAccessToken(apiBase);
      cb(t);
    },
    volume: 0.8,
  });

  const deviceId: string = await new Promise((resolve, reject) => {
    player.addListener("ready", ({ device_id }: any) => resolve(device_id));
    player.addListener("not_ready", () => reject(new Error("Spotify player not ready")));
    player.addListener("initialization_error", ({ message }: any) => reject(new Error(message)));
    player.addListener("authentication_error", ({ message }: any) => reject(new Error(message)));
    player.addListener("account_error", ({ message }: any) => reject(new Error(message)));
    player.connect();
  });

  // Transfer playback to the SDK device (required for play endpoint to target the browser player)
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
