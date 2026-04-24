import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock3, Cog, Music2, Search, User } from "lucide-react";
import { apiRecommend, type RecItem, type SeedSong } from "@/lib/api";
import { albums } from "@/data/mockData";
import { useAuth } from "@/lib/auth";

type Recommendation = {
  id: string;
  title: string;
  artist: string;
  cover: string;
};

function cleanArtist(v: string) {
  const s = (v || "").trim();
  if (!s) return "Unknown Artist";
  // Handle dataset-style strings like "['Artist Name']"
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const json = s.replace(/'/g, "\"");
      const arr = JSON.parse(json);
      if (Array.isArray(arr) && arr.length > 0) return String(arr[0] || "Unknown Artist");
    } catch {
      // no-op
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

function Frame12Section({
  sectionId,
  title,
  recommendations,
  onCardClick,
}: {
  sectionId: string;
  title: string;
  recommendations: Recommendation[];
  onCardClick: (item: Recommendation) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">{title}</h3>
        <div className="flex h-10 items-center gap-[10px]">
          <ChevronLeft className="h-6 w-6 text-black/70" />
          <ChevronRight className="h-6 w-6 text-black/70" />
        </div>
      </div>

      <div className="rounded-[10px] bg-[#d0d0d0] px-[17px] pb-[12px] pt-[13px]">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recommendations.map((item) => (
            <button
              key={`${item.id}-${sectionId}`}
              type="button"
              onClick={() => onCardClick(item)}
              className="flex w-full max-w-[190px] flex-col items-center justify-self-center text-center transition-transform hover:scale-[1.02]"
            >
              <img
                src={item.cover}
                alt={`${item.title} cover`}
                className="h-[170px] w-[170px] rounded-[6px] object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.src.includes("picsum.photos")) {
                    el.src = fallbackCover(item.title, item.artist);
                  }
                }}
              />
              <h4 className="mt-[12px] h-[52px] overflow-hidden font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
                {item.title}
              </h4>
              <p className="h-[28px] overflow-hidden font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black/90">
                {item.artist}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [homeRecs, setHomeRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const seeds: SeedSong[] = [];
      const data = await apiRecommend(seeds, 16, "all", []).catch(() => ({ recommendations: [] as RecItem[] }));
      if (!alive) return;

      const mapped = (data.recommendations || []).map(mapRecToCard).filter((x) => x.title && x.artist);
      if (mapped.length > 0) {
        setHomeRecs(mapped);
        return;
      }

      setHomeRecs(
        albums.slice(0, 12).map((a) => ({
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

  const madeForYou = useMemo(() => homeRecs.slice(0, 3), [homeRecs]);
  const newReleases = useMemo(() => homeRecs.slice(3, 6), [homeRecs]);
  const recentlyPlayed = useMemo(() => homeRecs.slice(6, 9), [homeRecs]);
  const moreIndie = useMemo(() => homeRecs.slice(9, 12), [homeRecs]);
  const displayName = useMemo(() => {
    const name = (user?.name || "").trim();
    if (name) return name.split(/\s+/)[0];
    const emailName = (user?.email || "").split("@")[0]?.trim();
    return emailName || "there";
  }, [user?.email, user?.name]);

  function openTrack(item: Recommendation) {
    navigate(
      `/track/${encodeURIComponent(item.id)}?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`
    );
  }

  function goAccount() {
    navigate(user ? "/account" : "/login");
  }

  return (
    <div className="relative min-h-screen w-full bg-white">
      <section className="w-full bg-white px-3 py-5 pb-44 sm:px-7 sm:py-7 sm:pb-44">
        <div className="mx-auto flex w-full max-w-full flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="flex h-fit items-center gap-2">
            <div className="grid h-[55px] w-[60px] place-items-center rounded-[10px] border border-black bg-white">
              <Music2 className="h-7 w-7 text-black" />
            </div>
            <h1 className="font-['Arimo',sans-serif] text-[32px] font-bold leading-none text-black">Offtrack</h1>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <div className="h-[54px] rounded-[10px] bg-[#d0d0d0] px-4 py-[10px]">
                  <div className="flex h-full items-center gap-3">
                    <Search className="h-6 w-6 text-black/75" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchOpen(true)}
                      onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
                      placeholder="Search"
                      className="h-full flex-1 bg-transparent font-['Arimo',sans-serif] text-[22px] font-bold leading-none text-black outline-none placeholder:text-black/60"
                    />
                    <div className="rounded-[8px] bg-white px-3 py-1 font-['Arimo',sans-serif] text-[16px] font-bold text-black/55">
                      Ctrl + K
                    </div>
                  </div>
                </div>

                {searchOpen && (
                  <div className="absolute left-0 right-0 top-[86px] z-30 overflow-hidden rounded-[10px] border border-black/10 bg-[#d0d0d0]">
                    <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.05fr_0.95fr]">
                      <div className="border-b border-black/10 px-4 py-4 lg:border-b-0 lg:border-r">
                        <p className="font-['Arimo',sans-serif] text-[22px] font-bold text-black/70">Recent</p>
                        <div className="mt-3 space-y-3">
                          {["Neoma", "Perspective", "Neumorphism"].map((item) => (
                            <button
                              key={item}
                              type="button"
                              className="flex items-center gap-3 font-['Arimo',sans-serif] text-[28px] font-bold text-black"
                            >
                              <Clock3 className="h-6 w-6 text-black/50" />
                              {item}
                            </button>
                          ))}
                        </div>

                        <div className="mt-5 border-t border-black/10 pt-4 font-['Arimo',sans-serif] text-[26px] font-bold leading-tight text-black">
                          <button type="button" onClick={goAccount} className="block">
                            Profile
                          </button>
                          <button type="button" onClick={() => navigate("/settings")} className="block">
                            Settings
                          </button>
                        </div>
                      </div>

                      <div className="px-4 py-4 font-['Arimo',sans-serif] font-bold text-black">
                        <div className="rounded-[10px] bg-white p-4">
                          <p className="text-[30px] leading-none">Songs</p>
                          <p className="mt-2 text-[24px] text-black/75">Find more</p>
                        </div>
                        <div className="mt-3 rounded-[10px] bg-white p-4">
                          <p className="text-[30px] leading-none">Albums</p>
                          <p className="mt-2 text-[24px] text-black/75">Find more...</p>
                        </div>
                        <div className="mt-3 rounded-[10px] bg-white p-4">
                          <p className="text-[30px] leading-none">Playlists</p>
                          <p className="mt-2 text-[24px] text-black/75">Find more...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex h-[54px] w-[110px] items-center justify-center gap-2 rounded-[10px] bg-[#d0d0d0] px-4 py-[7px]">
                <button type="button" onClick={goAccount} aria-label="Go to account">
                  <User className="h-8 w-8 text-black/80" />
                </button>
                <button type="button" onClick={() => navigate("/settings")} aria-label="Go to settings">
                  <Cog className="h-8 w-8 text-black/80" />
                </button>
              </div>
            </div>

            <div className="mb-8 rounded-[10px] bg-[#d0d0d0] px-[9px] py-8">
              <div className="max-w-[615px] font-['Arimo',sans-serif] font-bold text-black">
                <h2 className="text-[36px] leading-[1.1]">Welcome back {displayName},</h2>
                <p className="mt-1 text-[24px] leading-[1.15]">
                  A streaming experience built for discovering new voices, new scenes, and new sounds. Explore new
                  artists, scenes, and sounds before they break through.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/artist")}
                  className="mt-5 rounded-[10px] bg-black px-5 py-3 text-[18px] text-white transition-opacity hover:opacity-90"
                >
                  Open Artist Hub
                </button>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-[15px] lg:grid-cols-2">
              <div className="min-w-0 rounded-[10px] bg-[#d0d0d0] p-[10px]">
                <div className="font-['Arimo',sans-serif] text-black">
                  <p className="pt-2 text-[20px] font-bold leading-tight">Your daily usage pattern</p>
                  <p className="mt-2 text-[18px] font-bold leading-tight">On average, you have spent 1 hr on Offtrack</p>
                  <p className="text-[18px] font-bold leading-tight">You typically use Offtrack at night</p>
                </div>
              </div>

              <div className="min-w-0 rounded-[10px] bg-[#d0d0d0] px-[10px] py-[17px] font-['Arimo',sans-serif] font-bold text-black">
                <p className="text-[20px] leading-tight">Most streamed genres for you are currently...</p>
                <p className="text-[18px] leading-tight">Indie rock, Pop, Punk rock</p>
                <p className="mt-3 text-[20px] leading-tight">Most streamed musicians for you are currently...</p>
                <p className="text-[18px] leading-tight">
                  {madeForYou.map((x) => x.artist).filter(Boolean).slice(0, 3).join(", ") || "Loading..."}
                </p>
              </div>
            </div>

            <Frame12Section sectionId="frame12-1" title="Made for you" recommendations={madeForYou} onCardClick={openTrack} />
            <div className="mt-8">
              <Frame12Section sectionId="frame12-2" title="New releases for you" recommendations={newReleases} onCardClick={openTrack} />
            </div>
            <div className="mt-8">
              <Frame12Section sectionId="frame12-3" title="Recently played" recommendations={recentlyPlayed} onCardClick={openTrack} />
            </div>
            <div className="mt-8">
              <Frame12Section sectionId="frame12-4" title="More indie rock..." recommendations={moreIndie} onCardClick={openTrack} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
