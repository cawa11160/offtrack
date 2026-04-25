import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Image, Music2, RefreshCcw, Save, Trash2, UploadCloud, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  apiListManagedUploads,
  apiListUploads,
  apiReplaceUploadAudio,
  apiUnpublishUpload,
  apiUpdateUpload,
  apiUploadNewTrack,
  apiUrl,
  type UploadedTrackItem,
} from "@/lib/api";
import { apiResendEmailVerification, useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";

type EditState = {
  title: string;
  artist: string;
  imageUrl: string;
};

function formatBytes(size?: number) {
  const value = Number(size || 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  return `${n.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function editFromTrack(track: UploadedTrackItem): EditState {
  return {
    title: track.title || "",
    artist: track.artist || "",
    imageUrl: track.imageUrl || "",
  };
}

export default function Uploads() {
  const { user, token, loading: authLoading, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [tracks, setTracks] = useState<UploadedTrackItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyByTrack, setBusyByTrack] = useState<Record<string, boolean>>({});
  const [editByTrack, setEditByTrack] = useState<Record<string, EditState>>({});
  const [replaceFileByTrack, setReplaceFileByTrack] = useState<Record<string, File | null>>({});
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const isArtist = user?.account_type === "artist";
  const emailVerified = Boolean(user?.email_verified);
  const canManageUploads = isArtist && emailVerified;

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const next = canManageUploads ? await apiListManagedUploads(100) : await apiListUploads(50);
      setTracks(next);
      setEditByTrack(Object.fromEntries(next.map((item) => [item.id, editFromTrack(item)])));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load uploads"));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canManageUploads]);

  const canUpload = useMemo(
    () => title.trim().length > 0 && !!file && !loading && canManageUploads,
    [title, file, loading, canManageUploads]
  );

  useEffect(() => {
    if (!authLoading && !user) {
      setError("Please log in as an artist to upload songs.");
    } else if (!authLoading && user && !isArtist) {
      setError("Uploads require an artist account.");
    } else if (!authLoading && isArtist && !emailVerified) {
      setError("Verify your email before uploading songs.");
    } else if (!authLoading) {
      setError("");
    }
  }, [authLoading, user, isArtist, emailVerified]);

  async function onUpload() {
    if (!user || !isArtist) {
      setError("Please log in as an artist to upload songs.");
      return;
    }
    if (!emailVerified) {
      setError("Verify your email before uploading songs.");
      return;
    }
    if (!title.trim()) {
      setError("Enter a song title.");
      return;
    }
    if (!file) {
      setError("Choose an audio file.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiUploadNewTrack({ title: title.trim(), artist: artist.trim(), imageUrl: imageUrl.trim(), file });
      setTitle("");
      setArtist("");
      setImageUrl("");
      setFile(null);
      await refresh();
      toast.success("Song uploaded", { description: "Your track is now published in Offtrack uploads." });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Upload failed");
      setError(message);
      toast.error("Upload failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!token) return;
    setVerificationBusy(true);
    setError("");
    try {
      const result = await apiResendEmailVerification(token);
      setVerificationUrl(result.email_verification_url || "");
      await refreshMe();
      toast.success("Verification link ready", {
        description: result.email_verification_url ? "Open the link, then refresh your status." : "If email delivery is configured, check your inbox.",
      });
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not send verification email");
      setError(message);
      toast.error("Could not send verification email", { description: message });
    } finally {
      setVerificationBusy(false);
    }
  }

  async function saveTrack(track: UploadedTrackItem) {
    const edit = editByTrack[track.id];
    if (!edit) return;
    setBusyByTrack((prev) => ({ ...prev, [track.id]: true }));
    setError("");
    try {
      const updated = await apiUpdateUpload({
        id: track.id,
        title: edit.title.trim(),
        artist: edit.artist.trim(),
        imageUrl: edit.imageUrl.trim(),
      });
      setTracks((prev) => prev.map((item) => (item.id === track.id ? updated : item)));
      setEditByTrack((prev) => ({ ...prev, [track.id]: editFromTrack(updated) }));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to save upload"));
    } finally {
      setBusyByTrack((prev) => ({ ...prev, [track.id]: false }));
    }
  }

  async function replaceAudio(track: UploadedTrackItem) {
    const nextFile = replaceFileByTrack[track.id];
    if (!nextFile) return;
    setBusyByTrack((prev) => ({ ...prev, [track.id]: true }));
    setError("");
    try {
      const updated = await apiReplaceUploadAudio({ id: track.id, file: nextFile });
      setTracks((prev) => prev.map((item) => (item.id === track.id ? updated : item)));
      setReplaceFileByTrack((prev) => ({ ...prev, [track.id]: null }));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to replace audio"));
    } finally {
      setBusyByTrack((prev) => ({ ...prev, [track.id]: false }));
    }
  }

  async function setPublished(track: UploadedTrackItem, isPublished: boolean) {
    setBusyByTrack((prev) => ({ ...prev, [track.id]: true }));
    setError("");
    try {
      const updated = await apiUpdateUpload({ id: track.id, isPublished });
      setTracks((prev) => prev.map((item) => (item.id === track.id ? updated : item)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to update publish state"));
    } finally {
      setBusyByTrack((prev) => ({ ...prev, [track.id]: false }));
    }
  }

  async function unpublishTrack(track: UploadedTrackItem) {
    if (!window.confirm(`Unpublish "${track.title}"? It will disappear from public playback lists.`)) return;
    setBusyByTrack((prev) => ({ ...prev, [track.id]: true }));
    setError("");
    try {
      const updated = await apiUnpublishUpload(track.id);
      if (updated) {
        setTracks((prev) => prev.map((item) => (item.id === track.id ? updated : item)));
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to unpublish upload"));
    } finally {
      setBusyByTrack((prev) => ({ ...prev, [track.id]: false }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black text-white">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Uploads</div>
            <div className="text-base text-muted-foreground">
              Upload full songs, manage metadata, replace audio, and control public playback.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium"
          disabled={refreshing}
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className={`rounded-xl border p-4 ${user ? "border-border bg-background" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UserRound className="h-4 w-4" />
              Account
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {user ? `${user.name || user.email} (${user.account_type || "listener"})` : "Log in to upload songs."}
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${isArtist ? "border-green-200 bg-green-50" : "border-border bg-background"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Music2 className="h-4 w-4" />
              Artist access
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{isArtist ? "Enabled" : "Artist account required"}</div>
          </div>
          <div className={`rounded-xl border p-4 ${emailVerified ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Email
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{emailVerified ? "Verified" : "Verification required"}</div>
          </div>
        </div>

        {!user ? (
          <div className="mb-4 rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
            <div className="font-semibold text-black">Log in with an artist account to upload songs.</div>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-3 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Log in
            </button>
          </div>
        ) : null}

        {user && !isArtist ? (
          <div className="mb-4 rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
            <div className="font-semibold text-black">Artist account required.</div>
            <div className="mt-1">Listener accounts can play public uploads, but they cannot upload songs or manage artist tracks.</div>
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="mt-3 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Open profile
            </button>
          </div>
        ) : null}

        {canManageUploads ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Song title"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Artist</label>
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Artist name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Cover image URL</label>
                <div className="mt-1 flex rounded-xl border border-border bg-background">
                  <span className="grid w-10 place-items-center text-muted-foreground">
                    <Image className="h-4 w-4" />
                  </span>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2 text-sm outline-none"
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div>
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
              <div className="text-xs text-muted-foreground">New uploads are owned by your artist account.</div>
              <button
                type="button"
                onClick={() => void onUpload()}
                disabled={!canUpload}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </>
        ) : null}

        {isArtist && !emailVerified ? (
          <div className="mt-3 rounded-xl border border-black/10 bg-white p-3 text-sm text-black/70">
            <div>Email verification is required for artist uploads.</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void resendVerification()}
                disabled={verificationBusy}
                className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-black/5 disabled:opacity-60"
              >
                {verificationBusy ? "Sending..." : "Send verification link"}
              </button>
              {verificationUrl ? (
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-black/10 px-3 py-1 font-medium underline underline-offset-4 hover:bg-black/5"
                >
                  Open verification link
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void refreshMe()}
                className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-black/5"
              >
                I verified, refresh status
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        {!isArtist ? (
          <div className="mt-3 text-sm text-black/70">
            <button
              type="button"
              onClick={() => (user ? navigate("/profile") : navigate("/login"))}
              className="rounded-lg border border-black/10 px-3 py-1 font-medium hover:bg-black/5"
            >
              {user ? "Open profile" : "Log in to upload"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4">
        {tracks.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            {canManageUploads ? "No uploads yet. Upload a song above." : "No public uploads yet."}
          </div>
        ) : (
          tracks.map((track) => {
            const edit = editByTrack[track.id] || editFromTrack(track);
            const busy = Boolean(busyByTrack[track.id]);
            const replacement = replaceFileByTrack[track.id];
            return (
              <div key={track.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/5">
                      <Music2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {canManageUploads ? (
                        <div className="grid gap-2 md:grid-cols-3">
                          <input
                            value={edit.title}
                            onChange={(e) =>
                              setEditByTrack((prev) => ({ ...prev, [track.id]: { ...edit, title: e.target.value } }))
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
                            placeholder="Title"
                          />
                          <input
                            value={edit.artist}
                            onChange={(e) =>
                              setEditByTrack((prev) => ({ ...prev, [track.id]: { ...edit, artist: e.target.value } }))
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Artist"
                          />
                          <input
                            value={edit.imageUrl}
                            onChange={(e) =>
                              setEditByTrack((prev) => ({ ...prev, [track.id]: { ...edit, imageUrl: e.target.value } }))
                            }
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                            placeholder="Image URL"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="font-semibold">{track.title}</div>
                          <div className="text-sm text-muted-foreground">{track.artist || ""}</div>
                        </>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-lg bg-black/5 px-2 py-1">{track.storageBackend || "unknown"}</span>
                        <span className="rounded-lg bg-black/5 px-2 py-1">{track.mimeType || "audio"}</span>
                        <span className="rounded-lg bg-black/5 px-2 py-1">{formatBytes(track.sizeBytes)}</span>
                        <span className="rounded-lg bg-black/5 px-2 py-1">{formatDuration(track.durationMs)}</span>
                        <span className="rounded-lg bg-black/5 px-2 py-1">{track.processingStatus || "ready"}</span>
                        <span className="rounded-lg bg-black/5 px-2 py-1">
                          {track.isPublished === false ? "Unpublished" : "Published"}
                        </span>
                      </div>

                      {track.waveformPeaks && track.waveformPeaks.length > 0 ? (
                        <div className="mt-3 flex h-10 items-center gap-[2px] rounded-xl bg-black/5 px-2">
                          {track.waveformPeaks.slice(0, 64).map((peak, idx) => (
                            <span
                              key={`${track.id}-peak-${idx}`}
                              className="w-full rounded-full bg-black/50"
                              style={{ height: `${Math.max(8, Math.min(100, Number(peak || 0) * 100))}%` }}
                            />
                          ))}
                        </div>
                      ) : null}

                      {track.processingError ? (
                        <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{track.processingError}</div>
                      ) : null}

                      {canManageUploads ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) =>
                              setReplaceFileByTrack((prev) => ({ ...prev, [track.id]: e.target.files?.[0] ?? null }))
                            }
                            className="max-w-[260px] rounded-xl border border-border bg-background px-3 py-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void replaceAudio(track)}
                            disabled={busy || !replacement}
                            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            Replace audio
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {canManageUploads ? (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => void saveTrack(track)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => void setPublished(track, track.isPublished === false)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                      >
                        {track.isPublished === false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {track.isPublished === false ? "Publish" : "Hide"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void unpublishTrack(track)}
                        disabled={busy || track.isPublished === false}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Unpublish
                      </button>
                    </div>
                  ) : null}
                </div>

                {track.audioUrl ? (
                  <audio controls preload="none" src={apiUrl(track.audioUrl)} className="mt-4 w-full" />
                ) : (
                  <div className="mt-4 rounded-xl bg-black/5 px-3 py-2 text-sm text-muted-foreground">No playable audio asset.</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
