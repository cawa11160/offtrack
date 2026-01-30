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
  spotifyUrl?: string | null;
  spotifyUri?: string | null;
  durationMs?: number | null;

  reasons?: string[];
};

export type RecommendResponse = {
  recommendations: RecItem[];
};

// If you set VITE_API_BASE_URL on Vercel (e.g. https://your-backend.com),
// we’ll call it directly. Otherwise we use same-origin (/api/*) which works
// great with a Vercel rewrite.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

function withDistinct(headers?: HeadersInit): HeadersInit {
  const h = new Headers(headers);
  // keep both: header for server logs + body field for explicit tracking
  h.set("X-Posthog-Distinct-Id", getDistinctId());
  return h;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const url = API_BASE ? `${API_BASE}${path}` : path;
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
  event: "like" | "dislike" | "play" | "open_spotify" | "click_recommendation"
): Promise<void> {
  const r = await apiFetch(`/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, event, distinct_id: getDistinctId() }),
  });
  // feedback is best-effort
  if (!r.ok) return;
}
