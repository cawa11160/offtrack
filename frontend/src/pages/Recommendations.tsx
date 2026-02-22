import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Music2, Pause, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  apiFeedback,
  apiRecommend,
  apiSearch,
  apiUrl,
  type RecItem,
  type SearchResult,
  type SeedSong,
} from "@/lib/api";
import { addAlreadyShownIds, getAlreadyShownIds } from "@/lib/analytics";
import { phCapture } from "@/lib/posthog";

type Rec = RecItem;

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
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string>("");

  function stopAudio() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  async function playPreview(rec: Rec) {
    const a = audioRef.current;
    if (!a) return;

    if (playingId && playingId === rec.id && !a.paused) {
      a.pause();
      setPlayingId("");
      return;
    }

    const fullAudioUrl = rec.audioUrl ? apiUrl(rec.audioUrl) : "";
    const src = fullAudioUrl || rec.previewUrl || "";

    if (!src) {
      if (rec.spotifyUrl) {
        phCapture("open_spotify", { track_id: rec.id, title: rec.title, artist: rec.artist });
        apiFeedback(rec.id, "open_spotify");
        window.open(rec.spotifyUrl, "_blank");
      }
      return;
    }

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
    } catch {
      if (rec.spotifyUrl) {
        phCapture("open_spotify", { track_id: rec.id, title: rec.title, artist: rec.artist });
        apiFeedback(rec.id, "open_spotify");
        window.open(rec.spotifyUrl, "_blank");
      }
    }
  }

  useEffect(() => {
    stopAudio();
    setPlayingId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs.length]);

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

  async function onSubmit() {
    setError("");
    setSubmitting(true);

    try {
      const songs: SeedSong[] = [
        picked1 ?? (seed1.trim() ? { title: seed1.trim() } : null),
        picked2 ?? (seed2.trim() ? { title: seed2.trim() } : null),
        picked3 ?? (seed3.trim() ? { title: seed3.trim() } : null),
      ].filter(Boolean) as SeedSong[];

      const alreadyShown = getAlreadyShownIds();
      const data = await apiRecommend(songs, 9, mode, alreadyShown);
      const next = data.recommendations as Rec[];
      setRecs(next);
      addAlreadyShownIds(next.map((x) => x.id));
      phCapture("recommend_results", { n: next.length, mode, seeds_count: songs.length });
    } catch (e: unknown) {
      if (e instanceof Error) setError(e.message || "Something went wrong.");
      else setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const featuredRec = recs[0] ?? null;

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

        <div className="mt-9 w-full max-w-[540px] rounded-[10px] bg-[#d9d9d9] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="h-[200px] w-[200px] shrink-0 overflow-hidden bg-[#c9c9c9] sm:h-[273px] sm:w-[273px]">
              {featuredRec?.imageUrl ? (
                <img src={featuredRec.imageUrl} alt={featuredRec.title} className="h-full w-full object-cover" />
              ) : (
                <img
                  src="https://images.unsplash.com/photo-1619983081563-430f63602796?w=700&h=700&fit=crop"
                  alt="Recommendation"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="w-full">
              <p className="font-['Arimo',sans-serif] text-[42px] font-bold leading-[0.95] text-black">
                {featuredRec?.title ?? "CPR"}
              </p>
              <p className="mt-1 font-['Arimo',sans-serif] text-[42px] font-bold leading-[0.95] text-black">
                {featuredRec?.artist ?? "Wetleg"}
              </p>

              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => (featuredRec ? playPreview(featuredRec) : undefined)}
                  disabled={!featuredRec}
                  className="flex h-[42px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#ababab] font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {featuredRec && playingId === featuredRec.id ? (
                    <>
                      <Pause className="h-5 w-5" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" /> Preview song
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!featuredRec) return;
                    phCapture("superlike_track", {
                      track_id: featuredRec.id,
                      title: featuredRec.title,
                      artist: featuredRec.artist,
                    });
                    apiFeedback(featuredRec.id, "superlike");
                  }}
                  disabled={!featuredRec}
                  className="h-[42px] w-full rounded-[10px] bg-[#ababab] font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Superlike
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!featuredRec) return;
                    phCapture("like_track", {
                      track_id: featuredRec.id,
                      title: featuredRec.title,
                      artist: featuredRec.artist,
                    });
                    apiFeedback(featuredRec.id, "like");
                  }}
                  disabled={!featuredRec}
                  className="h-[42px] w-full rounded-[10px] bg-[#ababab] font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Like
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!featuredRec) return;
                    phCapture("dislike_track", {
                      track_id: featuredRec.id,
                      title: featuredRec.title,
                      artist: featuredRec.artist,
                    });
                    apiFeedback(featuredRec.id, "dislike");
                  }}
                  disabled={!featuredRec}
                  className="h-[42px] w-full rounded-[10px] bg-[#ababab] font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Dislike
                </button>

                {featuredRec?.spotifyUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      phCapture("open_spotify", {
                        track_id: featuredRec.id,
                        title: featuredRec.title,
                        artist: featuredRec.artist,
                      });
                      apiFeedback(featuredRec.id, "open_spotify");
                      window.open(featuredRec.spotifyUrl!, "_blank");
                    }}
                    className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-[10px] bg-black font-['Arimo',sans-serif] text-[24px] font-bold leading-none text-white"
                  >
                    <ExternalLink className="h-4 w-4" /> Spotify
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
