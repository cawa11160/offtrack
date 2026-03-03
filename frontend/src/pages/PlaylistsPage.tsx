import { useMemo, useState } from "react";
import { ArrowLeft, Music2, Plus, Search, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

type Playlist = {
  id: string;
  name: string;
  trackCount: number;
  duration: string;
};

type Track = {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  duration: string;
  coverUrl: string;
};

const starterPlaylists: Playlist[] = [
  { id: "playlist-1", name: "Winter szn", trackCount: 4, duration: "13 min" },
  { id: "playlist-2", name: "Playlist name 2", trackCount: 21, duration: "1 hr 11 min" },
  { id: "playlist-3", name: "Playlist name 3", trackCount: 9, duration: "31 min" },
  { id: "playlist-4", name: "Playlist name 4", trackCount: 17, duration: "58 min" },
];

const sampleTracks: Track[] = [
  {
    id: "t1",
    title: "CPR",
    subtitle: "Moisturiser",
    artist: "Wetleg",
    duration: "3:34",
    coverUrl: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop",
  },
  {
    id: "t2",
    title: "mangetout",
    subtitle: "Moisturiser",
    artist: "Wetleg",
    duration: "3:34",
    coverUrl: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop",
  },
  {
    id: "t3",
    title: "mangetout",
    subtitle: "Moisturiser",
    artist: "Wetleg",
    duration: "3:34",
    coverUrl: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop",
  },
  {
    id: "t4",
    title: "mangetout",
    subtitle: "Moisturiser",
    artist: "Wetleg",
    duration: "3:34",
    coverUrl: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop",
  },
];

function makePlaylistId(existing: Playlist[]) {
  let i = existing.length + 1;
  while (existing.some((item) => item.id === `playlist-${i}`)) {
    i += 1;
  }
  return `playlist-${i}`;
}

export default function PlaylistsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [playlists, setPlaylists] = useState<Playlist[]>(starterPlaylists);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  const selectedFromUrl = searchParams.get("playlist");
  const selectedId = useMemo(() => {
    if (selectedFromUrl && playlists.some((p) => p.id === selectedFromUrl)) {
      return selectedFromUrl;
    }
    return playlists[0]?.id ?? "";
  }, [selectedFromUrl, playlists]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedId) ?? playlists[0];

  const displayedTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sampleTracks;
    return sampleTracks.filter((track) => {
      const haystack = `${track.title} ${track.subtitle} ${track.artist}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const openModal = () => {
    setName("");
    setIsOpen(true);
  };

  const createPlaylist = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setPlaylists((prev) => {
      const id = makePlaylistId(prev);
      const next = [{ id, name: trimmed, trackCount: 0, duration: "0 min" }, ...prev];
      navigate(`/playlists?playlist=${encodeURIComponent(id)}`);
      return next;
    });
    setIsOpen(false);
  };

  const removePlaylist = (id: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (!next.length) return prev;

      if (id === selectedId) {
        navigate(`/playlists?playlist=${encodeURIComponent(next[0].id)}`);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-44">
      <section className="mx-auto w-full max-w-[1420px] px-4 pt-6 sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-[10px] text-black transition-colors hover:bg-black/5"
              aria-label="Go back"
            >
              <ArrowLeft className="h-7 w-7" />
            </button>
            <div className="grid h-12 w-12 place-items-center rounded-[10px] border border-black bg-white">
              <Music2 className="h-7 w-7 text-black" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex h-[54px] w-full items-center gap-2 rounded-[10px] bg-[#d9d9d9] px-3 sm:w-[337px]">
              <Search className="h-5 w-5 text-black/70" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search in playlist/album..."
                className="w-full bg-transparent font-['Arimo',sans-serif] text-[20px] font-bold text-black placeholder:text-black/85 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex h-[54px] items-center gap-2 rounded-[10px] bg-[#ff9494] px-4 font-['Arimo',sans-serif] text-[20px] font-bold text-black"
            >
              <Plus className="h-5 w-5" />
              New
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="h-[190px] overflow-hidden sm:h-[260px] lg:h-[310px]">
            <img
              src="https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=2200&h=700&fit=crop"
              alt="Playlist cover"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="relative z-20 -mt-16 w-full max-w-[721px] rounded-[10px] bg-[#d9d9d9] px-5 pb-3 pt-4 sm:-mt-20 sm:px-6 sm:pb-4 sm:pt-5">
            <div>
              <h1 className="font-['Arimo',sans-serif] text-[42px] font-bold leading-[0.95] text-black sm:text-[48px]">
                {selectedPlaylist?.name ?? "Playlist"}
              </h1>
              <p className="mt-1 font-['Arimo',sans-serif] text-[26px] font-bold leading-none text-black sm:text-[40px]">
                Mlissa
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex h-[63px] min-w-[156px] items-center justify-center rounded-[10px] bg-[#ff9494] px-8 font-['Arimo',sans-serif] text-[36px] font-bold leading-none text-black"
              >
                Play
              </button>
              <button
                type="button"
                className="inline-flex h-[63px] min-w-[181px] items-center justify-center rounded-[10px] bg-[#ff9494] px-8 font-['Arimo',sans-serif] text-[36px] font-bold leading-none text-black"
              >
                Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-[154px] rounded-[10px] bg-[#d1d1d1] px-4 py-5 sm:mt-[130px] sm:px-8 sm:py-6 lg:mt-[42px]">
          <div className="grid grid-cols-[minmax(0,1fr)_220px_120px] gap-3 pb-3 font-['Arimo',sans-serif] text-[34px] font-bold leading-none text-black sm:px-4">
            <p>Song</p>
            <p className="-ml-20">Artist</p>
            <p>Time</p>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {displayedTracks.map((track) => (
              <div
                key={track.id}
                className="grid grid-cols-[minmax(0,1fr)_220px_120px] items-center gap-3 rounded-[10px] px-1 py-1 sm:px-4"
              >
                <div className="flex min-w-0 items-end gap-3">
                  <img
                    src={track.coverUrl}
                    alt={`${track.title} cover`}
                    className="h-[76px] w-[76px] rounded-[2px] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-['Arimo',sans-serif] text-[36px] font-bold leading-[1.15] text-black">
                      {track.title}
                    </p>
                    <p className="truncate font-['Arimo',sans-serif] text-[30px] font-bold leading-[1.05] text-black">
                      {track.subtitle}
                    </p>
                  </div>
                </div>
                <p className="-ml-20 whitespace-nowrap px-3 font-['Arimo',sans-serif] text-[42px] font-bold leading-none text-black">
                  {track.artist}
                </p>
                <p className="whitespace-nowrap px-3 text-right font-['Arimo',sans-serif] text-[42px] font-bold leading-none text-black">
                  {track.duration}
                </p>
              </div>
            ))}
          </div>
        </div>

      </section>

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
          <div className="w-full max-w-[560px] rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-['Arimo',sans-serif] text-[28px] font-bold leading-none text-black">
                Create playlist
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-[10px] bg-white text-black"
                aria-label="Close create playlist dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-[10px] bg-white p-4">
              <label className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.08em] text-black/60">
                Playlist name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="My new playlist"
                className="mt-2 w-full rounded-[10px] border border-black/10 px-4 py-3 font-['Arimo',sans-serif] text-[18px] font-bold text-black outline-none focus:ring-2 focus:ring-black/15"
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-[10px] bg-[#d0d0d0] px-4 py-3 font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.06em] text-black"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createPlaylist}
                  disabled={!name.trim()}
                  className="rounded-[10px] bg-black px-4 py-3 font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.06em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
