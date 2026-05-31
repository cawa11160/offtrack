import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Disc3,
  ExternalLink,
  Heart,
  Info,
  Loader2,
  MapPin,
  Music2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  ThumbsDown,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFeedback, apiRecommend, apiSearch, apiUrl, type ArtistConversionLinks, type MusicianRec, type RecItem, type SearchResult, type SeedSong } from "@/lib/api";
import { addAlreadyShownIds, getAlreadyShownIds } from "@/lib/analytics";
import { albums } from "@/data/mockData";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { usePlaybackMilestones } from "@/lib/playbackTracking";
import { phCapture } from "@/lib/posthog";
import { extractSpotifyTrackId, fetchSpotifyStatus, initSpotifyPlayer, playSpotifyTrack, type SpotifySession } from "@/lib/spotify";

type Rec = RecItem;
type FeedbackAction = "superlike" | "like" | "dislike";
type SeedSlot = 0 | 1 | 2;
type DiscoveryQueueItem = {
  id: string;
  title: string;
  artist: string;
  imageUrl?: string;
  reasons?: string[];
  savedAt: string;
};

const slotLabels = ["Seed 1", "Seed 2", "Seed 3"];
const DISCOVERY_QUEUE_KEY = "offtrack_discovery_queue";

function cleanArtist(v: string) {
  const s = (v || "").trim();
  if (!s) return "Unknown Artist";
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s.replace(/'/g, "\""));
      if (Array.isArray(arr) && arr.length > 0) return String(arr[0] || "Unknown Artist");
    } catch {
      // Keep the original fallback below.
    }
    return s.replace(/^\[+|]+$/g, "").replace(/['"]/g, "").trim() || "Unknown Artist";
  }
  return s;
}

function formatResult(r: SearchResult) {
  const bits = [r.title?.trim(), r.artist?.trim() ? `- ${r.artist.trim()}` : "", r.year ? `(${r.year})` : ""].filter(Boolean);
  return bits.join(" ");
}

function fallbackCover(title: string, artist: string) {
  const text = encodeURIComponent(`${title} ${artist}`.trim() || "music");
  return `https://picsum.photos/seed/${text}/400/400`;
}

function hasPlayableSource(rec: Rec) {
  return Boolean(rec.audioUrl || rec.previewUrl || rec.spotifyUrl || rec.spotifyUri);
}

function conversionEntries(links?: ArtistConversionLinks) {
  const labels: Record<keyof ArtistConversionLinks, string> = {
    spotify: "Spotify",
    website: "Website",
    merch: "Merch",
    tickets: "Tickets",
    emailSignup: "Email",
    support: "Support",
  };
  return (Object.keys(labels) as Array<keyof ArtistConversionLinks>)
    .map((key) => ({ key, label: labels[key], url: String(links?.[key] || "").trim() }))
    .filter((item) => item.url);
}

function isArtistUpload(rec: Rec) {
  return rec.sourceType === "upload" || rec.source === "upload" || Boolean(rec.audioUrl?.includes("/api/uploads/"));
}

function loadDiscoveryQueue(): DiscoveryQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const rows = JSON.parse(window.localStorage.getItem(DISCOVERY_QUEUE_KEY) || "[]");
    return Array.isArray(rows) ? rows.slice(0, 40) : [];
  } catch {
    return [];
  }
}

function reasonChips(rec: Rec, seeds: SeedSong[]) {
  const chips = [
    ...(rec.reasons ?? []),
    rec.popularity ? `Popularity ${rec.popularity}` : "",
    rec.year ? `Released ${rec.year}` : "",
    seeds[0]?.artist ? `Anchor: ${seeds[0].artist}` : seeds[0]?.title ? `Anchor: ${seeds[0].title}` : "",
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(chips)).slice(0, 5);
}

function activationReasons(rec: Rec, seeds: SeedSong[]) {
  const anchor = seeds[0];
  const base = rec.reasons?.filter(Boolean).slice(0, 3) ?? [];
  const fallback = [
    anchor?.title ? `Starts from your seed "${anchor.title}".` : "Starts from your current seed mix.",
    rec.previewUrl || rec.audioUrl ? "You can sample it before committing." : "You can inspect it before opening the full artist profile.",
    "Your feedback will immediately reshape the next set.",
  ];
  return base.length ? base.map((reason) => reason.endsWith(".") ? reason : `${reason}.`) : fallback;
}

