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

function withDistinct(headers?: HeadersInit): HeadersInit {
  const h = new Headers(headers);
  h.set("X-Posthog-Distinct-Id", getDistinctId());
  return h;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(path, { ...init, headers: withDistinct(init.headers) });
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
      distinct_id: getDistinctId(),
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(msg || "Recommend failed");
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
  if (!r.ok) return;
}
