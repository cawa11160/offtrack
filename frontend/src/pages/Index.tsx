import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  Compass,
  Disc3,
  MapPin,
  Music2,
  Radio,
  Search,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  UserRound,
} from "lucide-react";

import { apiGetMusicWeb, apiRecommend, type MusicWebResponse, type RecItem, type SeedSong } from "@/lib/api";
import { albums, featuredPlaylists, merchItems } from "@/data/mockData";
import { useAuth } from "@/lib/auth";
import { useLiveConcerts } from "@/lib/liveEvents";

type Recommendation = {
  id: string;
  title: string;
  artist: string;
  cover: string;
};

function cleanArtist(v: string) {
  const s = (v || "").trim();
  if (!s) return "Unknown Artist";
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s.replace(/'/g, "\""));
      if (Array.isArray(arr) && arr.length > 0) return String(arr[0] || "Unknown Artist");
    } catch {
      // Fall back to a cleaned string below.
    }
    return s.replace(/^\[+|]+$/g, "").replace(/['"]/g, "").trim() || "Unknown Artist";
  }
  return s;
}

function fallbackCover(title: string, artist: string) {
  const text = encodeURIComponent(`${title} ${artist}`.trim() || "music");
  return `https://picsum.photos/seed/${text}/400/400`;
}

function mapRecToCard(r: RecItem): Recommendation {
  const title = (r.title || "Unknown Track").trim();
  const artist = cleanArtist(r.artist || "Unknown Artist");
  return {
    id: r.id,
    title,
    artist,
    cover: (r.imageUrl || "").trim() || fallbackCover(title, artist),
  };
}

function prettyDate(value?: string) {
  if (!value) return "Date TBA";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return value;
}

function RecommendationRail({
  title,
  items,
  onCardClick,
}: {
  title: string;
  items: Recommendation[];
  onCardClick: (item: Recommendation) => void;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <ArrowRight className="h-5 w-5 text-black/40" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <button key={`${title}-${item.id}`} type="button" onClick={() => onCardClick(item)} className="min-w-0 text-left">
            <img
              src={item.cover}
              alt={item.title}
              className="aspect-square w-full rounded-md object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => {
                const el = event.currentTarget;
                if (!el.src.includes("picsum.photos")) el.src = fallbackCover(item.title, item.artist);
              }}
            />
            <p className="mt-2 truncate text-sm font-bold">{item.title}</p>
            <p className="truncate text-xs font-semibold text-black/50">{item.artist}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [homeRecs, setHomeRecs] = useState<Recommendation[]>([]);
  const [musicWeb, setMusicWeb] = useState<MusicWebResponse | null>(null);
  const { concerts: nearbyConcerts, loading: eventsLoading } = useLiveConcerts(8);

  useEffect(() => {
    let alive = true;
    (async () => {
      const seeds: SeedSong[] = [];
      const data = await apiRecommend(seeds, 16, "all", []).catch(() => ({ recommendations: [] as RecItem[] }));
      if (!alive) return;
      const mapped = (data.recommendations || []).map(mapRecToCard).filter((x) => x.title && x.artist);
      setHomeRecs(
        mapped.length
          ? mapped
          : albums.slice(0, 12).map((a) => ({
              id: a.id,
              title: a.title,
              artist: a.artist,
              cover: a.coverUrl || fallbackCover(a.title, a.artist),
            }))
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await apiGetMusicWeb(80).catch(() => null);
      if (alive) setMusicWeb(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const displayName = useMemo(() => {
    const name = (user?.name || "").trim();
    if (name) return name.split(/\s+/)[0];
    const emailName = (user?.email || "").split("@")[0]?.trim();
    return emailName || "there";
  }, [user?.email, user?.name]);

  const madeForYou = useMemo(() => homeRecs.slice(0, 4), [homeRecs]);
  const newReleases = useMemo(() => homeRecs.slice(4, 8), [homeRecs]);
  const recentlyPlayed = useMemo(() => homeRecs.slice(8, 12), [homeRecs]);
  const topArtists = musicWeb?.stats?.topArtists ?? [];
  const topGenres = musicWeb?.stats?.topGenres ?? [];
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return homeRecs.slice(0, 5);
    return homeRecs.filter((item) => `${item.title} ${item.artist}`.toLowerCase().includes(q)).slice(0, 6);
  }, [homeRecs, searchQuery]);

  function openTrack(item: Recommendation) {
    navigate(`/track/${encodeURIComponent(item.id)}?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`);
  }

  function submitSearch() {
    const q = searchQuery.trim();
    if (q) navigate(`/search/${encodeURIComponent(q)}`);
    else navigate("/search");
  }

  const actionCards = [
    { label: "Taste engine", path: "/recommendations", icon: Sparkles, tone: "bg-[#eef2ff]" },
    { label: "Listening graph", path: "/web", icon: Share2, tone: "bg-[#e8f7f5]" },
    { label: "Concert map", path: "/concerts", icon: MapPin, tone: "bg-[#fff7ed]" },
    { label: "Lyric AI", path: "/lyric-ai", icon: Radio, tone: "bg-[#fdf2f8]" },
  ];

  return (
    <div className="min-h-screen w-full bg-white pb-36 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md border border-black/10 bg-white">
              <Music2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Offtrack</p>
              <h1 className="text-2xl font-bold leading-none">Home</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(user ? "/profile" : "/login")}
              className="grid h-10 w-10 place-items-center rounded-md border border-black/10 bg-white hover:bg-black/5"
              aria-label="Profile"
            >
              <UserRound className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="grid h-10 w-10 place-items-center rounded-md border border-black/10 bg-white hover:bg-black/5"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg bg-[#f8f7f2] p-5 sm:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Welcome back {displayName}</p>
            <h2 className="mt-2 max-w-3xl text-4xl font-bold leading-none sm:text-6xl">
              Find the next track, artist, or scene before it breaks.
            </h2>
            <div className="mt-6 flex max-w-3xl flex-col gap-3 sm:flex-row">
              <div className="flex h-12 flex-1 items-center gap-3 rounded-md border border-black/10 bg-white px-4">
                <Search className="h-5 w-5 text-black/45" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitSearch();
                  }}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-black/35"
                  placeholder="Search tracks, artists, genres"
                />
              </div>
              <button
                type="button"
                onClick={submitSearch}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-black px-5 text-sm font-semibold text-white hover:bg-black/80"
              >
                <Compass className="h-4 w-4" />
                Browse
              </button>
            </div>
            {searchResults.length ? (
              <div className="mt-4 grid max-w-3xl gap-2 sm:grid-cols-2">
                {searchResults.slice(0, 4).map((item) => (
                  <button key={`search-${item.id}`} type="button" onClick={() => openTrack(item)} className="flex items-center gap-3 rounded-md bg-white p-2 text-left hover:bg-black/5">
                    <img src={item.cover} alt="" className="h-11 w-11 rounded object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{item.title}</span>
                      <span className="block truncate text-xs font-semibold text-black/50">{item.artist}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="grid gap-3">
            <div className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm font-semibold text-black/55">Your listening profile</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-[#f8f7f2] p-3">
                  <p className="text-2xl font-bold">{musicWeb?.stats?.interactionCount ?? 0}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Signals</p>
                </div>
                <div className="rounded-md bg-[#f8f7f2] p-3">
                  <p className="text-2xl font-bold">{musicWeb?.stats?.trackCount ?? 0}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Tracks</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-black text-sm font-semibold text-white hover:bg-black/80"
              >
                <UserRound className="h-4 w-4" />
                Open profile
              </button>
            </div>

            <div className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
              <p className="text-sm font-semibold text-black/55">Top taste signals</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...topArtists.map((x) => x.name), ...topGenres.map((x) => x.name)].slice(0, 8).map((name) => (
                  <button key={name} type="button" onClick={() => navigate(`/search/${encodeURIComponent(name)}`)} className="rounded-md bg-white px-3 py-2 text-xs font-bold text-black/65 hover:bg-black/5">
                    {name}
                  </button>
                ))}
                {!topArtists.length && !topGenres.length ? <span className="text-sm font-semibold text-black/45">Start listening to build this</span> : null}
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {actionCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.path}
                type="button"
                onClick={() => navigate(card.path)}
                className={`flex h-28 flex-col justify-between rounded-lg border border-black/10 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}
              >
                <Icon className="h-5 w-5 text-black/55" />
                <span className="text-lg font-bold">{card.label}</span>
              </button>
            );
          })}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-5">
            <RecommendationRail title="Made for you" items={madeForYou} onCardClick={openTrack} />
            <RecommendationRail title="New releases for you" items={newReleases} onCardClick={openTrack} />
            <RecommendationRail title="Recently played" items={recentlyPlayed} onCardClick={openTrack} />
          </div>

          <aside className="grid content-start gap-5">
            <section className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">{eventsLoading ? "Updating nearby" : "Live nearby"}</h2>
                <Calendar className="h-5 w-5 text-black/40" />
              </div>
              <div className="mt-4 space-y-2">
                {nearbyConcerts.slice(0, 4).map((concert) => (
                  <button key={concert.id} type="button" onClick={() => navigate("/concerts")} className="flex w-full gap-3 rounded-md p-2 text-left hover:bg-black/5">
                    <img src={concert.coverUrl} alt="" className="h-12 w-12 rounded object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{concert.artist}</span>
                      <span className="block truncate text-xs font-semibold text-black/50">{concert.venue}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-black/45">{prettyDate(concert.date)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Merch picks</h2>
                <ShoppingBag className="h-5 w-5 text-black/40" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {merchItems.slice(0, 4).map((item) => (
                  <button key={item.id} type="button" onClick={() => navigate("/merch")} className="min-w-0 text-left">
                    <img src={item.imageUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                    <p className="mt-2 truncate text-sm font-bold">{item.name}</p>
                    <p className="text-xs font-semibold text-black/50">${item.price}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Playlists</h2>
                <Disc3 className="h-5 w-5 text-black/40" />
              </div>
              <div className="mt-4 space-y-2">
                {featuredPlaylists.slice(0, 4).map((playlist) => (
                  <button key={playlist.id} type="button" onClick={() => navigate("/playlists")} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-black/5">
                    <img src={playlist.coverUrl} alt="" className="h-10 w-10 rounded object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{playlist.title}</span>
                      <span className="block truncate text-xs font-semibold text-black/50">{playlist.artist}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </section>
    </div>
  );
}
