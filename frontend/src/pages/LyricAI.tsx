import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  FileImage,
  History,
  Image,
  Loader2,
  Music2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiCreateReel, apiListReels, apiUrl, type ReelItem } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

const stylePresets = [
  "Cinematic",
  "Dream pop",
  "Street documentary",
  "Analog film",
  "Neon stage",
  "Minimal studio",
];

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function lineCount(text: string) {
  return text.trim() ? text.trim().split(/\n+/).filter(Boolean).length : 0;
}

export default function LyricAI() {
  const navigate = useNavigate();
  const [lyrics, setLyrics] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [style, setStyle] = useState(stylePresets[0]);
  const [outputMode, setOutputMode] = useState<"video" | "images">("video");
  const [imageCount, setImageCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [latest, setLatest] = useState<ReelItem | null>(null);
  const [history, setHistory] = useState<ReelItem[]>([]);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [provider, setProvider] = useState("");

  const stats = useMemo(
    () => ({
      words: wordCount(lyrics),
      lines: lineCount(lyrics),
      frames: outputMode === "images" ? imageCount : Math.max(4, imageCount),
    }),
    [imageCount, lyrics, outputMode]
  );

  async function refreshHistory() {
    setHistoryLoading(true);
    const rows = await apiListReels(12).catch(() => []);
    setHistory(rows);
    setHistoryLoading(false);
  }

  useEffect(() => {
    void refreshHistory();
  }, []);

  async function onGenerate() {
    setError("");
    const text = lyrics.trim();
    if (!text) {
      setError("Please paste your lyrics first.");
      return;
    }
    setLoading(true);
    setGeneratedImages([]);
    setProvider("");
    try {
      const styledLyrics = `${text}\n\nVisual direction: ${style}`;
      const r = await apiCreateReel({
        lyrics: styledLyrics,
        title: title.trim() || undefined,
        artist: artist.trim() || undefined,
        output: outputMode,
        imageCount,
      });
      setProvider(r.provider || "");
      if (r.mode === "images" || outputMode === "images") {
        setLatest(null);
        setGeneratedImages(r.imageDataUrls ?? []);
        if (r.detail) setError(r.detail);
      } else {
        setLatest(r);
        await refreshHistory();
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to generate output"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-md text-black transition-colors hover:bg-black/5"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="grid h-11 w-11 place-items-center rounded-md border border-black/10 bg-white">
              <Music2 className="h-6 w-6 text-black" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshHistory()}
            className="grid h-10 w-10 place-items-center rounded-md border border-black/10 bg-white hover:bg-black/5"
            aria-label="Refresh history"
          >
            <RefreshCw className={`h-5 w-5 ${historyLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Lyric AI</p>
          <h1 className="mt-1 text-4xl font-bold leading-none sm:text-5xl">Visual studio</h1>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title"
                className="h-12 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold outline-none placeholder:text-black/35"
              />
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist name"
                className="h-12 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold outline-none placeholder:text-black/35"
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="flex h-12 items-center rounded-md border border-black/10 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setOutputMode("video")}
                  className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded text-sm font-semibold ${
                    outputMode === "video" ? "bg-black text-white" : "text-black/60 hover:bg-black/5"
                  }`}
                >
                  <Clapperboard className="h-4 w-4" />
                  Reel
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode("images")}
                  className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded text-sm font-semibold ${
                    outputMode === "images" ? "bg-black text-white" : "text-black/60 hover:bg-black/5"
                  }`}
                >
                  <FileImage className="h-4 w-4" />
                  Images
                </button>
              </div>
              <label className="flex h-12 items-center justify-between gap-3 rounded-md border border-black/10 bg-white px-4">
                <span className="text-sm font-semibold text-black/55">Frames</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={imageCount}
                  onChange={(e) => {
                    const n = Number(e.target.value || 4);
                    setImageCount(Math.max(1, Math.min(8, Number.isFinite(n) ? n : 4)));
                  }}
                  className="h-8 w-16 rounded border border-black/10 text-center text-sm font-bold outline-none"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-black/55">Style</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {stylePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStyle(preset)}
                    className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
                      style === preset ? "bg-black text-white" : "border border-black/10 bg-white hover:bg-black/5"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-black/10 bg-white p-3">
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste lyrics here..."
                className="h-[300px] w-full resize-none bg-transparent text-base font-semibold leading-relaxed outline-none placeholder:text-black/35"
              />
              <div className="mt-3 flex flex-wrap gap-2 border-t border-black/10 pt-3 text-xs font-bold text-black/50">
                <span>{stats.words} words</span>
                <span>{stats.lines} lines</span>
                <span>{stats.frames} frames</span>
                <span>{style}</span>
              </div>
            </div>

            {error ? <div className="mt-4 rounded-md border border-[#e85d4f]/30 bg-white px-4 py-3 text-sm font-semibold text-[#9f2f26]">{error}</div> : null}

            <button
              type="button"
              onClick={onGenerate}
              disabled={loading}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-black text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {loading ? "Generating" : outputMode === "video" ? "Generate reel" : "Generate images"}
            </button>
          </main>

          <aside className="grid gap-5">
            <section className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Output</h2>
                <Sparkles className="h-5 w-5 text-black/45" />
              </div>
              <div className="mt-4">
                {generatedImages.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {generatedImages.map((src, idx) => (
                      <img key={`${idx}-${src.slice(0, 20)}`} src={src} alt={`Generated frame ${idx + 1}`} className="w-full rounded-md bg-black object-cover" />
                    ))}
                  </div>
                ) : latest?.downloadUrl ? (
                  <div className="grid gap-3">
                    <video controls className="w-full rounded-md bg-black" src={apiUrl(latest.downloadUrl)} />
                    <a
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"
                      href={apiUrl(latest.downloadUrl)}
                      download
                    >
                      <Download className="h-4 w-4" />
                      Download MP4
                    </a>
                  </div>
                ) : (
                  <div className="grid min-h-[260px] place-items-center rounded-md bg-[#f8f7f2] text-center">
                    <div>
                      <Image className="mx-auto h-8 w-8 text-black/45" />
                      <p className="mt-3 text-sm font-semibold text-black/50">No output yet</p>
                    </div>
                  </div>
                )}
              </div>
              {provider ? <p className="mt-3 text-xs font-semibold text-black/45">Provider: {provider}</p> : null}
            </section>

            <section className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5" />
                <h2 className="text-xl font-bold">Recent reels</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {history.length ? (
                  history.slice(0, 8).map((r) => (
                    <a
                      key={r.id}
                      href={r.downloadUrl ? apiUrl(r.downloadUrl) : "#"}
                      className="flex h-11 items-center justify-between rounded-md bg-white px-3 text-sm font-semibold transition hover:bg-black/5"
                      download
                    >
                      <span>Reel {r.id.slice(0, 8)}</span>
                      <Download className="h-4 w-4 text-black/45" />
                    </a>
                  ))
                ) : (
                  <div className="grid min-h-[110px] place-items-center rounded-md bg-white text-sm font-semibold text-black/50">No recent reels</div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
