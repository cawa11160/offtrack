import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Play, Shuffle, Plus, Download, MoreHorizontal } from "lucide-react";
import ColorThief from "colorthief";
import { albums, featuredPlaylists } from "@/data/mockData";
import { cn } from "@/lib/utils";

type Track = {
  id: string;
  title: string;
  artist?: string;
  duration?: string; // "4:06"
  plays?: number;
};

type Release = {
  id: string | number;
  title: string;
  artist?: string;
  year?: number | string;
  coverUrl?: string;
  image?: string;
  type?: "Single" | "Album" | "Playlist";
  tracks?: Track[];
};

function formatPlays(n?: number) {
  if (n === undefined) return "";
  return n.toLocaleString();
}

function parseDurationToSeconds(d?: string) {
  if (!d) return 0;
  const parts = d.split(":").map((x) => Number(x));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function formatTotalDuration(tracks: Track[]) {
  const total = tracks.reduce((acc, t) => acc + parseDurationToSeconds(t.duration), 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return "";
  return `${m} min ${s.toString().padStart(2, "0")} sec`;
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function makeGradient(rgb: [number, number, number]) {
  // Slightly darken + enrich the dominant color for a Spotify-like feel
  const [r, g, b] = rgb;
  const r1 = clamp(Math.round(r * 0.85), 0, 255);
  const g1 = clamp(Math.round(g * 0.85), 0, 255);
  const b1 = clamp(Math.round(b * 0.85), 0, 255);

  const r2 = clamp(Math.round(r * 0.55), 0, 255);
  const g2 = clamp(Math.round(g * 0.55), 0, 255);
  const b2 = clamp(Math.round(b * 0.55), 0, 255);

  return `linear-gradient(90deg, rgb(${r1},${g1},${b1}) 0%, rgb(${r2},${g2},${b2}) 70%)`;
}

export default function ReleasePage() {
  const { id } = useParams();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dominant, setDominant] = useState<[number, number, number] | null>(null);

  const release: Release | undefined = useMemo(() => {
    const all = [...(albums as any[]), ...(featuredPlaylists as any[])] as Release[];
    return all.find((x) => String(x.id) === String(id));
  }, [id]);

  useEffect(() => {
    setDominant(null);
    if (!imgRef.current) return;

    const img = imgRef.current;
    const thief = new ColorThief();

    const extract = () => {
      try {
        // Will work if the image host supports CORS.
        const color = thief.getColor(img) as [number, number, number];
        setDominant(color);
      } catch {
        // If CORS blocks it, we just fall back to default gradient.
        setDominant(null);
      }
    };

    if (img.complete) extract();
    else img.onload = extract;
  }, [release?.id]);

  if (!release) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-bold">Not found</h1>
          <p className="text-muted-foreground mt-2">
            Couldn’t find this release. Check the ID in the URL.
          </p>
        </div>
      </div>
    );
  }

  const cover =
    (release as any).coverUrl ??
    (release as any).image ??
    "https://placehold.co/600x600/png";

  const tracks: Track[] =
    (release as any).tracks ??
    [
      {
        id: `${release.id}-t1`,
        title: release.title,
        artist: release.artist ?? "Unknown artist",
        duration: "4:06",
        plays: 16436998,
      },
    ];

  const totalDuration = formatTotalDuration(tracks);
  const releaseType = (release as any).type ?? (tracks.length === 1 ? "Single" : "Album");

  const gradient = dominant ? makeGradient(dominant) : "linear-gradient(90deg, #7a1d4a 0%, #2a0f1f 70%)";

  const handlePlayRelease = () => {
    console.log("Play release:", release.id);
  };

  const handlePlayTrack = (t: Track) => {
    console.log("Play track:", t.id);
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 transition-colors duration-500" style={{ background: gradient }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90" />

        <div className="relative px-6 lg:px-10 pt-10 pb-8">
          <div className="flex items-end gap-6">
            <img
              ref={imgRef}
              src={cover}
              crossOrigin="anonymous"
              alt={release.title}
              className="w-40 h-40 lg:w-56 lg:h-56 rounded-xl object-cover shadow-2xl"
            />

            <div className="pb-2">
              <div className="text-sm font-medium text-white/90">{releaseType}</div>

              <h1 className="mt-2 text-4xl lg:text-6xl font-black tracking-tight text-white">
                {release.title}
              </h1>

              <div className="mt-3 text-white/85 flex flex-wrap gap-2 items-center">
                {release.artist && <span className="font-semibold">{release.artist}</span>}
                {release.year && <span>• {release.year}</span>}
                <span>• {tracks.length} song{tracks.length !== 1 ? "s" : ""}</span>
                {totalDuration && <span>• {totalDuration}</span>}
              </div>
            </div>
          </div>

          {/* Controls row */}
          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                className="h-14 w-14 rounded-full bg-green-500 grid place-items-center hover:scale-105 transition-transform"
                onClick={handlePlayRelease}
                aria-label="Play"
              >
                <Play className="w-6 h-6 text-black" />
              </button>

              <button
                className="h-10 w-10 rounded-full border border-white/25 grid place-items-center hover:bg-white/10 transition-colors"
                onClick={() => console.log("Shuffle")}
                aria-label="Shuffle"
              >
                <Shuffle className="w-5 h-5 text-white/90" />
              </button>

              <button
                className="h-10 w-10 rounded-full border border-white/25 grid place-items-center hover:bg-white/10 transition-colors"
                onClick={() => console.log("Add")}
                aria-label="Add"
              >
                <Plus className="w-5 h-5 text-white/90" />
              </button>

              <button
                className="h-10 w-10 rounded-full border border-white/25 grid place-items-center hover:bg-white/10 transition-colors"
                onClick={() => console.log("Download")}
                aria-label="Download"
              >
                <Download className="w-5 h-5 text-white/90" />
              </button>

              <button
                className="h-10 w-10 rounded-full border border-white/25 grid place-items-center hover:bg-white/10 transition-colors"
                onClick={() => console.log("More")}
                aria-label="More"
              >
                <MoreHorizontal className="w-5 h-5 text-white/90" />
              </button>
            </div>

            <div className="text-white/70 text-sm hidden md:block">List</div>
          </div>
        </div>
      </section>

      {/* Tracklist */}
      <section className="px-6 lg:px-10 pb-10">
        <div className="mt-6 rounded-2xl border border-border bg-card/50">
          <div className="grid grid-cols-[40px_1fr_120px_70px] gap-4 px-5 py-4 text-sm text-muted-foreground border-b border-border">
            <div>#</div>
            <div>Title</div>
            <div className="text-right">Plays</div>
            <div className="text-right">Time</div>
          </div>

          <div className="divide-y divide-border">
            {tracks.map((t, idx) => (
              <button
                key={t.id}
                className={cn(
                  "w-full grid grid-cols-[40px_1fr_120px_70px] gap-4 px-5 py-4 text-left",
                  "hover:bg-accent transition-colors"
                )}
                onClick={() => handlePlayTrack(t)}
              >
                <div className="text-muted-foreground">{idx + 1}</div>
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {t.artist ?? release.artist ?? ""}
                  </div>
                </div>
                <div className="text-right text-muted-foreground">{formatPlays(t.plays)}</div>
                <div className="text-right text-muted-foreground">{t.duration ?? ""}</div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