function familiarAnchor(rec: Rec, seeds: SeedSong[]) {
  const artistSeed = seeds.find((seed) => seed.artist);
  const titleSeed = seeds.find((seed) => seed.title);
  if (artistSeed?.artist) return `For fans of ${artistSeed.artist}`;
  if (titleSeed?.title) return `Seeded by ${titleSeed.title}`;
  return rec.reasons?.[0] || "Based on your taste profile";
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
        active ? "bg-black text-white" : "border border-black/10 bg-white text-black hover:bg-black/5"
      }`}
    >
      {label}
    </button>
  );
}

function SeedSearch({
  slot,
  value,
  picked,
  results,
  loading,
  onValueChange,
  onPick,
  onClear,
}: {
  slot: SeedSlot;
  value: string;
  picked: SeedSong | null;
  results: SearchResult[];
  loading: boolean;
  onValueChange: (v: string) => void;
  onPick: (r: SearchResult) => void;
  onClear: () => void;
}) {
  const open = value.trim().length >= 2 && (loading || results.length > 0);
  return (
    <div className="relative rounded-lg border border-black/10 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-sm font-semibold uppercase tracking-[0.14em] text-black/45" htmlFor={`seed-${slot}`}>
          {slotLabels[slot]}
        </label>
        {picked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#eef2ff] px-2 py-1 text-xs font-bold text-[#3730a3]">
            <BadgeCheck className="h-3.5 w-3.5" />
            Picked
          </span>
        ) : null}
      </div>
      <div className="flex h-11 items-center gap-2 rounded-md bg-[#f8f7f2] px-3">
        <Search className="h-4 w-4 text-black/45" />
        <input
          id={`seed-${slot}`}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Search song or artist"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-black/35"
        />
        {value ? (
          <button type="button" onClick={onClear} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/5" aria-label="Clear seed">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {picked?.artist ? <p className="mt-2 truncate text-xs font-semibold text-black/45">{picked.artist}</p> : null}

      {open ? (
        <div className="absolute left-4 right-4 top-[96px] z-30 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 p-3 text-sm font-semibold text-black/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto">
              {results.slice(0, 8).map((r, idx) => (
                <li key={`${r.source ?? "x"}-${r.id ?? ""}-${idx}`}>
                  <button type="button" onClick={() => onPick(r)} className="w-full px-3 py-2 text-left text-sm font-semibold text-black hover:bg-[#f8f7f2]">
                    <span className="block truncate">{r.title}</span>
                    <span className="block truncate text-xs text-black/45">{[r.artist, r.year].filter(Boolean).join(" - ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Recommendations() {
  const navigate = useNavigate();
  const [seedValues, setSeedValues] = useState(["", "", ""]);
  const [pickedSeeds, setPickedSeeds] = useState<Array<SeedSong | null>>([null, null, null]);
  const [mode, setMode] = useState<"all" | "indie" | "mainstream">("all");
  const [searchResults, setSearchResults] = useState<SearchResult[][]>([[], [], []]);
  const [searchLoading, setSearchLoading] = useState([false, false, false]);
  const [closedSeedSlots, setClosedSeedSlots] = useState<boolean[]>([false, false, false]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [musicians, setMusicians] = useState<MusicianRec[]>([]);
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [activeFeedbackByTrack, setActiveFeedbackByTrack] = useState<Record<string, { superlike: boolean; like: boolean; dislike: boolean }>>({});
  const [feedbackBusyByTrack, setFeedbackBusyByTrack] = useState<Record<string, boolean>>({});
  const [selectedRecId, setSelectedRecId] = useState<string>("");
  const [playingId, setPlayingId] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [discoveryQueue, setDiscoveryQueue] = useState<DiscoveryQueueItem[]>(() => loadDiscoveryQueue());
  const [expandedWhyByTrack, setExpandedWhyByTrack] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const spotifySessionRef = useRef<SpotifySession | null>(null);
  const playback = usePlaybackMilestones("recommendations");

  useEffect(() => {
    const timers = seedValues.map((value, index) => {
      const q = value.trim();
      if (q.length < 2 || closedSeedSlots[index]) {
        setSearchResults((prev) => prev.map((rows, i) => (i === index ? [] : rows)));
        setSearchLoading((prev) => prev.map((item, i) => (i === index ? false : item)));
        return null;
      }

      setSearchLoading((prev) => prev.map((item, i) => (i === index ? true : item)));
      return window.setTimeout(async () => {
        const res = await apiSearch(q, 8).catch(() => []);
        setSearchResults((prev) => prev.map((rows, i) => (i === index ? res : rows)));
        setSearchLoading((prev) => prev.map((item, i) => (i === index ? false : item)));
      }, 250);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer !== null) window.clearTimeout(timer);
      });
    };
  }, [closedSeedSlots, seedValues]);

  const currentSeeds = useMemo(() => {
    return seedValues
      .map((value, index) => pickedSeeds[index] ?? (value.trim() ? { title: value.trim() } : null))
      .filter(Boolean) as SeedSong[];
  }, [pickedSeeds, seedValues]);

  const canSubmit = currentSeeds.length > 0;
  const selectedRec = useMemo(() => recs.find((rec) => rec.id === selectedRecId) ?? recs[0] ?? null, [recs, selectedRecId]);
  const seedSummary = currentSeeds.map((seed) => [seed.title, seed.artist].filter(Boolean).join(" - "));
  const queuedIds = useMemo(() => new Set(discoveryQueue.map((item) => item.id)), [discoveryQueue]);
  const selectedReasonChips = useMemo(
    () => (selectedRec ? reasonChips(selectedRec, currentSeeds) : []),
    [currentSeeds, selectedRec]
  );
  const selectedWhy = useMemo(
    () => (selectedRec ? activationReasons(selectedRec, currentSeeds) : []),
    [currentSeeds, selectedRec]
  );
  const selectedConversionLinks = useMemo(
    () => conversionEntries(selectedRec?.artistConversionLinks),
    [selectedRec?.artistConversionLinks]
  );

  const quickSeeds = useMemo(
    () =>
      albums.slice(0, 6).map((album) => ({
        title: album.title,
        artist: album.artist,
        year: album.year,
        id: album.id,
      })),
    []
  );

  async function loadRecommendations(args?: { fromFeedback?: boolean }) {
    if (!currentSeeds.length) return;
    const alreadyShown = args?.fromFeedback ? [] : getAlreadyShownIds();
    const data = await apiRecommend(currentSeeds, 9, mode, alreadyShown);
    const next = data.recommendations as Rec[];
    setRecs(next);
    setSelectedRecId(next[0]?.id ?? "");
    setMusicians((data.musicians ?? []) as MusicianRec[]);
    addAlreadyShownIds(next.map((x) => x.id));
    if (!args?.fromFeedback) setActiveFeedbackByTrack({});
    phCapture("recommend_results", { n: next.length, mode, seeds_count: currentSeeds.length, from_feedback: !!args?.fromFeedback });
  }

  async function onSubmit() {
    setError("");
    setSubmitting(true);
    try {
      await loadRecommendations();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Something went wrong."));
    } finally {
      setSubmitting(false);
    }
  }

  function setSeed(slot: number, value: string) {
    setSeedValues((prev) => prev.map((item, index) => (index === slot ? value : item)));
    setPickedSeeds((prev) => prev.map((item, index) => (index === slot ? null : item)));
    setClosedSeedSlots((prev) => prev.map((item, index) => (index === slot ? false : item)));
  }

  function pickSeed(slot: number, result: SearchResult | SeedSong) {
    const next = {
      title: result.title,
      artist: result.artist,
      year: result.year ?? null,
      id: result.id ?? null,
    };
    setSeedValues((prev) => prev.map((item, index) => (index === slot ? formatResult(next as SearchResult) : item)));
    setPickedSeeds((prev) => prev.map((item, index) => (index === slot ? next : item)));
    setSearchResults((prev) => prev.map((rows, index) => (index === slot ? [] : rows)));
    setSearchLoading((prev) => prev.map((item, index) => (index === slot ? false : item)));
    setClosedSeedSlots((prev) => prev.map((item, index) => (index === slot ? true : item)));
  }

  function clearSeed(slot: number) {
    setSeedValues((prev) => prev.map((item, index) => (index === slot ? "" : item)));
    setPickedSeeds((prev) => prev.map((item, index) => (index === slot ? null : item)));
    setSearchResults((prev) => prev.map((rows, index) => (index === slot ? [] : rows)));
    setSearchLoading((prev) => prev.map((item, index) => (index === slot ? false : item)));
    setClosedSeedSlots((prev) => prev.map((item, index) => (index === slot ? false : item)));
  }

  function addQuickSeed(seed: SeedSong) {
    const slot = seedValues.findIndex((value) => !value.trim());
    pickSeed(slot === -1 ? 0 : slot, seed);
  }

  function persistDiscoveryQueue(next: DiscoveryQueueItem[]) {
    setDiscoveryQueue(next);
    window.localStorage.setItem(DISCOVERY_QUEUE_KEY, JSON.stringify(next.slice(0, 40)));
  }

  function saveToDiscoveryQueue(rec: Rec) {
    const item: DiscoveryQueueItem = {
      id: rec.id,
      title: rec.title,
      artist: cleanArtist(rec.artist),
      imageUrl: rec.imageUrl || undefined,
      reasons: reasonChips(rec, currentSeeds),
      savedAt: new Date().toISOString(),
    };
    persistDiscoveryQueue([item, ...discoveryQueue.filter((row) => row.id !== rec.id)].slice(0, 40));
    phCapture("save_discovery_queue", { track_id: rec.id, title: rec.title, artist: rec.artist });
    void apiFeedback(rec.id, "save", {
      sourcePage: "recommendations",
      recommendationRequestId: rec.recommendationRequestId,
      recommendationRank: rec.recommendationRank,
      extra: { action: "save_discovery_queue", reasons: item.reasons },
    });
  }

  function selectRecommendation(rec: Rec) {
    setSelectedRecId(rec.id);
    phCapture("select_recommendation", { track_id: rec.id, title: rec.title, artist: rec.artist });
    void apiFeedback(rec.id, "click_recommendation", {
      sourcePage: "recommendations",
      recommendationRequestId: rec.recommendationRequestId,
      recommendationRank: rec.recommendationRank,
      extra: { action: "select", anchor: familiarAnchor(rec, currentSeeds) },
    });
  }

  const stopAudio = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    playback.skip();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlayingId("");
    setIsPlaying(false);
  }, [playback]);

  async function onPreview(rec: Rec) {
    await onPlay(rec);
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      stopAudio();
    }, 20000);
    phCapture("preview_20s_recommendation", { track_id: rec.id, title: rec.title, artist: rec.artist });
    void apiFeedback(rec.id, "click_recommendation", {
      sourcePage: "recommendations",
      recommendationRequestId: rec.recommendationRequestId,
      recommendationRank: rec.recommendationRank,
      extra: { action: "preview_20s", anchor: familiarAnchor(rec, currentSeeds) },
    });
  }

  async function playViaSpotify(rec: Rec): Promise<boolean> {
    const trackId = extractSpotifyTrackId(rec.spotifyUri || rec.spotifyUrl || "");
    const apiBase = apiUrl("");
    if (!trackId) return false;

    try {
      const status = await fetchSpotifyStatus(apiBase).catch(() => ({ ok: false, configured: false, hasRefreshCookie: false }));
      if (!status.configured) {
        setError("Spotify is not configured on backend.");
        return false;
      }
      if (!status.hasRefreshCookie) {
        window.location.href = apiUrl("/api/spotify/login");
        return true;
      }

      if (!spotifySessionRef.current) spotifySessionRef.current = await initSpotifyPlayer(apiBase);
      await playSpotifyTrack(apiBase, spotifySessionRef.current.deviceId, trackId);
      phCapture("play_full_spotify_sdk", { track_id: rec.id, title: rec.title, artist: rec.artist });
      void apiFeedback(rec.id, "open_spotify", {
        sourcePage: "recommendations",
        recommendationRequestId: rec.recommendationRequestId,
        recommendationRank: rec.recommendationRank,
      });
      playback.start(
        {
          id: rec.id,
          title: rec.title,
          artist: rec.artist,
          sourceKind: "spotify",
          recommendationRequestId: rec.recommendationRequestId,
          recommendationRank: rec.recommendationRank,
        },
        rec.durationMs ?? undefined
      );
      return true;
    } catch (e: unknown) {
      const status = getErrorStatus(e);
      if (status === 401) {
        window.location.href = apiUrl("/api/spotify/login");
        return true;
      }
      setError(getErrorMessage(e, "Spotify SDK playback unavailable for this track/account."));
      return false;
    }
  }

  async function onPlay(rec: Rec) {
    const a = audioRef.current;
    if (!a) return;
    const fullAudioUrl = rec.audioUrl ? apiUrl(rec.audioUrl) : "";
    const src = fullAudioUrl || rec.previewUrl || "";

    if (playingId === rec.id && !a.paused) {
      a.pause();
      setIsPlaying(false);
      return;
    }

    if (playingId && playingId !== rec.id) stopAudio();

    if (src) {
      try {
        a.src = src;
        await a.play();
        setPlayingId(rec.id);
        setIsPlaying(true);
        phCapture(fullAudioUrl ? "play_full" : "play_preview", { track_id: rec.id, title: rec.title, artist: rec.artist });
        playback.start(
          {
            id: rec.id,
            title: rec.title,
            artist: rec.artist,
            sourceKind: fullAudioUrl ? "upload" : "preview",
            recommendationRequestId: rec.recommendationRequestId,
            recommendationRank: rec.recommendationRank,
          },
          rec.durationMs ?? undefined
        );
        void apiFeedback(rec.id, "play", {
          sourcePage: "recommendations",
          recommendationRequestId: rec.recommendationRequestId,
          recommendationRank: rec.recommendationRank,
        });
        return;
      } catch {
        // Continue to Spotify fallback.
      }
    }

    if (rec.spotifyUri || rec.spotifyUrl) {
      stopAudio();
      const played = await playViaSpotify(rec);
      if (played) return;
    }

    setError("No playable source found for this recommendation.");
  }

  function isFeedbackActive(trackId: string, action: FeedbackAction) {
    return Boolean(activeFeedbackByTrack[trackId]?.[action]);
  }

  async function toggleFeedback(rec: Rec, action: FeedbackAction) {
    if (feedbackBusyByTrack[rec.id] || isFeedbackActive(rec.id, action)) return;

    setFeedbackBusyByTrack((prev) => ({ ...prev, [rec.id]: true }));
    setActiveFeedbackByTrack((prev) => ({
      ...prev,
      [rec.id]: {
        superlike: action === "superlike",
        like: action === "like",
        dislike: action === "dislike",
      },
    }));

    try {
      phCapture(`${action}_track`, { track_id: rec.id, title: rec.title, artist: rec.artist });
      const ok = await apiFeedback(rec.id, action, {
        sourcePage: "recommendations",
        recommendationRequestId: rec.recommendationRequestId,
        recommendationRank: rec.recommendationRank,
      });
      if (!ok) throw new Error("Feedback not accepted by backend.");
      await loadRecommendations({ fromFeedback: true });
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to save feedback."));
    } finally {
      setFeedbackBusyByTrack((prev) => ({ ...prev, [rec.id]: false }));
    }
  }

  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  useEffect(() => {
    stopAudio();
  }, [recs.length, stopAudio]);

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 place-items-center rounded-md hover:bg-black/5" aria-label="Go back">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="grid h-11 w-11 place-items-center rounded-md border border-black/10 bg-white">
              <Music2 className="h-6 w-6" />
            </div>
          </div>
          {recs.length ? (
            <button type="button" onClick={() => void onSubmit()} disabled={submitting} className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold hover:bg-black/5 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${submitting ? "animate-spin" : ""}`} />
              Refresh
            </button>
          ) : null}
        </div>

        <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Recommendations</p>
            <h1 className="mt-1 text-4xl font-bold leading-none sm:text-5xl">Musician-first discovery</h1>
            <p className="mt-3 max-w-3xl text-base font-semibold text-black/55">
              Choose reference tracks, find independent musicians alongside catalog matches, and send useful feedback back to artists.
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
            <p className="text-sm font-semibold text-black/55">Current seed mix</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {seedSummary.length ? (
                seedSummary.map((seed) => (
                  <span key={seed} className="rounded-md bg-white px-3 py-2 text-xs font-bold text-black/65">
                    {seed}
                  </span>
                ))
              ) : (
                <span className="text-sm font-semibold text-black/45">No seeds selected</span>
              )}
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4">
            <div className="grid gap-3">
              {[0, 1, 2].map((slot) => (
                <SeedSearch
                  key={slot}
                  slot={slot as SeedSlot}
                  value={seedValues[slot]}
                  picked={pickedSeeds[slot]}
                  results={searchResults[slot]}
                  loading={searchLoading[slot]}
                  onValueChange={(value) => setSeed(slot, value)}
                  onPick={(result) => pickSeed(slot, result)}
                  onClear={() => clearSeed(slot)}
                />
              ))}
            </div>

            <div className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
              <p className="text-sm font-semibold text-black/55">Quick seeds</p>
              <div className="mt-3 grid gap-2">
                {quickSeeds.map((seed) => (
                  <button key={`${seed.title}-${seed.artist}`} type="button" onClick={() => addQuickSeed(seed)} className="flex items-center gap-3 rounded-md bg-white p-2 text-left hover:bg-black/5">
                    <Disc3 className="h-4 w-4 shrink-0 text-black/45" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{seed.title}</span>
                      <span className="block truncate text-xs font-semibold text-black/45">{seed.artist}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-black/55">Discovery queue</p>
                <span className="rounded-md bg-[#f8f7f2] px-2 py-1 text-xs font-bold text-black/55">{discoveryQueue.length}</span>
              </div>
              <div className="mt-3 grid gap-2">
                {discoveryQueue.length ? (
                  discoveryQueue.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(`/track/${encodeURIComponent(item.id)}?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`)}
                      className="flex items-center gap-3 rounded-md bg-[#f8f7f2] p-2 text-left hover:bg-black/5"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded bg-white">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <Bookmark className="h-4 w-4 text-black/45" />}
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{item.title}</span>
                        <span className="block truncate text-xs font-semibold text-black/45">{item.artist}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-md bg-[#f8f7f2] p-3 text-sm font-semibold text-black/45">
                    Save unknown tracks here before deciding.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-black/10 bg-white p-4">
              <p className="text-sm font-semibold text-black/55">Popularity mode</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ModeButton active={mode === "all"} label="All" onClick={() => setMode("all")} />
                <ModeButton active={mode === "mainstream"} label="Mainstream" onClick={() => setMode("mainstream")} />
                <ModeButton active={mode === "indie"} label="Independent" onClick={() => setMode("indie")} />
              </div>
              <button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={onSubmit}
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-black text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {submitting ? "Generating" : "Get recommendations"}
              </button>
              {error ? <div className="mt-3 rounded-md border border-[#e85d4f]/30 bg-[#fff7f5] px-3 py-2 text-sm font-semibold text-[#9f2f26]">{error}</div> : null}
            </div>
          </aside>

          <main className="grid gap-5">
            {selectedRec ? (
              <section className="overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f2]">
                <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
                  <img
                    src={(selectedRec.imageUrl || "").trim() || fallbackCover(selectedRec.title, selectedRec.artist)}
                    alt={selectedRec.title}
                    className="h-72 w-full object-cover md:h-full"
                  />
                  <div className="flex min-h-[280px] flex-col justify-end p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Selected track</p>
                      {isArtistUpload(selectedRec) ? (
                        <span className="rounded-md bg-[#ecfeff] px-2 py-1 text-xs font-bold text-[#0f766e]">Artist upload</span>
                      ) : null}
                    </div>
                    <h2 className="mt-2 text-4xl font-bold leading-none">{selectedRec.title}</h2>
                    <p className="mt-3 text-lg font-semibold text-black/55">{cleanArtist(selectedRec.artist)}</p>
                    <div className="mt-4 rounded-md bg-white p-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-black">
                        <Info className="h-4 w-4 text-black/45" />
                        {familiarAnchor(selectedRec, currentSeeds)}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedReasonChips.map((chip) => (
                          <span key={chip} className="rounded-md bg-[#f1f5f9] px-2 py-1 text-xs font-bold text-black/60">
                            {chip}
                          </span>
                        ))}
                      </div>
                      <ul className="mt-3 space-y-1 text-sm font-semibold text-black/60">
                        {selectedWhy.slice(0, 3).map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void onPreview(selectedRec)} disabled={!hasPlayableSource(selectedRec)} className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/80 disabled:opacity-50">
                        {playingId === selectedRec.id && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {playingId === selectedRec.id && isPlaying ? "Pause" : "Preview 20s"}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveToDiscoveryQueue(selectedRec)}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold hover:bg-black/5"
                      >
                        {queuedIds.has(selectedRec.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        {queuedIds.has(selectedRec.id) ? "Saved" : "Save"}
                      </button>
                      {selectedRec.spotifyUrl ? (
                        <a href={selectedRec.spotifyUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold hover:bg-black/5">
                          <ExternalLink className="h-4 w-4" />
                          Spotify
                        </a>
                      ) : null}
                    </div>
                    {selectedConversionLinks.length ? (
                      <div className="mt-4 rounded-md bg-white p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">Artist links</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedConversionLinks.map((link) => (
                            <a
                              key={link.key}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => {
                                void apiFeedback(selectedRec.id, "artist_click", {
                                  sourcePage: "recommendations",
                                  recommendationRequestId: selectedRec.recommendationRequestId,
                                  recommendationRank: selectedRec.recommendationRank,
                                  extra: { conversion: link.key },
                                });
                              }}
                              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#f8f7f2] px-3 py-2 text-xs font-bold text-black hover:bg-black/5"
                            >
                              {link.label}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : (
              <section className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-black/20 bg-[#f8f7f2] p-6 text-center">
                <div>
                  <Sparkles className="mx-auto h-9 w-9 text-black/45" />
                  <p className="mt-3 text-lg font-bold">Build a seed mix</p>
                  <p className="mt-1 text-sm font-semibold text-black/50">Search or choose quick seeds to generate recommendations.</p>
                </div>
              </section>
            )}

            {recs.length ? (
              <section className="rounded-lg border border-black/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Recommended tracks and musician uploads</h2>
                  <span className="text-sm font-semibold text-black/45">{recs.length} results</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {recs.map((rec) => {
                    const selected = rec.id === selectedRec?.id;
                    const chips = reasonChips(rec, currentSeeds);
                    const whyOpen = Boolean(expandedWhyByTrack[rec.id]);
                    const why = activationReasons(rec, currentSeeds);
                    const links = conversionEntries(rec.artistConversionLinks);
                    return (
                      <article key={rec.id} className={`rounded-lg border p-3 transition ${selected ? "border-black bg-[#f8f7f2]" : "border-black/10 bg-white hover:bg-[#f8f7f2]"}`}>
                        <button type="button" onClick={() => selectRecommendation(rec)} className="flex w-full gap-3 text-left">
                          <img src={(rec.imageUrl || "").trim() || fallbackCover(rec.title, rec.artist)} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{rec.title}</span>
                            <span className="mt-1 block truncate text-xs font-semibold text-black/50">{cleanArtist(rec.artist)}</span>
                            <span className="mt-3 block truncate text-xs font-semibold text-black/40">
                              {isArtistUpload(rec) ? "Independent artist upload" : familiarAnchor(rec, currentSeeds)}
                            </span>
                          </span>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {chips.slice(0, 3).map((chip) => (
                            <span key={chip} className="rounded bg-[#f1f5f9] px-2 py-1 text-[11px] font-bold text-black/55">
                              {chip}
                            </span>
                          ))}
                        </div>
                        {whyOpen ? (
                          <div className="mt-3 rounded-md bg-white p-3 text-xs font-semibold text-black/60">
                            {why.slice(0, 3).map((reason) => (
                              <p key={reason}>- {reason}</p>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-3 grid grid-cols-6 gap-2">
                          <button type="button" onClick={() => void onPreview(rec)} disabled={!hasPlayableSource(rec)} className="col-span-2 inline-flex h-9 items-center justify-center gap-1 rounded-md bg-black px-2 text-xs font-bold text-white disabled:opacity-40" aria-label="Preview recommendation">
                            {playingId === rec.id && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            <span className="hidden sm:inline">20s</span>
                          </button>
                          <button type="button" disabled={!!feedbackBusyByTrack[rec.id]} onClick={() => void toggleFeedback(rec, "superlike")} className={`grid h-9 place-items-center rounded-md ${isFeedbackActive(rec.id, "superlike") ? "bg-[#eef2ff] text-[#3730a3]" : "bg-[#f1f5f9] text-black/65"}`} aria-label="Superlike">
                            <Star className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={!!feedbackBusyByTrack[rec.id]} onClick={() => void toggleFeedback(rec, "like")} className={`grid h-9 place-items-center rounded-md ${isFeedbackActive(rec.id, "like") ? "bg-[#e8f7f5] text-[#0f766e]" : "bg-[#f1f5f9] text-black/65"}`} aria-label="Like">
                            <Heart className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={!!feedbackBusyByTrack[rec.id]} onClick={() => void toggleFeedback(rec, "dislike")} className={`grid h-9 place-items-center rounded-md ${isFeedbackActive(rec.id, "dislike") ? "bg-[#fff1f0] text-[#9f2f26]" : "bg-[#f1f5f9] text-black/65"}`} aria-label="Dislike">
                            <ThumbsDown className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => saveToDiscoveryQueue(rec)} className={`grid h-9 place-items-center rounded-md ${queuedIds.has(rec.id) ? "bg-[#ecfeff] text-[#0f766e]" : "bg-[#f1f5f9] text-black/65"}`} aria-label="Save to discovery queue">
                            {queuedIds.has(rec.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedWhyByTrack((prev) => ({ ...prev, [rec.id]: !prev[rec.id] }))}
                          className="mt-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-black/55 hover:bg-black/5"
                        >
                          <Info className="h-3.5 w-3.5" />
                          {whyOpen ? "Hide why" : "Why this?"}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/track/${encodeURIComponent(rec.id)}?title=${encodeURIComponent(rec.title)}&artist=${encodeURIComponent(rec.artist)}`)}
                          className="ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-black/55 hover:bg-black/5"
                        >
                          Open
                        </button>
                        {links.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {links.slice(0, 3).map((link) => (
                              <a
                                key={link.key}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => {
                                  void apiFeedback(rec.id, "artist_click", {
                                    sourcePage: "recommendations",
                                    recommendationRequestId: rec.recommendationRequestId,
                                    recommendationRank: rec.recommendationRank,
                                    extra: { conversion: link.key },
                                  });
                                }}
                                className="rounded-md bg-[#ecfeff] px-2 py-1 text-[11px] font-bold text-[#0f766e]"
                              >
                                {link.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </main>
        </section>

        {musicians.length > 0 ? (
          <section className="mt-6 rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-black/55" />
              <h2 className="text-xl font-bold">Recommended musicians</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {musicians.slice(0, 6).map((m) => (
                <article key={m.id} className="rounded-lg bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-[#f1f5f9]">
                      {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-black/45" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold">{m.name}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-black/50">
                        {(m.reasons ?? []).join(" - ") || "Based on your selected songs and listening profile."}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-black/60">{(m.topTracks ?? []).slice(0, 3).join(" - ")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(m.reasons ?? ["Adjacent to your seed mix"]).slice(0, 3).map((reason) => (
                      <span key={reason} className="rounded-md bg-[#f8f7f2] px-2 py-1 text-xs font-bold text-black/55">
                        {reason}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => navigate(`/artist/${encodeURIComponent(m.name)}`)} className="h-9 rounded-md bg-[#f1f5f9] text-sm font-bold hover:bg-black/10">
                      Profile
                    </button>
                    <button type="button" onClick={() => window.open(m.concertsUrl || `https://www.songkick.com/search?query=${encodeURIComponent(m.name)}`, "_blank", "noopener,noreferrer")} className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-[#f1f5f9] text-sm font-bold hover:bg-black/10">
                      <MapPin className="h-3.5 w-3.5" />
                      Live
                    </button>
                    <button type="button" disabled={!m.spotifyUrl} onClick={() => m.spotifyUrl && window.open(m.spotifyUrl, "_blank", "noopener,noreferrer")} className="h-9 rounded-md bg-[#f1f5f9] text-sm font-bold hover:bg-black/10 disabled:opacity-50">
                      Spotify
                    </button>
                  </div>
                  {conversionEntries(m.conversionLinks).length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {conversionEntries(m.conversionLinks).slice(0, 4).map((link) => (
                        <a key={link.key} href={link.url} target="_blank" rel="noreferrer" className="rounded-md bg-[#f8f7f2] px-2 py-1 text-xs font-bold text-black/55">
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <audio
          ref={audioRef}
          className="hidden"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            playback.progress(audio.currentTime || 0, Number.isFinite(audio.duration) ? audio.duration : undefined);
          }}
          onEnded={(event) => {
            const audio = event.currentTarget;
            playback.progress(audio.currentTime || 0, Number.isFinite(audio.duration) ? audio.duration : undefined);
            playback.complete();
            setPlayingId("");
            setIsPlaying(false);
          }}
        />
      </section>
    </div>
  );
}
