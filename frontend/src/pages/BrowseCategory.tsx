import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Disc3, Music2, Search, SlidersHorizontal } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { albums, featuredPlaylists } from "@/data/mockData";
import { useLiveConcerts } from "@/lib/liveEvents";

function imageForTopic(topic: string) {
  const seed = encodeURIComponent(topic || "music");
  return `https://source.unsplash.com/1200x500/?${seed},music`;
}

export default function BrowseCategory() {
  const navigate = useNavigate();
  const { topic } = useParams<{ topic: string }>();
  const heading = useMemo(() => decodeURIComponent(topic ?? "Browse"), [topic]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"match" | "newest">("match");
  const { concerts: liveConcerts } = useLiveConcerts(4);

  const results = useMemo(() => {
    const q = `${heading} ${query}`.trim().toLowerCase();
    const rows = albums.filter((item) => {
      if (!query.trim()) return true;
      return `${item.title} ${item.artist} ${item.year}`.toLowerCase().includes(query.toLowerCase());
    });
    const fallback = rows.length ? rows : albums.filter((item) => `${item.title} ${item.artist}`.toLowerCase().includes(q.split(" ")[0] ?? ""));
    return [...fallback].sort((a, b) => (sort === "newest" ? b.year - a.year : a.title.localeCompare(b.title)));
  }, [heading, query, sort]);

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-md text-black transition-colors hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/recommendations")}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            <Disc3 className="h-4 w-4" />
            Recommendations
          </button>
        </div>

        <section className="mt-6 overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f2]">
          <div className="relative min-h-[280px]">
            <img src={imageForTopic(heading)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/45" />
            <div className="relative flex min-h-[280px] flex-col justify-end p-5 text-white sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/75">Browse</p>
              <h1 className="mt-1 text-4xl font-bold leading-none sm:text-6xl">{heading}</h1>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="flex h-12 items-center gap-3 rounded-md border border-black/10 bg-[#f8f7f2] px-4">
            <Search className="h-5 w-5 text-black/45" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-black/35"
              placeholder={`Search ${heading}`}
            />
          </div>
          <div className="flex h-12 items-center gap-2 rounded-md border border-black/10 bg-white px-3">
            <SlidersHorizontal className="h-4 w-4 text-black/45" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "match" | "newest")}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            >
              <option value="match">Best match</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Albums and artists</h2>
              <span className="text-sm font-semibold text-black/45">{results.length} results</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/artist/${encodeURIComponent(item.artist)}`)}
                  className="min-w-0 text-left"
                >
                  <img src={item.coverUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                  <p className="mt-2 truncate text-sm font-bold">{item.title}</p>
                  <p className="truncate text-xs font-semibold text-black/50">{item.artist}</p>
                </button>
              ))}
            </div>
          </div>

          <aside className="grid gap-5">
            <div className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
              <h2 className="text-lg font-bold">Playlists</h2>
              <div className="mt-3 space-y-2">
                {featuredPlaylists.slice(0, 4).map((playlist) => (
                  <button key={playlist.id} type="button" onClick={() => navigate("/playlists")} className="flex w-full items-center gap-3 rounded-md bg-white p-2 text-left hover:bg-black/5">
                    <img src={playlist.coverUrl} alt="" className="h-11 w-11 rounded object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{playlist.title}</span>
                      <span className="block truncate text-xs font-semibold text-black/50">{playlist.artist}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <h2 className="text-lg font-bold">Concerts</h2>
              <div className="mt-3 space-y-2">
                {liveConcerts.slice(0, 4).map((concert) => (
                  <button key={concert.id} type="button" onClick={() => navigate("/concerts")} className="flex w-full items-center justify-between gap-3 rounded-md p-2 text-left hover:bg-black/5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{concert.artist}</span>
                      <span className="block truncate text-xs font-semibold text-black/50">{concert.venue}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-black/45" />
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <button
          type="button"
          onClick={() => navigate("/search")}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold transition hover:bg-black/5"
        >
          <Music2 className="h-4 w-4" />
          Browse all
        </button>
      </section>
    </div>
  );
}
