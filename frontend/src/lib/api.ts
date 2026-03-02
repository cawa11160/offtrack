import { getAlreadyShownIds, getDistinctId } from "./analytics";

export type SearchResult = {
  title: string;
  artist?: string;
  year?: number | null;
  id?: string | null;
  imageUrl?: string;
  source?: "db" | "spotify";
};

export type SeedSong = {
  title: string;
  artist?: string;
  year?: number | null;
  id?: string | null;
};

export type RecItem = {
  id: string;
  title: string;
  artist: string;
  year?: number | null;
  popularity?: number;
  imageUrl?: string;

  previewUrl?: string | null;
  audioUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyUri?: string | null;
  spotifyArtistUrl?: string | null;
  durationMs?: number | null;

  reasons?: string[];
};

export type MusicianRec = {
  id: string;
  name: string;
  imageUrl?: string | null;
  spotifyUrl?: string | null;
  topTracks?: string[];
  reasons?: string[];
  concertsUrl?: string;
};

export type RecommendResponse = {
  recommendations: RecItem[];
  musicians?: MusicianRec[];
};

export type TrackDetail = {
  id?: string | null;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  previewUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyUri?: string | null;
  durationMs?: number | null;
  source?: string;
};

// If you set VITE_API_BASE_URL on Vercel (e.g. https://your-backend.com),
// we’ll call it directly. Otherwise we use same-origin (/api/*) which works
// great with a Vercel rewrite.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

export function apiUrl(path: string) {
  // Use backend base if configured; otherwise same-origin.
  return API_BASE ? `${API_BASE}${path}` : path;
}

function withDistinct(headers?: HeadersInit): HeadersInit {
  const h = new Headers(headers);
  // keep both: header for server logs + body field for explicit tracking
  h.set("X-Posthog-Distinct-Id", getDistinctId());
  return h;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const url = apiUrl(path);
  return fetch(url, { credentials: init.credentials ?? "include", ...init, headers: withDistinct(init.headers) });
}

async function readError(r: Response): Promise<string> {
  // try json first, then text
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await r.json().catch(() => null);
    const msg =
      (j && (j.error || j.message || j.detail)) ? String(j.error || j.message || j.detail) : "";
    if (msg) return msg;
  }
  const t = await r.text().catch(() => "");
  return t || `${r.status} ${r.statusText}`;
}

export async function apiSearch(q: string, limit = 8): Promise<SearchResult[]> {
  const r = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.results ?? []) as SearchResult[];
}

export async function apiRecommend(
  seeds: SeedSong[],
  n = 9,
  mode: "all" | "indie" | "mainstream" = "all",
  alreadyShownIds: string[] = getAlreadyShownIds()
): Promise<RecommendResponse> {
  const r = await apiFetch(`/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seeds,
      n,
      mode,
      already_shown_ids: alreadyShownIds,
      distinct_id: getDistinctId()
    }),
  });

  if (!r.ok) {
    throw new Error(await readError(r));
  }
  return (await r.json()) as RecommendResponse;
}

export async function apiFeedback(
  trackId: string,
  event: "like" | "superlike" | "dislike" | "play" | "open_spotify" | "click_recommendation"
): Promise<boolean> {
  const r = await apiFetch(`/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, event, distinct_id: getDistinctId() }),
  });
  if (!r.ok) return false;
  return true;
}

export async function apiGetTrackDetail(args: {
  trackId?: string;
  title?: string;
  artist?: string;
}): Promise<TrackDetail> {
  const q = new URLSearchParams();
  if (args.trackId) q.set("track_id", args.trackId);
  if (args.title) q.set("title", args.title);
  if (args.artist) q.set("artist", args.artist);
  const r = await apiFetch(`/api/track?${q.toString()}`);
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as TrackDetail;
}

export type UploadedTrackItem = {
  id: string;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  audioUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
};

export async function apiListUploads(limit = 50): Promise<UploadedTrackItem[]> {
  const r = await apiFetch(`/api/uploads?limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.tracks ?? []) as UploadedTrackItem[];
}

export async function apiUploadNewTrack(args: {
  title: string;
  artist?: string;
  imageUrl?: string;
  file: File;
}): Promise<UploadedTrackItem> {
  const fd = new FormData();
  fd.append("title", args.title);
  fd.append("artist", args.artist ?? "");
  fd.append("image_url", args.imageUrl ?? "");
  fd.append("file", args.file);

  const r = await apiFetch(`/api/uploads`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as UploadedTrackItem;
}

// -----------------------------
// Lyric AI reels / images
// -----------------------------
export type ReelItem = {
  id: string;
  downloadUrl?: string;
  sizeBytes?: number;
  createdAt?: string;
  mode?: "video" | "images";
  provider?: string;
  imageDataUrls?: string[];
  detail?: string;
};

export async function apiCreateReel(args: {
  lyrics: string;
  title?: string;
  artist?: string;
  output?: "video" | "images";
  imageCount?: number;
}): Promise<ReelItem> {
  const r = await apiFetch(`/api/reels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lyrics: args.lyrics,
      title: args.title ?? null,
      artist: args.artist ?? null,
      output: args.output ?? "video",
      image_count: args.imageCount ?? 4,
    }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as ReelItem;
}

export async function apiListReels(limit = 20): Promise<ReelItem[]> {
  const r = await apiFetch(`/api/reels?limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.reels ?? []) as ReelItem[];
}
