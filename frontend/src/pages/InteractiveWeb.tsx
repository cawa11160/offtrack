import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CircleDot,
  Disc3,
  Eye,
  Layers3,
  Music2,
  Radio,
  RefreshCw,
  Search,
  Tags,
  UserRound,
  X,
} from "lucide-react";

import { apiGetMusicWeb, type MusicWebEdge, type MusicWebNode, type MusicWebResponse } from "@/lib/api";

type PositionedNode = MusicWebNode & {
  x: number;
  y: number;
};

type RelationFilter = "all" | "listening" | "taste" | "catalog";

const nodeColors: Record<MusicWebNode["type"], string> = {
  user: "#111111",
  track: "#0f9f9a",
  artist: "#4f46e5",
  genre: "#d79a12",
};

const nodeLabels: Record<MusicWebNode["type"], string> = {
  user: "Profile",
  track: "Tracks",
  artist: "Artists",
  genre: "Genres",
};

const nodeIcons: Record<MusicWebNode["type"], typeof UserRound> = {
  user: UserRound,
  track: Music2,
  artist: Radio,
  genre: Tags,
};

const relationLabels: Array<{ id: RelationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "listening", label: "Listening" },
  { id: "taste", label: "Taste" },
  { id: "catalog", label: "Catalog" },
];

function orbit(count: number, index: number, radiusX: number, radiusY: number, start = -90) {
  const step = 360 / Math.max(1, count);
  const angle = ((start + index * step) * Math.PI) / 180;
  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
  };
}

function relationFamily(relation: string): RelationFilter {
  const key = relation.toLowerCase();
  if (key === "taste") return "taste";
  if (key === "artist" || key === "genre") return "catalog";
  return "listening";
}

function edgeColor(edge: MusicWebEdge) {
  const family = relationFamily(edge.relation);
  if (family === "taste") return "#e85d4f";
  if (family === "catalog") return edge.relation === "genre" ? "#d79a12" : "#4f46e5";
  if (edge.relation === "dislike" || edge.relation === "skip") return "#9f2f26";
  return "#0f9f9a";
}

function edgeOpacity(edge: MusicWebEdge) {
  return Math.max(0.16, Math.min(0.78, 0.14 + Math.abs(Number(edge.weight || 1)) / 12));
}

function nodeSize(node: MusicWebNode, selected: boolean) {
  const weight = Math.max(1, Math.abs(Number(node.weight || 1)));
  const boost = selected ? 10 : 0;
  if (node.type === "user") return 74 + boost;
  if (node.type === "track") return Math.min(76, 44 + weight * 2) + boost;
  return Math.min(64, 36 + weight * 2) + boost;
}

function connectedIds(edges: MusicWebEdge[], nodeId: string) {
  const ids = new Set<string>();
  edges.forEach((edge) => {
    if (edge.source === nodeId) ids.add(edge.target);
    if (edge.target === nodeId) ids.add(edge.source);
  });
  return ids;
}

function layoutNodes(nodes: MusicWebNode[], edges: MusicWebEdge[], selectedNodeId: string | null): PositionedNode[] {
  if (selectedNodeId && nodes.some((node) => node.id === selectedNodeId)) {
    const neighborIds = connectedIds(edges, selectedNodeId);
    const selected = nodes.find((node) => node.id === selectedNodeId);
    const neighbors = nodes.filter((node) => neighborIds.has(node.id) && node.id !== selectedNodeId);
    const rest = nodes.filter((node) => node.id !== selectedNodeId && !neighborIds.has(node.id));
    const positioned: PositionedNode[] = [];

    if (selected) positioned.push({ ...selected, x: 50, y: 50 });
    neighbors.slice(0, 22).forEach((node, index) => {
      positioned.push({ ...node, ...orbit(Math.min(neighbors.length, 22), index, 30, 27, -90) });
    });
    rest.slice(0, 34).forEach((node, index) => {
      positioned.push({ ...node, ...orbit(Math.min(rest.length, 34), index, 43, 38, -105) });
    });
    return positioned;
  }

  const user = nodes.filter((node) => node.type === "user");
  const tracks = nodes.filter((node) => node.type === "track");
  const artists = nodes.filter((node) => node.type === "artist");
  const genres = nodes.filter((node) => node.type === "genre");

  const positioned: PositionedNode[] = [];
  user.forEach((node) => positioned.push({ ...node, x: 50, y: 50 }));
  tracks.slice(0, 28).forEach((node, index) => {
    positioned.push({ ...node, ...orbit(Math.min(tracks.length, 28), index, 30, 27, -92) });
  });
  artists.slice(0, 18).forEach((node, index) => {
    const point = orbit(Math.min(artists.length, 18), index, 44, 36, -160);
    positioned.push({ ...node, x: Math.min(point.x, 36), y: point.y });
  });
  genres.slice(0, 18).forEach((node, index) => {
    const point = orbit(Math.min(genres.length, 18), index, 44, 36, -20);
    positioned.push({ ...node, x: Math.max(point.x, 64), y: point.y });
  });
  return positioned;
}

