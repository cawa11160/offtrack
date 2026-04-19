import React, { useEffect, useRef, useState } from "react";
import { usePlaybackMilestones } from "@/lib/playbackTracking";

export type TrackPlayable = {
  id?: string | null;
  title: string;
  artist: string;
  imageUrl?: string | null;
  previewUrl?: string | null;
  audioUrl?: string | null;
  spotifyUrl?: string | null;
  durationMs?: number | null;
};

export default function AudioPlayerBar({
  track,
  onClose,
}: {
  track: TrackPlayable | null;
  onClose: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const playback = usePlaybackMilestones("audio_player_bar");

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setT(0);
    setIsPlaying(false);

    // auto-play when a new playable track is selected
    const src = track?.audioUrl || track?.previewUrl || "";
    if (src) {
      audioRef.current.src = src;
      audioRef.current.load();
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        playback.start(
          { id: track?.id, title: track?.title, artist: track?.artist, sourceKind: track?.audioUrl ? "upload" : "preview" },
          track?.durationMs ?? undefined
        );
      }).catch(() => setIsPlaying(false));
    }
  }, [playback, track?.id, track?.audioUrl, track?.previewUrl, track?.title, track?.artist, track?.durationMs]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => {
      setT(a.currentTime || 0);
      playback.progress(a.currentTime || 0, Number.isFinite(a.duration) ? a.duration : undefined);
    };
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => {
      playback.progress(a.currentTime || 0, Number.isFinite(a.duration) ? a.duration : undefined);
      playback.complete();
      setIsPlaying(false);
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [playback]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!(track?.audioUrl || track?.previewUrl)) return;

    if (a.paused) {
      try {
        await a.play();
        setIsPlaying(true);
        playback.start(
          { id: track?.id, title: track?.title, artist: track?.artist, sourceKind: track?.audioUrl ? "upload" : "preview" },
          track?.durationMs ?? undefined
        );
      } catch {
        setIsPlaying(false);
      }
    } else {
      a.pause();
      setIsPlaying(false);
      playback.skip();
    }
  };

  const seek = (x: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(dur, x));
  };

  if (!track) return null;

  const disabled = !track.audioUrl && !track.previewUrl;

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: 12, background: "#111", color: "#fff", display: "flex", gap: 12, alignItems: "center" }}>
      <audio ref={audioRef} />

      <img
        src={track.imageUrl || ""}
        alt=""
        style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, background: "#222" }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {track.title}
        </div>
        <div style={{ opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {track.artist}
          {track.spotifyUrl ? (
            <>
              {" · "}
              <a href={track.spotifyUrl} target="_blank" rel="noreferrer" style={{ color: "#7dd3fc" }}>
                Open in Spotify
              </a>
            </>
          ) : null}
        </div>

        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.01}
          value={t}
          onChange={(e) => seek(parseFloat(e.target.value))}
          disabled={disabled}
          style={{ width: "100%" }}
        />
      </div>

      <button onClick={toggle} disabled={disabled} style={{ padding: "8px 12px" }}>
        {disabled ? "No preview" : isPlaying ? "Pause" : "Play"}
      </button>

      <button onClick={() => { playback.skip(); audioRef.current?.pause(); setIsPlaying(false); onClose(); }} style={{ padding: "8px 12px" }}>
        Close
      </button>
    </div>
  );
}
