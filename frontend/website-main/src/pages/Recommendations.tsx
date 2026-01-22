import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Search, Music2, Play, Pause, ExternalLink } from "lucide-react";
import { apiRecommend, apiSearch, type SearchResult, type SeedSong } from "@/lib/api";

type Rec = {
  id: string;
  title: string;
  artist: string;
  year?: number | null;
  imageUrl?: string;

  // ✅ streaming enrichment from backend/api.py
  previewUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyUri?: string | null;
  durationMs?: number | null;
};

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
      <label className="text-sm font-medium">{label}</label>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-background px-4 focus-within:ring-2 focus-within:ring-black/10">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 w-full bg-transparent outline-none"
        />
      </div>

      {(loading || results.length > 0) && value.trim().length >= 2 ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching…</div>
          ) : (
            <ul className="max-h-56 overflow-auto">
              {results.slice(0, 8).map((r, idx) => (
                <li key={`${r.source ?? "x"}-${r.id ?? ""}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {formatResult(r)}
                    {r.source ? (
                      <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {r.source}
                      </span>
                    ) : null}
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

  // ✅ one shared audio player for the whole page
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string>("");
  const [nowPlaying, setNowPlaying] = useState<string>("");

  function stopAudio() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  async function playPreview(rec: Rec) {
    const a = audioRef.current;
    if (!a) return;

    // toggle pause if clicking the same track
    if (playingId && playingId === rec.id && !a.paused) {
      a.pause();
      setPlayingId("");
      return;
    }

    // if no previewUrl, quickest demo fallback: open spotify page if present
    if (!rec.previewUrl) {
      if (rec.spotifyUrl) window.open(rec.spotifyUrl, "_blank");
      return;
    }

    try {
      a.src = rec.previewUrl;
      await a.play();
      setPlayingId(rec.id);
      setNowPlaying(`${rec.title} — ${rec.artist}`);
    } catch {
      // autoplay blocked or invalid previewUrl; fallback to Spotify
      if (rec.spotifyUrl) window.open(rec.spotifyUrl, "_blank");
    }
  }

  // stop playing when recommendations list changes
  useEffect(() => {
    stopAudio();
    setPlayingId("");
    setNowPlaying("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs.length]);

  // Debounced search (simple)
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

      const data = await apiRecommend(songs, 9, mode);
      setRecs(data.recommendations as Rec[]);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black text-white">
          <Sparkles className="h-5 w-5" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Recommendations</h1>
          <p className="text-sm text-muted-foreground">
            Pick up to 3 songs, then we’ll generate 9 recommendations.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:grid-cols-2">
        <div className="grid gap-4">
          <SeedInput
            label="Song 1"
            placeholder="Search by title or artist…"
            value={seed1}
            onValueChange={(v) => {
              setSeed1(v);
              setPicked1(null);
            }}
            results={r1}
            loading={loading1}
            onPick={(r) => {
              setSeed1(formatResult(r));
              setPicked1({
                title: r.title,
                artist: r.artist,
                year: r.year ?? null,
                id: r.id ?? null,
              });
              setR1([]);
            }}
          />

          <SeedInput
            label="Song 2"
            placeholder="Search by title or artist…"
            value={seed2}
            onValueChange={(v) => {
              setSeed2(v);
              setPicked2(null);
            }}
            results={r2}
            loading={loading2}
            onPick={(r) => {
              setSeed2(formatResult(r));
              setPicked2({
                title: r.title,
                artist: r.artist,
                year: r.year ?? null,
                id: r.id ?? null,
              });
              setR2([]);
            }}
          />

          <SeedInput
            label="Song 3"
            placeholder="Search by title or artist…"
            value={seed3}
            onValueChange={(v) => {
              setSeed3(v);
              setPicked3(null);
            }}
            results={r3}
            loading={loading3}
            onPick={(r) => {
              setSeed3(formatResult(r));
              setPicked3({
                title: r.title,
                artist: r.artist,
                year: r.year ?? null,
                id: r.id ?? null,
              });
              setR3([]);
            }}
          />
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Popularity mode</span>
              </div>

              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="all">All</option>
                <option value="indie">Indie</option>
                <option value="mainstream">Mainstream</option>
              </select>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              Indie filters for lower popularity; Mainstream filters for higher popularity.
            </p>
          </div>

          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={onSubmit}
            className="h-11 rounded-2xl bg-black px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Generating…" : "Get recommendations"}
          </button>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {/* ✅ Shared audio control for previews */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-medium">Preview Player</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {nowPlaying ? `Now playing: ${nowPlaying}` : "Click “Play preview” on a result (Spotify preview is 30s)."}
        </div>
        <audio
          ref={audioRef}
          controls
          className="mt-3 w-full"
          onEnded={() => {
            setPlayingId("");
            setNowPlaying("");
          }}
        />
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Results</h2>

        {recs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No recommendations yet — add songs and click “Get recommendations”.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recs.map((r) => (
              <div
                key={r.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="aspect-[16/10] w-full bg-muted">
                  {r.imageUrl ? (
                    <img
                      src={r.imageUrl}
                      alt={r.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white bg-muted">
                      ♪
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.artist}
                    {r.year ? ` • ${r.year}` : ""}
                  </div>

                  {/* ✅ Preview + Spotify buttons */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => playPreview(r)}
                      disabled={!r.previewUrl && !r.spotifyUrl}
                      className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      title={r.previewUrl ? "Play 30s preview" : r.spotifyUrl ? "Open in Spotify" : "No preview available"}
                    >
                      {playingId === r.id ? (
                        <>
                          <Pause className="h-4 w-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" /> Play preview
                        </>
                      )}
                    </button>

                    {r.spotifyUrl ? (
                      <button
                        type="button"
                        onClick={() => window.open(r.spotifyUrl!, "_blank")}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium"
                      >
                        <ExternalLink className="h-4 w-4" /> Spotify
                      </button>
                    ) : null}
                  </div>

                  {!r.previewUrl && r.spotifyUrl ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      No preview available for this track — Spotify link will open instead.
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
