import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Disc3, MapPin, Music2, Search, Sparkles, Tags } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { albums, featuredPlaylists } from "@/data/mockData";
import { useLiveConcerts } from "@/lib/liveEvents";

type BrowseTile = {
  title: string;
  subtitle: string;
  tone: string;
  icon: typeof Music2;
};

const browseTiles: BrowseTile[] = [
  { title: "New Music", subtitle: "Fresh releases", tone: "bg-[#e8f7f5]", icon: Sparkles },
  { title: "Hits", subtitle: "Fast-moving tracks", tone: "bg-[#f7e8ec]", icon: Disc3 },
  { title: "For you", subtitle: "Taste-led picks", tone: "bg-[#eef2ff]", icon: Compass },
  { title: "Underground", subtitle: "Left-field finds", tone: "bg-[#f6f0df]", icon: Tags },
  { title: "Local", subtitle: "Nearby scenes", tone: "bg-[#e7f0df]", icon: MapPin },
  { title: "Charts", subtitle: "Ranked now", tone: "bg-[#f1f5f9]", icon: ArrowRight },
  { title: "70s rock", subtitle: "Classic guitars", tone: "bg-[#fff7ed]", icon: Disc3 },
  { title: "80s Pop", subtitle: "Bright hooks", tone: "bg-[#fdf2f8]", icon: Music2 },
  { title: "Acoustic", subtitle: "Stripped down", tone: "bg-[#f5f5f4]", icon: Music2 },
  { title: "Unwind", subtitle: "Low pressure", tone: "bg-[#ecfeff]", icon: Sparkles },
  { title: "Focus", subtitle: "Deep work", tone: "bg-[#f0fdf4]", icon: Compass },
  { title: "Dance", subtitle: "Club energy", tone: "bg-[#eef2ff]", icon: Tags },
];

export function SearchScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const quickResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return albums.slice(0, 6);
    return albums.filter((item) => `${item.title} ${item.artist}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const { concerts: upcomingConcerts, loading: eventsLoading } = useLiveConcerts(4);

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-md text-black transition-colors hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="grid h-11 w-11 place-items-center rounded-md border border-black/10 bg-white">
            <Music2 className="h-6 w-6 text-black" />
          </div>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Browse</p>
            <h1 className="mt-1 text-4xl font-bold leading-none sm:text-5xl">Discover</h1>
            <div className="mt-5 flex h-12 max-w-3xl items-center gap-3 rounded-md border border-black/10 bg-[#f8f7f2] px-4">
              <Search className="h-5 w-5 text-black/45" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-black/35"
                placeholder="Search albums, artists, moods"
              />
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
            <p className="text-sm font-semibold text-black/55">{eventsLoading ? "Updating live nearby" : "Live nearby"}</p>
            <div className="mt-3 space-y-2">
              {upcomingConcerts.map((concert) => (
                <button
                  key={concert.id}
                  type="button"
                  onClick={() => navigate("/concerts")}
                  className="flex w-full items-center gap-3 rounded-md bg-white p-2 text-left transition hover:bg-black/5"
                >
                  <img src={concert.coverUrl} alt="" className="h-10 w-10 rounded object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{concert.artist}</span>
                    <span className="block truncate text-xs font-semibold text-black/50">{concert.venue}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {browseTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.title}
                type="button"
                onClick={() => navigate(`/search/${encodeURIComponent(tile.title)}`)}
                className={`flex h-36 flex-col justify-between rounded-lg border border-black/10 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${tile.tone}`}
              >
                <Icon className="h-6 w-6 text-black/65" />
                <span>
                  <span className="block text-xl font-bold">{tile.title}</span>
                  <span className="mt-1 block text-sm font-semibold text-black/55">{tile.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>

        <section className="mt-8 rounded-lg border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{query.trim() ? "Search results" : "Recommended albums"}</h2>
            <button type="button" onClick={() => navigate("/recommendations")} className="inline-flex items-center gap-1 text-sm font-bold text-black/55 hover:text-black">
              More
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {quickResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/search/${encodeURIComponent(item.artist)}`)}
                className="min-w-0 text-left"
              >
                <img src={item.coverUrl} alt={item.title} className="aspect-square w-full rounded-md object-cover" />
                <p className="mt-2 truncate text-sm font-bold">{item.title}</p>
                <p className="truncate text-xs font-semibold text-black/50">{item.artist}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
          <h2 className="text-xl font-bold">Curated playlists</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {featuredPlaylists.map((playlist) => (
              <button key={playlist.id} type="button" onClick={() => navigate("/playlists")} className="min-w-0 text-left">
                <img src={playlist.coverUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                <p className="mt-2 truncate text-sm font-bold">{playlist.title}</p>
                <p className="truncate text-xs font-semibold text-black/50">{playlist.artist}</p>
              </button>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
