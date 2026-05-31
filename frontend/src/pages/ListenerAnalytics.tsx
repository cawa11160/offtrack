import { useEffect, useMemo, useState } from "react";
import { BarChart3, ExternalLink, Heart, Loader2, MousePointerClick, Music2, PauseCircle, Radio, UploadCloud, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiGetArtistDashboard, type ArtistDashboard, type UploadedTrackItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ProfileHubNav } from "@/components/profile/ProfileHubNav";

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatDate(value?: string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity yet";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function pct(value?: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function scoreTone(value?: number) {
  const n = Number(value || 0);
  if (n >= 72) return "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]";
  if (n >= 52) return "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]";
  if (n >= 35) return "bg-[#fffbeb] text-[#92400e] border-[#fde68a]";
  return "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]";
}

function topEvents(track: UploadedTrackItem) {
  const events = Object.entries(track.metrics?.eventCounts ?? {}).sort((a, b) => b[1] - a[1]);
  return events.slice(0, 3);
}

function conversionLabel(key: string) {
  const labels: Record<string, string> = {
      spotify: "Spotify",
      website: "Website",
      merch: "Merch",
      tickets: "Tickets",
      emailSignup: "Email signup",
      support: "Support",
      artistProfile: "Artist profile",
      follow: "Follow",
      share: "Share",
    };
  return labels[key] || key.replace(/_/g, " ");
}

