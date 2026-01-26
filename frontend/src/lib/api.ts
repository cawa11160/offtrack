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

// ✅ Production-safe API base:
// - Local dev: leave VITE_API_BASE unset → uses same-origin "/api/..."
// - Vercel/prod: set VITE_API_BASE="https://your-backend-domain" → calls that host
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

function withDistinct(headers?: HeadersInit): HeadersInit {
  const h = new Headers(headers);
  const did = getDistinctId();
  if (did) h.set("X-Posthog-Distinct-Id", did);
  return h;
}

function buildUrl(path: string): string {
  // path expected like "/api/..."
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const url = buildUrl(path);
  return fetch(url, { ...init, headers: withDistinct(init.headers) });
}

async function readErrorMessage(r: Response): Promise<string> {
  // backend might return JSON or text
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await r.json().catch(() => null);
    const msg =
      (j && (j.detail || j.message || j.error)) ??
      (typeof j === "string" ? j : null);
    return msg ? String(msg) : "";
  }
  return await r.text().catch(() => "");
}

export async function apiSearch(q: string, limit = 8): Promise<SearchResult[]> {
  const r = await apiFetch(
    `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
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
      distinct_id: getDistinctId(),
    }),
  });

  if (!r.ok) {
    const msg = await readErrorMessage(r);
    throw new Error(msg || `Recommend failed (${r.status})`);
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
  // feedback shouldn't hard-fail the UI
  if (!r.ok) return;
}
