import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Repeat1,
  Shuffle,
  Heart,
  Maximize2,
  ListMusic,
  Mic2,
  Airplay,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { currentTrack } from "@/data/mockData";
import { Slider } from "@/components/ui/slider";
import { ExpandedPlayer } from "@/components/player/ExpandedPlayer";

type RepeatMode = "off" | "all" | "one";

function formatTimeFromPercent(durationLabel: string, percent: number) {
  const parts = durationLabel.split(":").map((x) => Number(x));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return "0:00";

  const totalSeconds = parts[0] * 60 + parts[1];
  const currentSeconds = Math.max(
    0,
    Math.min(totalSeconds, Math.round((percent / 100) * totalSeconds))
  );

  const m = Math.floor(currentSeconds / 60);
  const s = currentSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const PlayerBar = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  // 0..100
  const [progress, setProgress] = useState<number[]>([35]);
  const [volume, setVolume] = useState<number[]>([75]);

  const [isLiked, setIsLiked] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Extra toggles (UI only)
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");

  const [lyricsOn, setLyricsOn] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [airplayOn, setAirplayOn] = useState(false);

  // ✅ Auto-dismiss timer for panels
  const hidePanelsTimerRef = useRef<number | null>(null);
  const PANEL_AUTO_HIDE_MS = 3000;

  useEffect(() => {
    const anyPanelOpen = lyricsOn || queueOpen || airplayOn;

    // clear existing timer
    if (hidePanelsTimerRef.current) {
      window.clearTimeout(hidePanelsTimerRef.current);
      hidePanelsTimerRef.current = null;
    }

    // start a new timer whenever any panel opens
    if (anyPanelOpen) {
      hidePanelsTimerRef.current = window.setTimeout(() => {
        setLyricsOn(false);
        setQueueOpen(false);
        setAirplayOn(false);
        hidePanelsTimerRef.current = null;
      }, PANEL_AUTO_HIDE_MS);
    }

    // cleanup on unmount
    return () => {
      if (hidePanelsTimerRef.current) {
        window.clearTimeout(hidePanelsTimerRef.current);
        hidePanelsTimerRef.current = null;
      }
    };
  }, [lyricsOn, queueOpen, airplayOn]);

  const elapsed = useMemo(
    () => formatTimeFromPercent(currentTrack.duration, progress[0] ?? 0),
    [progress]
  );

  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  const cycleRepeat = () => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  };

  const activeIconClass = "text-black";
  const inactiveIconClass = "text-black/60 hover:text-black";

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="pointer-events-auto mx-auto w-[min(1100px,calc(100%-24px))] pb-4">
          <div className="rounded-[28px] border border-black/10 bg-white/85 backdrop-blur-xl shadow-lg">
            <div className="px-4 py-3 md:px-5">
              <div className="flex items-center gap-4">
                {/* LEFT: Track info */}
                <div className="flex items-center gap-3 min-w-[220px] w-[28%]">
                  <img
                    src={currentTrack.coverUrl}
                    alt={currentTrack.title}
                    className="h-12 w-12 rounded-xl object-cover border border-black/10"
                  />

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-black truncate">
                      {currentTrack.title}
                    </p>
                    <p className="text-xs text-black/60 truncate">
                      {currentTrack.artist}
                    </p>
                  </div>

                  <button
                    onClick={() => setIsLiked((v) => !v)}
                    className="ml-1 grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                    aria-label={isLiked ? "Unlike" : "Like"}
                    title={isLiked ? "Unlike" : "Like"}
                    type="button"
                  >
                    <Heart
                      className={
                        isLiked
                          ? "h-4 w-4 fill-black text-black"
                          : "h-4 w-4 text-black/60"
                      }
                    />
                  </button>
                </div>

                {/* CENTER: Controls + progress */}
                <div className="flex-1">
                  <div className="flex items-center justify-center gap-2 md:gap-3">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                      type="button"
                      aria-label="Shuffle"
                      title="Shuffle"
                      onClick={() => setShuffleOn((v) => !v)}
                    >
                      <Shuffle
                        className={`h-4 w-4 ${
                          shuffleOn ? activeIconClass : inactiveIconClass
                        }`}
                      />
                    </button>

                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                      type="button"
                      aria-label="Previous"
                      title="Previous"
                    >
                      <SkipBack className="h-5 w-5 text-black/80" />
                    </button>

                    <button
                      onClick={() => setIsPlaying((v) => !v)}
                      className="grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-black text-white hover:bg-black/90 active:scale-[0.99]"
                      type="button"
                      aria-label={isPlaying ? "Pause" : "Play"}
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5 ml-0.5" />
                      )}
                    </button>

                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                      type="button"
                      aria-label="Next"
                      title="Next"
                    >
                      <SkipForward className="h-5 w-5 text-black/80" />
                    </button>

                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                      type="button"
                      aria-label="Repeat"
                      title={
                        repeatMode === "off"
                          ? "Repeat off"
                          : repeatMode === "all"
                          ? "Repeat all"
                          : "Repeat one"
                      }
                      onClick={cycleRepeat}
                    >
                      <RepeatIcon
                        className={`h-4 w-4 ${
                          repeatMode !== "off"
                            ? activeIconClass
                            : inactiveIconClass
                        }`}
                      />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <span className="w-10 text-right text-[11px] text-black/50 tabular-nums">
                      {elapsed}
                    </span>

                    <Slider
                      value={progress}
                      onValueChange={setProgress}
                      max={100}
                      step={1}
                      className="flex-1"
                    />

                    <span className="w-10 text-[11px] text-black/50 tabular-nums">
                      {currentTrack.duration}
                    </span>
                  </div>
                </div>

                {/* RIGHT: Utilities */}
                <div className="flex items-center justify-end gap-1 min-w-[240px] w-[28%]">
                  <button
                    className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                    type="button"
                    aria-label="Lyrics"
                    title="Lyrics"
                    onClick={() => setLyricsOn((v) => !v)}
                  >
                    <Mic2
                      className={`h-4 w-4 ${
                        lyricsOn ? activeIconClass : inactiveIconClass
                      }`}
                    />
                  </button>

                  <button
                    className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                    type="button"
                    aria-label="Queue"
                    title="Queue"
                    onClick={() => setQueueOpen((v) => !v)}
                  >
                    <ListMusic
                      className={`h-4 w-4 ${
                        queueOpen ? activeIconClass : inactiveIconClass
                      }`}
                    />
                  </button>

                  <button
                    className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                    type="button"
                    aria-label="Devices"
                    title="Devices"
                    onClick={() => setAirplayOn((v) => !v)}
                  >
                    <Airplay
                      className={`h-4 w-4 ${
                        airplayOn ? activeIconClass : inactiveIconClass
                      }`}
                    />
                  </button>

                  <div className="hidden md:flex items-center gap-2 ml-1">
                    <Volume2 className="h-4 w-4 text-black/60" />
                    <Slider
                      value={volume}
                      onValueChange={setVolume}
                      max={100}
                      step={1}
                      className="w-28"
                    />
                  </div>

                  <button
                    className="ml-1 grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                    type="button"
                    aria-label="Expand player"
                    title="Expand"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setExpanded(true);
                    }}
                  >
                    <Maximize2 className="h-4 w-4 text-black/70" />
                  </button>
                </div>
              </div>

              {/* ✅ Auto-dismissing panels */}
              {(lyricsOn || queueOpen || airplayOn) && (
                <div className="mt-3 grid gap-2">
                  {lyricsOn && (
                    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/70">
                      Lyrics panel (UI) — wire this to your lyrics source later.
                    </div>
                  )}

                  {queueOpen && (
                    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/70">
                      Queue panel (UI) — show upcoming tracks here later.
                    </div>
                  )}

                  {airplayOn && (
                    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/70">
                      Devices panel (UI) — choose output device here later.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ExpandedPlayer
        open={expanded}
        onClose={() => setExpanded(false)}
        title={currentTrack.title}
        artist={currentTrack.artist}
        coverUrl={currentTrack.coverUrl}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((v) => !v)}
      />
    </>
  );
};