export default function ListenerAnalytics() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [dashboard, setDashboard] = useState<ArtistDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isArtist = user?.account_type === "artist";
  const summary = dashboard?.summary;
  const rankedTracks = useMemo(() => {
    return [...(dashboard?.tracks ?? [])].sort((a, b) => {
      const aq = a.metrics?.qualifiedListeners ?? 0;
      const bq = b.metrics?.qualifiedListeners ?? 0;
      const ap = a.metrics?.eventCounts?.play ?? 0;
      const bp = b.metrics?.eventCounts?.play ?? 0;
      return bq - aq || bp - ap || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
    });
  }, [dashboard?.tracks]);

  useEffect(() => {
    if (authLoading) return;
    if (!isArtist) return;
    let mounted = true;
    setLoading(true);
    setError("");
    apiGetArtistDashboard()
      .then((data) => {
        if (mounted) setDashboard(data);
      })
      .catch((e: unknown) => {
        if (mounted) setError(getErrorMessage(e, "Failed to load artist analytics"));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authLoading, isArtist]);

  if (!authLoading && !isArtist) {
    return (
      <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-white pb-44">
        <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
          <ProfileHubNav active="dashboard" />
          <div className="mt-6 rounded-lg border border-black/10 bg-[#f8f7f2] p-6">
            <p className="text-sm font-bold uppercase text-black/50">Artist analytics</p>
            <h1 className="mt-2 text-3xl font-bold text-black">Artist account required</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-black/60">
              Analytics are built around musician-owned uploads, listener discovery, and conversion actions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate("/signup")} className="rounded-md bg-black px-4 py-2 text-sm font-bold text-white">
                Create artist account
              </button>
              <button type="button" onClick={() => navigate("/profile")} className="rounded-md border border-black/10 px-4 py-2 text-sm font-bold">
                Open profile
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-white pb-44 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <ProfileHubNav active="dashboard" />

        <div className="mt-6 flex flex-col gap-4 border-b border-black/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-black/45">Profile hub</p>
            <h1 className="mt-2 text-4xl font-bold leading-none sm:text-5xl">Musician dashboard</h1>
            <p className="mt-3 max-w-3xl text-base font-semibold text-black/55">
              Track the listener actions that prove discovery is turning into musician value.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate("/profile/uploads")} className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-bold text-white">
              <UploadCloud className="h-4 w-4" />
              Upload
            </button>
            <button type="button" onClick={() => navigate("/recommendations")} className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 px-4 text-sm font-bold hover:bg-black/5">
              <Radio className="h-4 w-4" />
              Test discovery
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-black/55">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading artist metrics
          </div>
        ) : null}

        {error ? <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2 2xl:grid-cols-6">
          <div className="min-w-0 rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-black/55">
              <Music2 className="h-4 w-4" />
              Published tracks
            </div>
            <p className="mt-3 text-3xl font-bold">{formatNumber(summary?.publishedTracks)}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-black/55">
              <Users className="h-4 w-4" />
              Unique listeners
            </div>
            <p className="mt-3 text-3xl font-bold">{formatNumber(summary?.uniqueListeners)}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-black/55">
              <Heart className="h-4 w-4" />
              Qualified connections
            </div>
            <p className="mt-3 text-3xl font-bold">{formatNumber(summary?.qualifiedConnections)}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-black/55">
              <MousePointerClick className="h-4 w-4" />
              Conversion clicks
            </div>
            <p className="mt-3 text-3xl font-bold">{formatNumber(summary?.conversionClicks)}</p>
          </div>
          <div className={`min-w-0 rounded-lg border p-4 ${scoreTone(summary?.averageDiscoveryScore)}`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              <BarChart3 className="h-4 w-4" />
              Discovery score
            </div>
            <p className="mt-3 text-3xl font-bold">{formatNumber(summary?.averageDiscoveryScore)}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-black/55">
              <PauseCircle className="h-4 w-4" />
              Paused discovery
            </div>
            <p className="mt-3 text-3xl font-bold">{formatNumber(summary?.discoveryPausedTracks)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Track performance</h2>
              <span className="text-sm font-semibold text-black/45">{formatNumber(summary?.totalInteractions)} total actions</span>
            </div>
            <div className="mt-3 grid gap-3">
              {rankedTracks.length ? (
                rankedTracks.map((track) => {
                  const events = topEvents(track);
                  return (
                    <article key={track.id} className="min-w-0 rounded-lg border border-black/10 bg-white p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-lg font-bold">{track.title}</p>
                          <p className="mt-1 truncate text-sm font-semibold text-black/50">{track.artist || dashboard?.artist.name || "Artist upload"}</p>
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-2 text-xs font-bold text-black/55">
                          <span className="rounded bg-[#f1f5f9] px-2 py-1">{formatNumber(track.metrics?.uniqueListeners)} listeners</span>
                          <span className="rounded bg-[#ecfeff] px-2 py-1">{formatNumber(track.metrics?.qualifiedListeners)} qualified</span>
                          <span className="rounded bg-[#f8f7f2] px-2 py-1">{track.isPublished === false ? "Hidden" : "Published"}</span>
                          {track.discoveryPaused ? <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">Discovery paused</span> : null}
                          <span className={`rounded border px-2 py-1 ${scoreTone(track.metrics?.discoveryScore?.value)}`}>
                            Score {formatNumber(track.metrics?.discoveryScore?.value)} - {track.metrics?.discoveryScore?.label || "New"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <div className="flex min-w-0 flex-wrap gap-2">
                          {events.length ? (
                            events.map(([event, count]) => (
                              <span key={`${track.id}-${event}`} className="rounded-md border border-black/10 px-3 py-2 text-sm font-semibold">
                                {event}: {formatNumber(count)}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm font-semibold text-black/45">No listener actions yet</span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-black/45">{formatDate(track.metrics?.lastInteractionAt)}</div>
                      </div>
                      {track.metrics?.discoveryScore ? (
                        <div className="mt-4 rounded-md bg-[#f8f7f2] p-3">
                          <p className="text-sm font-bold text-black">{track.metrics.discoveryScore.nextAction}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-black/55">
                            <span>Completion {pct(track.metrics.discoveryScore.rates.completion)}</span>
                            <span>Save {pct(track.metrics.discoveryScore.rates.save)}</span>
                            <span>Conversion {pct(track.metrics.discoveryScore.rates.conversion)}</span>
                            <span>Skip {pct(track.metrics.discoveryScore.rates.skip)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {track.metrics.discoveryScore.reasons.map((reason) => (
                              <span key={`${track.id}-${reason}`} className="rounded bg-white px-2 py-1 text-xs font-semibold text-black/55">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {Object.entries(track.metrics?.conversionBreakdown ?? {}).length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(track.metrics?.conversionBreakdown ?? {})
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, count]) => (
                              <span key={`${track.id}-conversion-${key}`} className="rounded-md border border-black/10 px-3 py-2 text-sm font-semibold">
                                {conversionLabel(key)}: {formatNumber(count)}
                              </span>
                            ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-black/20 bg-[#f8f7f2] p-6">
                  <p className="text-lg font-bold">No musician uploads yet</p>
                  <p className="mt-1 text-sm font-semibold text-black/55">Upload a track to start measuring listener discovery.</p>
                  <button type="button" onClick={() => navigate("/profile/uploads")} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-bold text-white">
                    Upload first track
                  </button>
                </div>
              )}
            </div>
          </section>

          <aside className="grid min-w-0 content-start gap-5">
            <section className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-5 w-5 text-black/55" />
                <h2 className="text-xl font-bold">Conversion paths</h2>
              </div>
              <div className="mt-3 grid gap-2">
                {Object.entries(summary?.conversionBreakdown ?? {}).length ? (
                  Object.entries(summary?.conversionBreakdown ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, count]) => (
                      <div key={key} className="flex items-center justify-between gap-3 rounded-md bg-[#f8f7f2] px-3 py-2 text-sm font-semibold">
                        <span className="truncate">{conversionLabel(key)}</span>
                        <span>{formatNumber(count)}</span>
                      </div>
                    ))
                ) : (
                  <p className="rounded-md bg-[#f8f7f2] p-3 text-sm font-semibold text-black/45">No conversion clicks yet</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-black/55" />
                <h2 className="text-xl font-bold">Discovery sources</h2>
              </div>
              <div className="mt-3 grid gap-2">
                {Object.entries(dashboard?.sourceCounts ?? {}).length ? (
                  Object.entries(dashboard?.sourceCounts ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([source, count]) => (
                      <div key={source} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm font-semibold">
                        <span className="truncate">{source}</span>
                        <span>{formatNumber(count)}</span>
                      </div>
                    ))
                ) : (
                  <p className="rounded-md bg-white p-3 text-sm font-semibold text-black/45">No source data yet</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-black/55" />
                <h2 className="text-xl font-bold">Recent activity</h2>
              </div>
              <div className="mt-3 grid gap-2">
                {(dashboard?.recentInteractions ?? []).length ? (
                  dashboard?.recentInteractions.slice(0, 8).map((row) => (
                    <div key={row.id} className="rounded-md bg-[#f8f7f2] p-3">
                      <p className="truncate text-sm font-bold">{row.trackTitle}</p>
                      <p className="mt-1 text-xs font-semibold text-black/50">
                        {row.event} by {row.listenerKey}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md bg-[#f8f7f2] p-3 text-sm font-semibold text-black/45">No listener activity yet</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
