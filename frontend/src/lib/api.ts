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

export type RecommendResponse = {
  recommendations: Array<{
    id: string;
    title: string;
    artist: string;
    year?: number | null;
    popularity?: number;
    imageUrl?: string;
  }>;
};

export async function apiSearch(q: string, limit = 8): Promise<SearchResult[]> {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json();
  return (data?.results ?? []) as SearchResult[];
}

export async function apiRecommend(
  seeds: SeedSong[],
  n = 9,
  mode: "all" | "indie" | "mainstream" = "all"
): Promise<RecommendResponse> {
  const r = await fetch(`/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds, n, mode }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(msg || "Recommend failed");
  }
  return (await r.json()) as RecommendResponse;
}