function formatEventName(name: string) {
  return name.replace(/_/g, " ");
}

function nodeMatches(node: MusicWebNode, query: string) {
  if (!query) return true;
  const haystack = [node.label, node.subtitle, node.source, node.lastEvent].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function byNodeImportance(a: MusicWebNode, b: MusicWebNode) {
  if (a.type === "user") return -1;
  if (b.type === "user") return 1;
  return Number(b.weight || 0) - Number(a.weight || 0);
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Activity }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-black/55">{label}</p>
        <Icon className="h-5 w-5 text-black/45" />
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

export default function InteractiveWeb() {
  const [data, setData] = useState<MusicWebResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [relationFilter, setRelationFilter] = useState<RelationFilter>("all");
  const [density, setDensity] = useState(84);
  const [enabledTypes, setEnabledTypes] = useState<Record<MusicWebNode["type"], boolean>>({
    user: true,
    track: true,
    artist: true,
    genre: true,
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiGetMusicWeb(260));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile web");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const allNodes = useMemo(() => data?.nodes ?? [], [data?.nodes]);
  const allEdges = useMemo(() => data?.edges ?? [], [data?.edges]);

  const relationEdges = useMemo(() => {
    if (relationFilter === "all") return allEdges;
    return allEdges.filter((edge) => relationFamily(edge.relation) === relationFilter);
  }, [allEdges, relationFilter]);

  const filteredNodes = useMemo(() => {
    const selectedConnected = selectedNodeId ? connectedIds(relationEdges, selectedNodeId) : null;
    return allNodes
      .filter((node) => enabledTypes[node.type])
      .filter((node) => nodeMatches(node, query.trim()))
      .filter((node) => {
        if (!selectedNodeId || !selectedConnected) return true;
        return node.id === selectedNodeId || selectedConnected.has(node.id);
      })
      .sort(byNodeImportance)
      .slice(0, density);
  }, [allNodes, density, enabledTypes, query, relationEdges, selectedNodeId]);

  const nodes = useMemo(() => layoutNodes(filteredNodes, relationEdges, selectedNodeId), [filteredNodes, relationEdges, selectedNodeId]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const visibleEdges = useMemo(
    () => relationEdges.filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target)).slice(0, 180),
    [relationEdges, nodeMap]
  );
  const selectedNode = useMemo(
    () => (selectedNodeId ? allNodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [allNodes, selectedNodeId]
  );
  const selectedEdges = useMemo(
    () => (selectedNodeId ? allEdges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId) : []),
    [allEdges, selectedNodeId]
  );
  const selectedNeighbors = useMemo(() => {
    if (!selectedNodeId) return [];
    const ids = connectedIds(allEdges, selectedNodeId);
    return allNodes.filter((node) => ids.has(node.id)).sort(byNodeImportance).slice(0, 10);
  }, [allEdges, allNodes, selectedNodeId]);

  const topArtists = data?.stats?.topArtists ?? [];
  const topGenres = data?.stats?.topGenres ?? [];
  const eventEntries = Object.entries(data?.stats?.events ?? {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  const maxEventCount = Math.max(1, ...eventEntries.map(([, count]) => Number(count)));

  function toggleType(type: MusicWebNode["type"]) {
    setEnabledTypes((prev) => ({ ...prev, [type]: !prev[type] }));
    if (selectedNode?.type === type) setSelectedNodeId(null);
  }

  return (
    <div className="w-full bg-[#f8f7f2] text-[#171717]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4f46e5]">Interactive Web</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Listening graph</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-black/5"
            >
              <UserRound className="h-4 w-4" />
              Profile
            </Link>
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
        </div>

        {error ? (
          <div className="rounded-md border border-[#e85d4f]/30 bg-white px-4 py-3 text-sm font-semibold text-[#9f2f26]">{error}</div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Signals" value={data?.stats?.interactionCount ?? 0} icon={Activity} />
          <MetricCard label="Tracks" value={data?.stats?.trackCount ?? 0} icon={Music2} />
          <MetricCard label="Visible nodes" value={nodes.length} icon={CircleDot} />
          <MetricCard label="Visible links" value={visibleEdges.length} icon={Layers3} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-black/10 bg-white p-4">
              <label className="text-sm font-semibold text-black/60" htmlFor="graph-search">
                Search
              </label>
              <div className="mt-2 flex h-11 items-center gap-2 rounded-md border border-black/10 bg-[#f8f7f2] px-3">
                <Search className="h-4 w-4 text-black/45" />
                <input
                  id="graph-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-black/35"
                  placeholder="Track, artist, genre"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/5" aria-label="Clear search">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm font-semibold text-black/60">Nodes</p>
              <div className="mt-3 grid gap-2">
                {(Object.keys(nodeLabels) as Array<MusicWebNode["type"]>).map((type) => {
                  const Icon = nodeIcons[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      className={`flex h-10 items-center justify-between rounded-md border px-3 text-sm font-semibold transition ${
                        enabledTypes[type] ? "border-black/10 bg-[#f8f7f2] text-black" : "border-black/5 bg-white text-black/35"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: nodeColors[type] }} />
                        {nodeLabels[type]}
                      </span>
                      <span>{allNodes.filter((node) => node.type === type).length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm font-semibold text-black/60">Links</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {relationLabels.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRelationFilter(item.id)}
                    className={`h-10 rounded-md px-3 text-sm font-semibold transition ${
                      relationFilter === item.id ? "bg-black text-white" : "border border-black/10 bg-white text-black hover:bg-black/5"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-black/60" htmlFor="graph-density">
                  Density
                </label>
                <span className="text-sm font-bold">{density}</span>
              </div>
              <input
                id="graph-density"
                type="range"
                min={24}
                max={120}
                step={6}
                value={density}
                onChange={(event) => setDensity(Number(event.target.value))}
                className="mt-4 w-full accent-black"
              />
            </div>
          </aside>

          <section className="relative min-h-[680px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
            {loading ? (
              <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-black/60">Loading</div>
            ) : !data?.hasData ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div>
                  <p className="text-lg font-semibold">No listening signals yet</p>
                  <Link
                    to="/recommendations"
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[#0f9f9a] px-4 text-sm font-semibold text-white transition hover:bg-[#0b7d7a]"
                  >
                    <Disc3 className="h-4 w-4" />
                    Find music
                  </Link>
                </div>
              </div>
            ) : nodes.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div>
                  <p className="text-lg font-semibold">No matches</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setRelationFilter("all");
                      setSelectedNodeId(null);
                      setEnabledTypes({ user: true, track: true, artist: true, genre: true });
                    }}
                    className="mt-4 inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
                  >
                    Reset
                  </button>
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
                        stroke={edgeColor(edge)}
                        strokeOpacity={edgeOpacity(edge)}
                        strokeWidth={Math.max(1, Math.min(5, Math.abs(Number(edge.weight || 1))))}
                      />
                    );
                  })}
                </svg>

                {nodes.map((node) => {
                  const Icon = nodeIcons[node.type];
                  const selected = selectedNodeId === node.id;
                  const size = nodeSize(node, selected);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(selected ? null : node.id)}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none"
                      style={{ left: `${node.x}%`, top: `${node.y}%`, width: 142 }}
                      title={[node.label, node.subtitle, node.lastEvent].filter(Boolean).join(" - ")}
                    >
                      <span
                        className={`grid place-items-center overflow-hidden rounded-full border-4 text-white shadow-lg transition ${
                          selected ? "border-black ring-4 ring-black/10" : "border-white"
                        }`}
                        style={{ width: size, height: size, backgroundColor: nodeColors[node.type] }}
                      >
                        {node.imageUrl && node.type === "track" ? (
                          <img src={node.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon className="h-6 w-6" />
                        )}
                      </span>
                      <span className="max-w-[142px] rounded bg-white/95 px-2 py-1 text-center shadow-sm">
                        <span className="block truncate text-xs font-semibold">{node.label}</span>
                        {node.subtitle ? <span className="block truncate text-[11px] font-medium text-black/55">{node.subtitle}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-black/60">Selection</p>
                {selectedNode ? (
                  <button type="button" onClick={() => setSelectedNodeId(null)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-black/5" aria-label="Clear selection">
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <Eye className="h-4 w-4 text-black/40" />
                )}
              </div>

              {selectedNode ? (
                <div className="mt-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full text-white" style={{ backgroundColor: nodeColors[selectedNode.type] }}>
                      {selectedNode.imageUrl && selectedNode.type === "track" ? (
                        <img src={selectedNode.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <CircleDot className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold">{selectedNode.label}</p>
                      <p className="truncate text-sm font-semibold text-black/50">{selectedNode.subtitle || nodeLabels[selectedNode.type]}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-[#f8f7f2] p-3">
                      <p className="text-xs font-semibold text-black/50">Weight</p>
                      <p className="mt-1 text-xl font-bold">{Number(selectedNode.weight || 0).toFixed(1)}</p>
                    </div>
                    <div className="rounded-md bg-[#f8f7f2] p-3">
                      <p className="text-xs font-semibold text-black/50">Links</p>
                      <p className="mt-1 text-xl font-bold">{selectedEdges.length}</p>
                    </div>
                  </div>
                  {selectedNode.lastEvent ? (
                    <div className="mt-3 rounded-md bg-[#f8f7f2] p-3">
                      <p className="text-xs font-semibold text-black/50">Last event</p>
                      <p className="mt-1 text-sm font-bold">{formatEventName(selectedNode.lastEvent)}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm font-medium text-black/50">Select a node</p>
              )}
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm font-semibold text-black/60">Connected</p>
              <div className="mt-3 space-y-2">
                {selectedNeighbors.length ? (
                  selectedNeighbors.map((node) => {
                    const Icon = nodeIcons[node.type];
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className="flex w-full items-center gap-3 rounded-md p-2 text-left transition hover:bg-black/5"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: nodeColors[node.type] }}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{node.label}</span>
                          <span className="block truncate text-xs font-semibold text-black/45">{node.subtitle || nodeLabels[node.type]}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm font-medium text-black/50">None selected</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm font-semibold text-black/60">Events</p>
              <div className="mt-3 space-y-3">
                {eventEntries.length ? (
                  eventEntries.slice(0, 8).map(([name, count]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                        <span>{formatEventName(name)}</span>
                        <span>{count}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#f1f5f9]">
                        <div className="h-full rounded-full bg-[#0f9f9a]" style={{ width: `${(Number(count) / maxEventCount) * 100}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm font-medium text-black/50">No events</p>
                )}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-sm font-semibold text-black/60">Artists</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {topArtists.length ? (
                topArtists.map((artist) => (
                  <button
                    key={artist.name}
                    type="button"
                    onClick={() => setQuery(artist.name)}
                    className="rounded-md bg-[#eef2ff] px-3 py-2 text-sm font-semibold text-[#3730a3] transition hover:bg-[#dfe7ff]"
                  >
                    {artist.name}
                  </button>
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
                  <button
                    key={genre.name}
                    type="button"
                    onClick={() => setQuery(genre.name)}
                    className="rounded-md bg-[#fff7ed] px-3 py-2 text-sm font-semibold text-[#9a5b00] transition hover:bg-[#ffedd5]"
                  >
                    {genre.name}
                  </button>
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
