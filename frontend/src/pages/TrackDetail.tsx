import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Play, Pause } from "lucide-react";
import { apiGetTrackDetail, apiUrl, type TrackDetail } from "@/lib/api";
import { getErrorMessage, getErrorStatus } from "@/lib/errors";
import { extractSpotifyTrackId, fetchSpotifyStatus, initSpotifyPlayer, playSpotifyTrack, type SpotifySession } from "@/lib/spotify";

function msToClock(ms?: number | null) {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fallbackCover(title: string, artist: string) {
  const text = encodeURIComponent(`${title} ${artist}`.trim() || "music");
  return `https://picsum.photos/seed/${text}/800/800`;
}

export default function TrackDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [sp] = useSearchParams();
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spotifySessionRef = useRef<SpotifySession | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const data = await apiGetTrackDetail({
          trackId: id,
          title: sp.get("title") || undefined,
          artist: sp.get("artist") || undefined,
        });
        if (!alive) return;
        setTrack(data);
      } catch (e: unknown) {
        if (!alive) return;
        setError(getErrorMessage(e, "Failed to load track"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, sp]);

  const playableSrc = useMemo(() => {
    if (!track) return "";
    const src = track.audioUrl ? apiUrl(track.audioUrl) : (track.previewUrl || "");
    return src;
  }, [track]);

  const spotifyTrackId = useMemo(
    () => extractSpotifyTrackId(track?.spotifyUri || track?.spotifyUrl || ""),
    [track?.spotifyUri, track?.spotifyUrl]
  );

  const spotifyEmbedUrl = useMemo(
    () => (spotifyTrackId ? `https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator` : ""),
    [spotifyTrackId]
  );

  async function onPlayPause() {
    const a = audioRef.current;
    if (!track) return;
    if (a && playableSrc) {
      if (!a.paused) {
        a.pause();
        setIsPlaying(false);
        return;
      }
      try {
        a.src = playableSrc;
        await a.play();
        setIsPlaying(true);
        return;
      } catch {
        // fall through to Spotify in-app playback
      }
    }

    // Keep playback in-platform via Spotify Web Playback SDK.
    if (spotifyTrackId) {
      try {
        const base = apiUrl("");
        const status = await fetchSpotifyStatus(base).catch(() => ({ ok: false, configured: false, hasRefreshCookie: false }));
        if (!status.configured) {
          setError("Spotify is not configured on backend.");
          setShowEmbed(true);
          return;
        }
        if (!status.hasRefreshCookie) {
          window.location.href = apiUrl("/api/spotify/login");
          return;
        }

        if (!spotifySessionRef.current) {
          spotifySessionRef.current = await initSpotifyPlayer(base);
        }
        await playSpotifyTrack(base, spotifySessionRef.current.deviceId, spotifyTrackId);
        setIsPlaying(true);
        setShowEmbed(false);
        return;
      } catch (e: unknown) {
        const status = getErrorStatus(e);
        if (status === 401) {
          // One-time auth flow, then comes back to app.
          window.location.href = apiUrl("/api/spotify/login");
          return;
        }
        // SDK can fail for non-premium or blocked autoplay. Keep playback in-app with embed.
        setShowEmbed(true);
        setError(getErrorMessage(e, "SDK playback unavailable in this browser/account. Use embedded player below."));
        return;
      }
    }

    setError("No playable source available for this song.");
  }

  return (
    <div className="min-h-[calc(100vh-var(--player-height))] bg-white pb-44">
      <section className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#d0d0d0] px-3 py-2 font-bold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {loading ? <div className="mt-6 text-lg font-bold text-black/70">Loading track...</div> : null}
        {error ? (
          <div className="mt-6 rounded-[10px] bg-red-50 px-4 py-3 text-red-700">{error}</div>
        ) : null}

        {track ? (
          <div className="mt-6 grid gap-6 rounded-[12px] bg-[#d0d0d0] p-5 md:grid-cols-[320px_1fr]">
            <img
              src={(track.imageUrl || "").trim() || fallbackCover(track.title, track.artist || "")}
              alt={`${track.title} cover`}
              className="h-[320px] w-[320px] rounded-[10px] object-cover"
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.src.includes("picsum.photos")) {
                  el.src = fallbackCover(track.title, track.artist || "");
                }
              }}
            />

            <div className="min-w-0">
              <h1 className="truncate font-['Arimo',sans-serif] text-[40px] font-bold leading-none text-black">
                {track.title}
              </h1>
              <p className="mt-2 text-[24px] font-bold text-black/80">{track.artist || "Unknown Artist"}</p>
              <p className="mt-4 text-[18px] font-bold text-black/70">Duration: {msToClock(track.durationMs)}</p>
              <p className="mt-1 text-[16px] font-bold text-black/50">Source: {track.source || "unknown"}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onPlayPause}
                  className="inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-[#ff9494] px-5 font-['Arimo',sans-serif] text-[20px] font-bold text-black"
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  {isPlaying ? "Pause" : "Play"}
                </button>

                <a
                  href={track.spotifyUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex h-[46px] items-center gap-2 rounded-[10px] px-5 font-['Arimo',sans-serif] text-[18px] font-bold ${
                    track.spotifyUrl ? "bg-black text-white" : "pointer-events-none bg-black/30 text-white/70"
                  }`}
                >
                  Open in Spotify
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              {showEmbed && spotifyEmbedUrl ? (
                <div className="mt-5 overflow-hidden rounded-[12px] bg-white p-2">
                  <iframe
                    title="Spotify Player"
                    src={spotifyEmbedUrl}
                    width="100%"
                    height="152"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <audio
          ref={audioRef}
          className="hidden"
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      </section>
    </div>
  );
}
