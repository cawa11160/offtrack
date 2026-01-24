import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

type RecentItem = {
  title: string;
  subtitle: string;
};

type GenreTile = {
  title: string;
};

export function SearchScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const initialRecent = useMemo<RecentItem[]>(
    () => [
      { title: "Arima Ederra", subtitle: "Artist" },
      { title: "DAME DAME*", subtitle: "Artist" },
      { title: "Mura Masa", subtitle: "Artist" },
      { title: "Beach Fossils", subtitle: "Artist" },
    ],
    []
  );

  const [recent, setRecent] = useState<RecentItem[]>(initialRecent);

  // Generic, non-branded genres only
  const genres = useMemo<GenreTile[]>(
    () => [
      { title: "Hip-Hop" },
      { title: "Pop" },
      { title: "Rock" },
      { title: "Alternative" },
      { title: "R&B" },
      { title: "Electronic" },
      { title: "Indie" },
      { title: "House" },
      { title: "Techno" },
      { title: "Jazz" },
      { title: "Classical" },
      { title: "Ambient" },
      { title: "Chill" },
      { title: "Lo-Fi" },
      { title: "Country" },
      { title: "Latin" },
      { title: "Afrobeats" },
      { title: "K-Pop" },
      { title: "Metal" },
      { title: "Punk" },
    ],
    []
  );

  const filteredGenres = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return genres;
    return genres.filter((g) => g.title.toLowerCase().includes(q));
  }, [genres, query]);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        {/* Search bar */}
        <div className="sticky top-0 z-10 -mx-6 bg-white/90 px-6 pb-4 pt-2 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists, songs, playlists…"
              className={[
                "w-full rounded-2xl bg-black/5 px-12 py-3",
                "text-black placeholder:text-black/40",
                "outline-none ring-1 ring-black/10 focus:ring-black/20",
              ].join(" ")}
            />
          </div>
        </div>

        {/* Recently Searched */}
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recently Searched</h2>
            <button
              type="button"
              className="text-sm font-medium text-black/60 hover:text-black disabled:opacity-40"
              disabled={recent.length === 0}
              onClick={() => setRecent([])}
            >
              Clear
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <div className="flex w-max gap-3 pb-2">
              {recent.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  onClick={() => navigate(`/artist/${encodeURIComponent(r.title)}`)}
                  className={[
                    "flex min-w-[240px] items-center gap-3 rounded-2xl",
                    "bg-black/5 px-4 py-3 text-left",
                    "ring-1 ring-black/10 hover:bg-black/7",
                    "transition-colors",
                  ].join(" ")}
                >
                  <div className="h-10 w-10 shrink-0 rounded-full bg-black/10" />
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{r.title}</div>
                    <div className="text-sm text-black/50">{r.subtitle}</div>
                  </div>
                </button>
              ))}

              {recent.length === 0 && (
                <div className="rounded-2xl bg-black/5 px-4 py-3 text-sm text-black/50 ring-1 ring-black/10">
                  No recent searches.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Browse Categories */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Browse Genres</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {filteredGenres.map((g) => (
              <button
                key={g.title}
                type="button"
                className={[
                  "relative h-[104px] rounded-2xl",
                  "bg-white ring-1 ring-black/10",
                  "hover:bg-black/5 hover:ring-black/20",
                  "active:scale-[0.99] transition",
                ].join(" ")}
              >
                <div className="absolute left-4 top-4 text-left">
                  <div className="text-base font-semibold leading-tight">{g.title}</div>
                </div>

                {/* subtle corner accent for a little depth without color */}
                <div className="absolute bottom-3 right-4 h-7 w-7 rounded-lg bg-black/5 ring-1 ring-black/10" />
              </button>
            ))}
          </div>

          {filteredGenres.length === 0 && (
            <div className="mt-6 rounded-2xl bg-black/5 p-6 text-black/60 ring-1 ring-black/10">
              No genres match “{query}”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
