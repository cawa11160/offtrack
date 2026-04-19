import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Music2, RefreshCw, Radio, Tags, UserRound } from "lucide-react";

import { apiGetMusicWeb, type MusicWebEdge, type MusicWebNode, type MusicWebResponse } from "@/lib/api";

type PositionedNode = MusicWebNode & {
  x: number;
  y: number;
};

const nodeColors: Record<MusicWebNode["type"], string> = {
  user: "#e85d4f",
  track: "#0f9f9a",
  artist: "#4f46e5",
  genre: "#d79a12",
};

const nodeIcons: Record<MusicWebNode["type"], typeof UserRound> = {
  user: UserRound,
  track: Music2,
  artist: Radio,
  genre: Tags,
};

function orbit(count: number, index: number, radiusX: number, radiusY: number, start = -90) {
  const step = 360 / Math.max(1, count);
  const angle = ((start + index * step) * Math.PI) / 180;
  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
  };
}

function layoutNodes(nodes: MusicWebNode[]): PositionedNode[] {
  const user = nodes.filter((node) => node.type === "user");
  const tracks = nodes.filter((node) => node.type === "track");
  const artists = nodes.filter((node) => node.type === "artist");
  const genres = nodes.filter((node) => node.type === "genre");

  const positioned: PositionedNode[] = [];
  user.forEach((node) => positioned.push({ ...node, x: 50, y: 50 }));
  tracks.slice(0, 18).forEach((node, index) => {
    const point = orbit(Math.min(tracks.length, 18), index, 32, 28, -92);
    positioned.push({ ...node, ...point });
  });
  artists.slice(0, 10).forEach((node, index) => {
    const point = orbit(Math.min(artists.length, 10), index, 44, 36, -160);
    positioned.push({ ...node, x: Math.min(point.x, 38), y: point.y });
  });
  genres.slice(0, 10).forEach((node, index) => {
    const point = orbit(Math.min(genres.length, 10), index, 44, 36, -20);
    positioned.push({ ...node, x: Math.max(point.x, 62), y: point.y });
  });
  return positioned;
}

function nodeSize(node: MusicWebNode) {
  const weight = Math.max(1, Number(node.weight || 1));
  if (node.type === "user") return 76;
  if (node.type === "track") return Math.min(74, 46 + weight * 2);
  return Math.min(66, 40 + weight * 2);
}

function edgeOpacity(edge: MusicWebEdge) {
  return Math.max(0.18, Math.min(0.72, 0.16 + Number(edge.weight || 1) / 12));
}

export default function InteractiveWeb() {
  const [data, setData] = useState<MusicWebResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiGetMusicWeb(140));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile web");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const nodes = useMemo(() => layoutNodes(data?.nodes ?? []), [data]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const visibleEdges = useMemo(
    () => (data?.edges ?? []).filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target)).slice(0, 90),
    [data, nodeMap]
  );

  const topArtists = data?.stats?.topArtists ?? [];
  const topGenres = data?.stats?.topGenres ?? [];

  return (
    <div className="w-full bg-[#f8f7f2] text-[#171717]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4f46e5]">Interactive Web</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Listening graph</h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171717] px-4 text-sm font-semibold text-white transition hover:bg-[#333333] disabled:cursor-wait disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-md border border-[#e85d4f]/30 bg-white px-4 py-3 text-sm text-[#9f2f26]">{error}</div>
        ) : null}

        <section className="relative min-h-[620px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
          {loading ? (
            <div className="absolute inset-0 grid place-items-center text-sm font-medium text-black/60">Loading</div>
          ) : !data?.hasData ? (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <p className="text-lg font-semibold">No listening signals yet</p>
                <Link
                  to="/recommendations"
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[#0f9f9a] px-4 text-sm font-semibold text-white transition hover:bg-[#0b7d7a]"
                >
                  <Music2 className="h-4 w-4" />
                  Find music
                </Link>
              </div>
            </div>
          ) : (
            <>
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                {visibleEdges.map((edge) => {
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
                      stroke="#111827"
                      strokeOpacity={edgeOpacity(edge)}
                      strokeWidth={Math.max(1, Math.min(5, Number(edge.weight || 1)))}
                    />
                  );
                })}
              </svg>

              {nodes.map((node) => {
                const Icon = nodeIcons[node.type];
                const size = nodeSize(node);
                const color = nodeColors[node.type];
                return (
                  <div
                    key={node.id}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                    style={{ left: `${node.x}%`, top: `${node.y}%`, width: 132 }}
                    title={[node.label, node.subtitle, node.lastEvent].filter(Boolean).join(" - ")}
                  >
                    <div
                      className="grid place-items-center overflow-hidden rounded-full border-4 border-white text-white shadow-lg"
                      style={{ width: size, height: size, backgroundColor: color }}
                    >
                      {node.imageUrl && node.type === "track" ? (
                        <img src={node.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon className="h-6 w-6" />
                      )}
                    </div>
                    <div className="max-w-[132px] rounded bg-white/95 px-2 py-1 text-center shadow-sm">
                      <p className="truncate text-xs font-semibold">{node.label}</p>
                      {node.subtitle ? <p className="truncate text-[11px] text-black/55">{node.subtitle}</p> : null}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black/60">Signals</p>
            <p className="mt-2 text-3xl font-bold">{data?.stats?.interactionCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black/60">Tracks</p>
            <p className="mt-2 text-3xl font-bold">{data?.stats?.trackCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black/60">Events</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data?.stats?.events ?? {}).slice(0, 5).map(([name, count]) => (
                <span key={name} className="rounded-md bg-[#f1f5f9] px-2 py-1 text-xs font-semibold text-black/70">
                  {name} {count}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black/60">Artists</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {topArtists.length ? (
                topArtists.map((artist) => (
                  <span key={artist.name} className="rounded-md bg-[#eef2ff] px-3 py-2 text-sm font-semibold text-[#3730a3]">
                    {artist.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-black/50">None yet</span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black/60">Genres</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {topGenres.length ? (
                topGenres.map((genre) => (
                  <span key={genre.name} className="rounded-md bg-[#fff7ed] px-3 py-2 text-sm font-semibold text-[#9a5b00]">
                    {genre.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-black/50">None yet</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
