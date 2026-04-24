import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Disc3,
  Heart,
  History,
  Music2,
  Radio,
  RefreshCw,
  Settings,
  Share2,
  Tags,
  UserRound,
} from "lucide-react";

import { apiGetMusicWeb, type MusicWebNode, type MusicWebResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type PointNode = MusicWebNode & {
  x: number;
  y: number;
};

const nodeColors: Record<MusicWebNode["type"], string> = {
  user: "#111111",
  track: "#0f9f9a",
  artist: "#4f46e5",
  genre: "#d79a12",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "O") + (parts[1]?.[0] ?? "T");
}

function orbit(count: number, index: number, radiusX: number, radiusY: number, start = -90) {
  const step = 360 / Math.max(1, count);
  const angle = ((start + index * step) * Math.PI) / 180;
  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
  };
}

function layoutPreview(nodes: MusicWebNode[]): PointNode[] {
  const user = nodes.find((node) => node.type === "user");
  const tracks = nodes.filter((node) => node.type === "track").slice(0, 8);
  const artists = nodes.filter((node) => node.type === "artist").slice(0, 5);
  const genres = nodes.filter((node) => node.type === "genre").slice(0, 5);

  const positioned: PointNode[] = [];
  if (user) positioned.push({ ...user, x: 50, y: 50 });
  tracks.forEach((node, index) => positioned.push({ ...node, ...orbit(tracks.length, index, 25, 24) }));
  artists.forEach((node, index) => {
    const point = orbit(artists.length, index, 39, 34, -160);
    positioned.push({ ...node, x: Math.min(point.x, 34), y: point.y });
  });
  genres.forEach((node, index) => {
    const point = orbit(genres.length, index, 39, 34, -20);
    positioned.push({ ...node, x: Math.max(point.x, 66), y: point.y });
  });
  return positioned;
}

function nodeSize(type: MusicWebNode["type"], weight?: number) {
  const score = Math.max(1, Number(weight || 1));
  if (type === "user") return 50;
  if (type === "track") return Math.min(42, 28 + score);
  return Math.min(38, 24 + score);
}

function fallbackCover(label: string, subtitle?: string) {
  return `https://placehold.co/240x240/f4f1e8/111111?text=${encodeURIComponent(`${label} ${subtitle ?? ""}`.trim() || "Track")}`;
}

