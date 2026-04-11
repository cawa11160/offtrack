import { useEffect, useState } from "react";
import { apiCreateReel, apiListReels, apiUrl, type ReelItem } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

export default function LyricAI() {
  const [lyrics, setLyrics] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [outputMode, setOutputMode] = useState<"video" | "images">("video");
  const [imageCount, setImageCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [latest, setLatest] = useState<ReelItem | null>(null);
  const [history, setHistory] = useState<ReelItem[]>([]);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [provider, setProvider] = useState("");

  async function refreshHistory() {
    const rows = await apiListReels(10).catch(() => []);
    setHistory(rows);
  }

  useEffect(() => {
    refreshHistory();
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
      const r = await apiCreateReel({
        lyrics: text,
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
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-white pb-44">
      <section className="mx-auto w-full max-w-[1303px] px-3 py-5 sm:px-7 sm:py-7">
        <div className="mx-auto mt-10 w-full max-w-[1202px] rounded-[10px] bg-[#d9d9d9] p-5 sm:mt-16 sm:p-8">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <h1 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-tight text-black sm:text-[40px]">
                Transform your lyrics into visuals
              </h1>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Song title (optional)"
                  className="h-11 rounded-[10px] bg-[#cfcfcf] px-4 font-['Arimo',sans-serif] text-[18px] font-bold text-black/80 outline-none placeholder:text-black/60"
                />
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name (optional)"
                  className="h-11 rounded-[10px] bg-[#cfcfcf] px-4 font-['Arimo',sans-serif] text-[18px] font-bold text-black/80 outline-none placeholder:text-black/60"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex h-11 items-center rounded-[10px] bg-[#cfcfcf] px-2">
                  <button
                    type="button"
                    onClick={() => setOutputMode("video")}
                    className={`h-8 flex-1 rounded-[8px] font-['Arimo',sans-serif] text-sm font-bold ${
                      outputMode === "video" ? "bg-black text-white" : "text-black/70"
                    }`}
                  >
                    Short reel (MP4)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputMode("images")}
                    className={`h-8 flex-1 rounded-[8px] font-['Arimo',sans-serif] text-sm font-bold ${
                      outputMode === "images" ? "bg-black text-white" : "text-black/70"
                    }`}
                  >
                    Images
                  </button>
                </div>
                <div className="flex items-center gap-3 rounded-[10px] bg-[#cfcfcf] px-4">
                  <label className="font-['Arimo',sans-serif] text-sm font-bold text-black/70">Frames</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={imageCount}
                    onChange={(e) => {
                      const n = Number(e.target.value || 4);
                      setImageCount(Math.max(1, Math.min(8, Number.isFinite(n) ? n : 4)));
                    }}
                    className="h-8 w-16 rounded-[8px] bg-white px-2 text-center font-['Arimo',sans-serif] text-sm font-bold text-black outline-none"
                  />
                </div>
              </div>

              <div className="h-[219px] rounded-[4px] bg-[#cfcfcf] px-[35px] py-[20px]">
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Type in your music lyrics..."
                  className="h-full w-full resize-none bg-transparent font-['Arimo',sans-serif] text-[28px] font-bold leading-tight text-black/80 outline-none placeholder:text-black/60 sm:text-[40px]"
                />
              </div>

              {error ? (
                <div className="rounded-[10px] bg-white/70 px-4 py-3 font-['Arimo',sans-serif] text-[16px] font-bold text-red-700">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="h-[47px] w-full max-w-[378px] rounded-[10px] bg-[#ff9494] font-['Arimo',sans-serif] text-[20px] font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Generating..." : outputMode === "video" ? "Generate Reel" : "Generate Images"}
              </button>
            </div>

            {generatedImages.length > 0 ? (
              <div className="rounded-[10px] bg-white/70 p-4">
                <div className="font-['Arimo',sans-serif] text-[18px] font-bold text-black">
                  Generated images {provider ? `(${provider})` : ""}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {generatedImages.map((src, idx) => (
                    <img
                      key={`${idx}-${src.slice(0, 20)}`}
                      src={src}
                      alt={`Generated frame ${idx + 1}`}
                      className="w-full rounded-[10px] bg-black object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {latest?.downloadUrl ? (
              <div className="rounded-[10px] bg-white/70 p-4">
                <div className="font-['Arimo',sans-serif] text-[18px] font-bold text-black">Latest reel</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <video controls className="w-full rounded-[10px] bg-black" src={apiUrl(latest.downloadUrl)} />
                  <div className="flex flex-col justify-between gap-3">
                    <a
                      className="inline-flex h-[47px] items-center justify-center rounded-[10px] bg-black px-4 font-['Arimo',sans-serif] text-[18px] font-bold text-white"
                      href={apiUrl(latest.downloadUrl)}
                      download
                    >
                      Download MP4
                    </a>
                    <div className="text-sm text-black/70">Visual provider: {provider || "local"}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {history.length > 0 ? (
              <div className="rounded-[10px] bg-white/60 p-4">
                <div className="font-['Arimo',sans-serif] text-[18px] font-bold text-black">Recent reels</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {history.slice(0, 6).map((r) => (
                    <a
                      key={r.id}
                      href={r.downloadUrl ? apiUrl(r.downloadUrl) : "#"}
                      className="rounded-[10px] bg-[#cfcfcf] p-3 text-sm font-bold"
                      download
                    >
                      Reel {r.id.slice(0, 8)}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
