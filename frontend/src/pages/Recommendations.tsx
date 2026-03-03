import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFeedback, apiRecommend, apiSearch, apiUrl, type MusicianRec, type RecItem, type SearchResult, type SeedSong } from "@/lib/api";
import { addAlreadyShownIds, getAlreadyShownIds } from "@/lib/analytics";
import { phCapture } from "@/lib/posthog";
import { extractSpotifyTrackId, fetchSpotifyStatus, initSpotifyPlayer, playSpotifyTrack } from "@/lib/spotify";

type Rec = RecItem;
type FeedbackAction = "superlike" | "like" | "dislike";

function formatResult(r: SearchResult) {
  const bits = [
    r.title?.trim(),
    r.artist?.trim() ? `— ${r.artist.trim()}` : "",
    r.year ? `(${r.year})` : "",
  ].filter(Boolean);
  return bits.join(" ");
}

function SeedInput({
  label,
  placeholder,
  value,
  onValueChange,
  onPick,
  results,
  loading,
}: {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (v: string) => void;
  onPick: (r: SearchResult) => void;
  results: SearchResult[];
  loading: boolean;
}) {
  return (
    <div className="relative">
      <label className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">{label}</label>

      <div className="mt-2 rounded-[10px] bg-[#ababab] px-[11px] py-2">
        <input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className="h-6 w-full bg-transparent font-['Arimo',sans-serif] text-[20px] font-bold text-black outline-none placeholder:text-black"
        />
      </div>

      {(loading || results.length > 0) && value.trim().length >= 2 ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[10px] border border-black/10 bg-white shadow-md">
          {loading ? (
            <div className="p-3 font-['Arimo',sans-serif] text-[16px] font-bold text-black/70">Searching...</div>
          ) : (
            <ul className="max-h-56 overflow-auto">
              {results.slice(0, 8).map((r, idx) => (
                <li key={`${r.source ?? "x"}-${r.id ?? ""}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className="w-full px-3 py-2 text-left font-['Arimo',sans-serif] text-[16px] font-bold text-black hover:bg-[#f1f1f1]"
                  >
                    {formatResult(r)}
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

  const [seed1, setSeed1] = useState("");
  const [seed2, setSeed2] = useState("");
  const [seed3, setSeed3] = useState("");

  const [picked1, setPicked1] = useState<SeedSong | null>(null);
  const [picked2, setPicked2] = useState<SeedSong | null>(null);
  const [picked3, setPicked3] = useState<SeedSong | null>(null);

  const [mode, setMode] = useState<"all" | "indie" | "mainstream">("all");

  const [r1, setR1] = useState<SearchResult[]>([]);
  const [r2, setR2] = useState<SearchResult[]>([]);
  const [r3, setR3] = useState<SearchResult[]>([]);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [loading3, setLoading3] = useState(false);

  const [recs, setRecs] = useState<Rec[]>([]);
  const [musicians, setMusicians] = useState<MusicianRec[]>([]);
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [activeFeedbackByTrack, setActiveFeedbackByTrack] = useState<
    Record<string, { superlike: boolean; like: boolean; dislike: boolean }>
  >({});
  const [feedbackBusyByTrack, setFeedbackBusyByTrack] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spotifySessionRef = useRef<{ player: any; deviceId: string } | null>(null);
  const [playingId, setPlayingId] = useState<string>("");

  useEffect(() => {
    const q = seed1.trim();
    if (q.length < 2) {
      setR1([]);
      return;
    }
    setLoading1(true);
    const t = setTimeout(async () => {
      const res = await apiSearch(q, 8).catch(() => []);
      setR1(res);
      setLoading1(false);
    }, 250);
    return () => clearTimeout(t);
  }, [seed1]);

  useEffect(() => {
    const q = seed2.trim();
    if (q.length < 2) {
      setR2([]);
      return;
    }
    setLoading2(true);
    const t = setTimeout(async () => {
      const res = await apiSearch(q, 8).catch(() => []);
      setR2(res);
      setLoading2(false);
    }, 250);
    return () => clearTimeout(t);
  }, [seed2]);

  useEffect(() => {
    const q = seed3.trim();
    if (q.length < 2) {
      setR3([]);
      return;
    }
    setLoading3(true);
    const t = setTimeout(async () => {
      const res = await apiSearch(q, 8).catch(() => []);
      setR3(res);
      setLoading3(false);
    }, 250);
    return () => clearTimeout(t);
  }, [seed3]);

  const canSubmit = useMemo(() => {
    return seed1.trim() || seed2.trim() || seed3.trim();
  }, [seed1, seed2, seed3]);

  function buildCurrentSeeds(): SeedSong[] {
    return [
      picked1 ?? (seed1.trim() ? { title: seed1.trim() } : null),
      picked2 ?? (seed2.trim() ? { title: seed2.trim() } : null),
      picked3 ?? (seed3.trim() ? { title: seed3.trim() } : null),
    ].filter(Boolean) as SeedSong[];
  }

  async function loadRecommendations(args?: { fromFeedback?: boolean }) {
    const songs = buildCurrentSeeds();
    if (!songs.length) return;
    const alreadyShown = args?.fromFeedback ? [] : getAlreadyShownIds();
    const data = await apiRecommend(songs, 9, mode, alreadyShown);
    const next = data.recommendations as Rec[];
    setRecs(next);
    setMusicians((data.musicians ?? []) as MusicianRec[]);
    addAlreadyShownIds(next.map((x) => x.id));
    if (!args?.fromFeedback) {
      setActiveFeedbackByTrack({});
    }
    phCapture("recommend_results", { n: next.length, mode, seeds_count: songs.length, from_feedback: !!args?.fromFeedback });
  }

  async function onSubmit() {
    setError("");
    setSubmitting(true);

    try {
      await loadRecommendations();
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message || "Something went wrong.");
      else setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function stopAudio() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setPlayingId("");
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

      if (!spotifySessionRef.current) {
        spotifySessionRef.current = await initSpotifyPlayer(apiBase);
      }
      await playSpotifyTrack(apiBase, spotifySessionRef.current.deviceId, trackId);
      phCapture("play_full_spotify_sdk", { track_id: rec.id, title: rec.title, artist: rec.artist });
      apiFeedback(rec.id, "open_spotify");
      return true;
    } catch (e: any) {
      const status = Number(e?.status || 0);
      if (status === 401) {
        window.location.href = apiUrl("/api/spotify/login");
        return true;
      }
      setError("Spotify SDK playback unavailable for this track/account.");
      return false;
    }
  }

  async function onPlay(rec: Rec) {
    const a = audioRef.current;
    if (!a) return;

    const fullAudioUrl = rec.audioUrl ? apiUrl(rec.audioUrl) : "";
    const src = fullAudioUrl || rec.previewUrl || "";

    if (playingId && playingId === rec.id && !a.paused) {
      stopAudio();
      return;
    }

    // First choice: in-app audio (uploaded full track, then preview).
    if (src) {
      try {
        a.src = src;
        await a.play();
        setPlayingId(rec.id);
        phCapture(fullAudioUrl ? "play_full" : "play_preview", {
          track_id: rec.id,
          title: rec.title,
          artist: rec.artist,
        });
        apiFeedback(rec.id, "play");
        return;
      } catch {
        // Continue to Spotify fallback below.
      }
    }

    // Fallback: Spotify full track.
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
    if (feedbackBusyByTrack[rec.id]) return;
    const wasActive = isFeedbackActive(rec.id, action);
    if (wasActive) return;

    setFeedbackBusyByTrack((prev) => ({ ...prev, [rec.id]: true }));
    setActiveFeedbackByTrack((prev) => ({
      ...prev,
      [rec.id]: {
        superlike: !wasActive && action === "superlike",
        like: !wasActive && action === "like",
        dislike: !wasActive && action === "dislike",
      },
    }));

    try {
      phCapture(`${action}_track`, { track_id: rec.id, title: rec.title, artist: rec.artist });
      const ok = await apiFeedback(rec.id, action);
      if (!ok) {
        throw new Error("Feedback not accepted by backend.");
      }
      await loadRecommendations({ fromFeedback: true });
    } catch (e: any) {
      setError(e?.message || "Failed to save feedback.");
    } finally {
      setFeedbackBusyByTrack((prev) => ({ ...prev, [rec.id]: false }));
    }
  }

  useEffect(() => {
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs.length]);

  const outputSlots = useMemo(() => {
    const capped = recs.slice(0, 9);
    if (capped.length >= 9) return capped;
    return [...capped, ...Array.from({ length: 9 - capped.length }, () => null)];
  }, [recs]);

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-28">
      <section className="mx-auto w-full max-w-[1420px] px-4 pt-8 sm:px-8">
        <div className="flex items-center gap-3">
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

        <div className="mt-6">
          <h1 className="font-['Arimo',sans-serif] text-[48px] font-bold leading-none text-black sm:text-[60px]">
            Recommendation
          </h1>
          <p className="font-['Arimo',sans-serif] text-[24px] font-bold leading-tight text-black sm:text-[42px]">
            Pick up to 3 songs, then we&apos;ll generate 9 recommendations.
          </p>
        </div>

        <div className="mt-4 rounded-[10px] bg-[#d9d9d9] px-4 py-4 sm:px-[17px] sm:py-[14px]">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_378px] lg:gap-7">
            <div className="space-y-3">
              <SeedInput
                label="Song 1"
                placeholder="Enter song name..."
                value={seed1}
                onValueChange={(v) => {
                  setSeed1(v);
                  setPicked1(null);
                }}
                results={r1}
                loading={loading1}
                onPick={(r) => {
                  setSeed1(formatResult(r));
                  setPicked1({ title: r.title, artist: r.artist, year: r.year ?? null, id: r.id ?? null });
                  setR1([]);
                }}
              />

              <SeedInput
                label="Song 2"
                placeholder="Enter song name..."
                value={seed2}
                onValueChange={(v) => {
                  setSeed2(v);
                  setPicked2(null);
                }}
                results={r2}
                loading={loading2}
                onPick={(r) => {
                  setSeed2(formatResult(r));
                  setPicked2({ title: r.title, artist: r.artist, year: r.year ?? null, id: r.id ?? null });
                  setR2([]);
                }}
              />

              <SeedInput
                label="Song 3"
                placeholder="Enter song name..."
                value={seed3}
                onValueChange={(v) => {
                  setSeed3(v);
                  setPicked3(null);
                }}
                results={r3}
                loading={loading3}
                onPick={(r) => {
                  setSeed3(formatResult(r));
                  setPicked3({ title: r.title, artist: r.artist, year: r.year ?? null, id: r.id ?? null });
                  setR3([]);
                }}
              />
            </div>

            <div>
              <div className="font-['Arimo',sans-serif] text-black">
                <p className="text-[30px] font-bold leading-none">Popularity mode</p>
                <p className="mt-1 text-[15px] font-bold leading-tight">
                  Toggle between underground and mainstream songs
                </p>
              </div>

              <div className="mt-[10px] flex flex-wrap gap-[10px]">
                <button
                  type="button"
                  onClick={() => setMode("all")}
                  className={
                    mode === "all"
                      ? "h-10 rounded-[10px] bg-black px-5 font-['Arimo',sans-serif] text-[20px] font-bold text-white"
                      : "h-10 rounded-[10px] bg-[#ababab] px-5 font-['Arimo',sans-serif] text-[20px] font-bold text-black"
                  }
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setMode("mainstream")}
                  className={
                    mode === "mainstream"
                      ? "h-10 rounded-[10px] bg-black px-4 font-['Arimo',sans-serif] text-[20px] font-bold text-white"
                      : "h-10 rounded-[10px] bg-[#ababab] px-4 font-['Arimo',sans-serif] text-[20px] font-bold text-black"
                  }
                >
                  Mainstream
                </button>
                <button
                  type="button"
                  onClick={() => setMode("indie")}
                  className={
                    mode === "indie"
                      ? "h-10 rounded-[10px] bg-black px-4 font-['Arimo',sans-serif] text-[20px] font-bold text-white"
                      : "h-10 rounded-[10px] bg-[#ababab] px-4 font-['Arimo',sans-serif] text-[20px] font-bold text-black"
                  }
                >
                  Independent
                </button>
              </div>

              <button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={onSubmit}
                className="mt-[10px] h-[47px] w-full rounded-[10px] bg-[#ff9494] font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Generating..." : "Get recommendations"}
              </button>

              {error ? (
                <div className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 font-['Arimo',sans-serif] text-[16px] font-bold text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <audio
          ref={audioRef}
          className="hidden"
          onEnded={() => {
            setPlayingId("");
          }}
        />

        {recs.length > 0 ? (
          <div className="mt-9">
            <div className="grid grid-cols-3 gap-4">
              {outputSlots.map((rec, idx) => (
                <div key={rec ? rec.id : `empty-${idx}`} className="rounded-[10px] bg-[#d9d9d9] p-3">
                  <div className="flex gap-3">
                    <div className="h-[140px] w-[140px] shrink-0 overflow-hidden rounded-[8px] bg-[#c9c9c9]">
                      {rec?.imageUrl ? (
                        <img src={rec.imageUrl} alt={rec.title} className="h-full w-full object-cover" />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-['Arimo',sans-serif] text-[24px] font-bold leading-none text-black">
                        {rec?.title ?? "Waiting for recommendation"}
                      </p>
                      <p className="mt-1 truncate font-['Arimo',sans-serif] text-[24px] font-bold leading-none text-black">
                        {rec?.artist ?? " "}
                      </p>

                      <div className="mt-3 space-y-[10px]">
                        <button
                          type="button"
                          disabled={!rec || (!rec.audioUrl && !rec.previewUrl && !rec.spotifyUrl && !rec.spotifyUri)}
                          onClick={() => (rec ? onPlay(rec) : undefined)}
                          className={`h-[38px] w-full rounded-[10px] font-['Arimo',sans-serif] text-[20px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-60 ${
                            rec && playingId === rec.id ? "bg-[#969696]" : "bg-[#ababab]"
                          }`}
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          disabled={!rec || !!feedbackBusyByTrack[rec.id]}
                          onClick={() => {
                            if (!rec) return;
                            void toggleFeedback(rec, "superlike");
                          }}
                          className={`h-[38px] w-full rounded-[10px] font-['Arimo',sans-serif] text-[20px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-60 ${
                            rec && isFeedbackActive(rec.id, "superlike") ? "bg-[#969696]" : "bg-[#ababab]"
                          }`}
                        >
                          Superlike
                        </button>
                        <button
                          type="button"
                          disabled={!rec || !!feedbackBusyByTrack[rec.id]}
                          onClick={() => {
                            if (!rec) return;
                            void toggleFeedback(rec, "like");
                          }}
                          className={`h-[38px] w-full rounded-[10px] font-['Arimo',sans-serif] text-[20px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-60 ${
                            rec && isFeedbackActive(rec.id, "like") ? "bg-[#969696]" : "bg-[#ababab]"
                          }`}
                        >
                          Like
                        </button>
                        <button
                          type="button"
                          disabled={!rec || !!feedbackBusyByTrack[rec.id]}
                          onClick={() => {
                            if (!rec) return;
                            void toggleFeedback(rec, "dislike");
                          }}
                          className={`h-[38px] w-full rounded-[10px] font-['Arimo',sans-serif] text-[20px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-60 ${
                            rec && isFeedbackActive(rec.id, "dislike") ? "bg-[#969696]" : "bg-[#ababab]"
                          }`}
                        >
                          Dislike
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {musicians.length > 0 ? (
          <div className="mt-8">
            <h2 className="font-['Arimo',sans-serif] text-[36px] font-bold leading-none text-black">
              Recommended Musicians
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {musicians.slice(0, 6).map((m) => (
                <div key={m.id} className="rounded-[10px] bg-[#d9d9d9] p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-[72px] w-[72px] overflow-hidden rounded-[8px] bg-[#c9c9c9]">
                      {m.imageUrl ? <img src={m.imageUrl} alt={m.name} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-['Arimo',sans-serif] text-[24px] font-bold leading-none text-black">{m.name}</p>
                      <p className="mt-2 max-h-10 overflow-hidden text-sm text-black/70">
                        {(m.reasons ?? []).join(" • ") || "Based on your selected songs and listening profile."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-sm font-bold text-black/80">
                    {(m.topTracks ?? []).slice(0, 3).join(" • ")}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/artist/${encodeURIComponent(m.name)}`)}
                      className="h-9 rounded-[8px] bg-[#ababab] text-sm font-bold text-black"
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(m.concertsUrl || `https://www.songkick.com/search?query=${encodeURIComponent(m.name)}`, "_blank", "noopener,noreferrer")}
                      className="h-9 rounded-[8px] bg-[#ababab] text-sm font-bold text-black"
                    >
                      Concerts
                    </button>
                    <button
                      type="button"
                      disabled={!m.spotifyUrl}
                      onClick={() => m.spotifyUrl && window.open(m.spotifyUrl, "_blank", "noopener,noreferrer")}
                      className="h-9 rounded-[8px] bg-[#ababab] text-sm font-bold text-black disabled:opacity-60"
                    >
                      Spotify
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