function GraphPreview({ data }: { data: MusicWebResponse | null }) {
  const nodes = useMemo(() => layoutPreview(data?.nodes ?? []), [data]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const edges = useMemo(
    () => (data?.edges ?? []).filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target)).slice(0, 28),
    [data, nodeMap]
  );

  if (!data?.hasData) {
    return (
      <div className="grid h-full min-h-[280px] place-items-center rounded-lg border border-dashed border-black/20 bg-[#f8f7f2] px-6 text-center">
        <div>
          <Music2 className="mx-auto h-8 w-8 text-black/55" />
          <p className="mt-3 text-sm font-semibold text-black">No listening history yet</p>
          <Link
            to="/recommendations"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            <Disc3 className="h-4 w-4" />
            Find music
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[360px] overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f2]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {edges.map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={edge.id}
              x1={`${source.x}%`}
              y1={`${source.y}%`}
              x2={`${target.x}%`}
              y2={`${target.y}%`}
              stroke="#111111"
              strokeOpacity={Math.max(0.12, Math.min(0.5, Number(edge.weight || 1) / 10))}
              strokeWidth={Math.max(1, Math.min(4, Number(edge.weight || 1)))}
            />
          );
        })}
      </svg>
      {nodes.map((node) => {
        const size = nodeSize(node.type, node.weight);
        return (
          <div
            key={node.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${node.x}%`, top: `${node.y}%`, width: 104 }}
            title={[node.label, node.subtitle].filter(Boolean).join(" - ")}
          >
            <div
              className="grid place-items-center overflow-hidden rounded-full border-[3px] border-white text-white shadow-md"
              style={{ width: size, height: size, backgroundColor: nodeColors[node.type] }}
            >
              {node.imageUrl && node.type === "track" ? (
                <img src={node.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : node.type === "artist" ? (
                <Radio className="h-4 w-4" />
              ) : node.type === "genre" ? (
                <Tags className="h-4 w-4" />
              ) : node.type === "track" ? (
                <Music2 className="h-4 w-4" />
              ) : (
                <UserRound className="h-4 w-4" />
              )}
            </div>
            <span className="max-w-[104px] truncate rounded bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-black shadow-sm">
              {node.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<MusicWebResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMusicWeb() {
    setLoading(true);
    setError("");
    try {
      setData(await apiGetMusicWeb(120));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load listening history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMusicWeb();
  }, []);

  const displayName = user?.name?.trim() || (user?.email ? user.email.split("@")[0] : "Listener");
  const handle = user?.email ? `@${user.email.split("@")[0]}` : "@offtrack";
  const tracks = useMemo(() => (data?.nodes ?? []).filter((node) => node.type === "track").slice(0, 6), [data]);
  const recentEvents = useMemo(() => {
    return [...(data?.nodes ?? [])]
      .filter((node) => node.type === "track" && node.lastEvent)
      .sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")))
      .slice(0, 5);
  }, [data]);
  const topArtists = data?.stats?.topArtists ?? [];
  const topGenres = data?.stats?.topGenres ?? [];

  return (
    <div className="min-h-screen w-full bg-white pb-36 text-black">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-md text-black transition-colors hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="grid h-10 w-10 place-items-center rounded-md border border-black/10 bg-white transition hover:bg-black/5"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={() => void loadMusicWeb()}
              disabled={loading}
              className="grid h-10 w-10 place-items-center rounded-md border border-black/10 bg-white transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-60"
              aria-label="Refresh profile"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.25fr)]">
          <div className="rounded-lg bg-[#efebe1] p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full bg-black text-3xl font-bold text-white sm:h-36 sm:w-36">
                {initials(displayName)}
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-black/60">
                  <UserRound className="h-3.5 w-3.5" />
                  {user?.account_type === "artist" ? "Artist account" : "Listener profile"}
                </div>
                <h1 className="mt-4 truncate text-4xl font-bold leading-none sm:text-5xl">{displayName}</h1>
                <p className="mt-2 truncate text-lg font-semibold text-black/60">{handle}</p>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-2xl font-bold">{data?.stats?.interactionCount ?? 0}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/50">Signals</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data?.stats?.trackCount ?? 0}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/50">Tracks</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{topArtists.length}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/50">Artists</p>
                  </div>
                </div>
              </div>
            </div>
            {!user && !authLoading ? (
              <Link
                to="/login"
                className="mt-5 inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
              >
                Log in
              </Link>
            ) : null}
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Listening graph</h2>
                <p className="text-sm font-medium text-black/55">Tracks, artists, and genres from your history</p>
              </div>
              <Link
                to="/web"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
              >
                <Share2 className="h-4 w-4" />
                Open
              </Link>
            </div>
            {loading ? (
              <div className="grid h-[360px] place-items-center rounded-lg bg-[#f8f7f2] text-sm font-semibold text-black/55">
                Loading
              </div>
            ) : (
              <GraphPreview data={data} />
            )}
            {error ? <p className="mt-3 text-sm font-semibold text-[#9f2f26]">{error}</p> : null}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Top tracks from you</h2>
              <Link to="/web" className="inline-flex items-center gap-1 text-sm font-bold text-black/60 hover:text-black">
                Graph
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {tracks.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {tracks.map((track) => (
                  <article key={track.id} className="min-w-0">
                    <div className="aspect-square overflow-hidden rounded-md bg-[#efebe1]">
                      <img
                        src={track.imageUrl || fallbackCover(track.label, track.subtitle)}
                        alt={track.label}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="mt-2 truncate text-sm font-bold">{track.label}</p>
                    {track.subtitle ? <p className="truncate text-xs font-medium text-black/50">{track.subtitle}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid min-h-[160px] place-items-center rounded-lg bg-[#f8f7f2] text-sm font-semibold text-black/55">
                No tracks yet
              </div>
            )}
          </div>

          <div className="grid gap-5">
            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Radio className="h-5 w-5 text-[#4f46e5]" />
                <h2 className="text-lg font-bold">Artists</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {topArtists.length ? (
                  topArtists.map((artist) => (
                    <span key={artist.name} className="rounded-md bg-[#eef2ff] px-3 py-2 text-sm font-semibold text-[#3730a3]">
                      {artist.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-medium text-black/50">None yet</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Tags className="h-5 w-5 text-[#d79a12]" />
                <h2 className="text-lg font-bold">Genres</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {topGenres.length ? (
                  topGenres.map((genre) => (
                    <span key={genre.name} className="rounded-md bg-[#fff7ed] px-3 py-2 text-sm font-semibold text-[#9a5b00]">
                      {genre.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-medium text-black/50">None yet</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-black/10 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5" />
            <h2 className="text-xl font-bold">Recent listening</h2>
          </div>
          {recentEvents.length ? (
            <div className="divide-y divide-black/10">
              {recentEvents.map((track) => (
                <div key={`${track.id}-${track.lastSeenAt ?? ""}`} className="flex items-center gap-3 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-[#efebe1]">
                    {track.imageUrl ? (
                      <img src={track.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Heart className="h-4 w-4 text-black/55" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{track.label}</p>
                    <p className="truncate text-xs font-medium text-black/50">{track.subtitle || track.lastEvent}</p>
                  </div>
                  <span className="rounded-md bg-[#f1f5f9] px-2 py-1 text-xs font-bold text-black/60">{track.lastEvent}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[110px] place-items-center rounded-lg bg-[#f8f7f2] text-sm font-semibold text-black/55">
              No recent activity
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
