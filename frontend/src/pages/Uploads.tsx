import { useEffect, useMemo, useState } from "react";
import { UploadCloud, Music2, RefreshCcw } from "lucide-react";
import { apiListUploads, apiUploadNewTrack, apiUrl, type UploadedTrackItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "@/lib/errors";

export default function Uploads() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [tracks, setTracks] = useState<UploadedTrackItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const t = await apiListUploads(50);
      setTracks(t);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load uploads"));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const canUpload = useMemo(() => title.trim().length > 0 && !!file && !loading, [title, file, loading]);

  useEffect(() => {
    if (!authLoading && !user) {
      setError("Please log in as an artist to upload songs.");
    }
  }, [authLoading, user]);

  async function onUpload() {
    if (!user) {
      setError("Please log in as an artist to upload songs.");
      return;
    }
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      await apiUploadNewTrack({ title: title.trim(), artist: artist.trim(), file });
      setTitle("");
      setArtist("");
      setFile(null);
      await refresh();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Upload failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black text-white">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Uploads</div>
            <div className="text-base text-muted-foreground">Upload full songs (MP3/WAV/M4A) and stream them.</div>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium"
          disabled={refreshing}
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Song title"
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Artist</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Artist name"
            />
          </div>
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Audio file</label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            Tip: Browsers need Range support for seeking — the backend streams with Range headers.
          </div>
          <button
            type="button"
            onClick={onUpload}
            disabled={!canUpload || !user}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        {!user ? (
          <div className="mt-3 text-sm text-black/70">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-black/5"
            >
              Log in to upload
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4">
        {tracks.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No uploads yet. Upload a song above.
          </div>
        ) : (
          tracks.map((t) => (
            <div key={t.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black/5">
                  <Music2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{t.title}</div>
                  <div className="text-sm text-muted-foreground">{t.artist || ""}</div>
                </div>
              </div>

              <audio controls preload="none" src={apiUrl(t.audioUrl)} className="w-full md:w-[420px]" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
