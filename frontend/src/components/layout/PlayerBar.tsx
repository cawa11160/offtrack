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
  Music,
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const PlayerBar = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  const [progress, setProgress] = useState<number[]>([35]);
  const [volume, setVolume] = useState<number[]>([75]);

  const [isLiked, setIsLiked] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState(false);

  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");

  const [lyricsOn, setLyricsOn] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [airplayOn, setAirplayOn] = useState(false);

  // ✅ bar collapsed/expanded (matches reference)
  const [barExpanded, setBarExpanded] = useState(false);

  // ✅ draggable unit position (the DOT anchors the unit)
  const DOT = 64; // px
  const GAP = 18; // px gap between bar and dot
  const [notePos, setNotePos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    // place dot near lower-right-ish
    return { x: window.innerWidth - 120, y: window.innerHeight - 220 };
  });

  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const hidePanelsTimerRef = useRef<number | null>(null);
  const PANEL_AUTO_HIDE_MS = 3000;

  useEffect(() => {
    const anyPanelOpen = lyricsOn || queueOpen || airplayOn;

    if (hidePanelsTimerRef.current) {
      window.clearTimeout(hidePanelsTimerRef.current);
      hidePanelsTimerRef.current = null;
    }

    if (anyPanelOpen) {
      hidePanelsTimerRef.current = window.setTimeout(() => {
        setLyricsOn(false);
        setQueueOpen(false);
        setAirplayOn(false);
        hidePanelsTimerRef.current = null;
      }, PANEL_AUTO_HIDE_MS);
    }

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

  // ✅ derived: bar width depending on screen size (like reference)
  const barWidth = useMemo(() => {
    if (typeof window === "undefined") return 980;
    const w = window.innerWidth;
    // keep some margin, but allow big bar on desktop
    return clamp(w - 220, 680, 1120);
  }, []);

  // ✅ Compute the unit's left/top from dot position
  // The unit container will be placed so the DOT is at (notePos.x, notePos.y)
  // and the bar expands to the LEFT of the dot.
  const unitLeft = barExpanded ? notePos.x - (barWidth + GAP) : notePos.x; // only dot visible when collapsed
  const unitTop = notePos.y;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;

      const dx = e.clientX - startPointerRef.current.x;
      const dy = e.clientY - startPointerRef.current.y;

      // treat as drag if moved > a few px (so click still works)
      if (Math.abs(dx) + Math.abs(dy) > 6) movedRef.current = true;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // clamp DOT within viewport; since DOT is the anchor, clamp using DOT size
      const nextX = clamp(startPosRef.current.x + dx, 12, vw - (DOT + 12));
      const nextY = clamp(startPosRef.current.y + dy, 12, vh - (DOT + 12));

      setNotePos({ x: nextX, y: nextY });
    };

    const onUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [DOT]);

  return (
    <>
      {/* ✅ One fixed unit: bar expands from the dot (attached like reference) */}
      <div
        className="fixed z-[60] pointer-events-none"
        style={{ left: unitLeft, top: unitTop }}
      >
        <div className="relative pointer-events-none">
          {/* BAR (expands left of dot) */}
          <div
            className={[
              "absolute right-[calc(64px+18px)] top-1/2 -translate-y-1/2",
              "pointer-events-auto",
              "transition-all duration-300 ease-out",
              barExpanded ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
            ].join(" ")}
            style={{ width: barWidth }}
          >
            <div className="rounded-[40px] border border-black/10 bg-[#ff8f95]/85 backdrop-blur-xl shadow-lg">
              <div className="px-6 py-4">
                <div className="flex items-center gap-5">
                  {/* LEFT: cover + title */}
                  <div className="flex items-center gap-4 min-w-[240px] w-[30%]">
                    <img
                      src={currentTrack.coverUrl}
                      alt={currentTrack.title}
                      className="h-14 w-14 rounded-2xl object-cover border border-black/10"
                    />

                    <div className="min-w-0">
                      <p className="text-base font-semibold text-black truncate">
                        {currentTrack.title}
                      </p>
                      <p className="text-sm text-black/70 truncate">{currentTrack.artist}</p>
                    </div>

                    <button
                      onClick={() => setIsLiked((v) => !v)}
                      className="ml-1 grid h-10 w-10 place-items-center rounded-2xl hover:bg-black/10"
                      aria-label={isLiked ? "Unlike" : "Like"}
                      title={isLiked ? "Unlike" : "Like"}
                      type="button"
                    >
                      <Heart
                        className={
                          isLiked
                            ? "h-5 w-5 fill-black text-black"
                            : "h-5 w-5 text-black/70"
                        }
                      />
                    </button>
                  </div>

                  {/* CENTER: controls + progress */}
                  <div className="flex-1">
                    <div className="flex items-center justify-center gap-2 md:gap-3">
                      <button
                        className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                        type="button"
                        aria-label="Shuffle"
                        title="Shuffle"
                        onClick={() => setShuffleOn((v) => !v)}
                      >
                        <Shuffle
                          className={`h-4 w-4 ${shuffleOn ? activeIconClass : inactiveIconClass}`}
                        />
                      </button>

                      <button
                        className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                        type="button"
                        aria-label="Previous"
                        title="Previous"
                      >
                        <SkipBack className="h-5 w-5 text-black/80" />
                      </button>

                      <button
                        onClick={() => setIsPlaying((v) => !v)}
                        className="grid h-12 w-12 place-items-center rounded-full border border-black/10 bg-black text-white hover:bg-black/90"
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
                        className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                        type="button"
                        aria-label="Next"
                        title="Next"
                      >
                        <SkipForward className="h-5 w-5 text-black/80" />
                      </button>

                      <button
                        className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
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
                            repeatMode !== "off" ? activeIconClass : inactiveIconClass
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <span className="w-10 text-right text-[11px] text-black/60 tabular-nums">
                        {elapsed}
                      </span>

                      <Slider
                        value={progress}
                        onValueChange={setProgress}
                        max={100}
                        step={1}
                        className="flex-1"
                      />

                      <span className="w-10 text-[11px] text-black/60 tabular-nums">
                        {currentTrack.duration}
                      </span>
                    </div>
                  </div>

                  {/* RIGHT: panels + volume + expand */}
                  <div className="flex items-center justify-end gap-1 min-w-[260px] w-[30%]">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                      type="button"
                      aria-label="Lyrics"
                      title="Lyrics"
                      onClick={() => setLyricsOn((v) => !v)}
                    >
                      <Mic2 className={`h-4 w-4 ${lyricsOn ? activeIconClass : inactiveIconClass}`} />
                    </button>

                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                      type="button"
                      aria-label="Queue"
                      title="Queue"
                      onClick={() => setQueueOpen((v) => !v)}
                    >
                      <ListMusic
                        className={`h-4 w-4 ${queueOpen ? activeIconClass : inactiveIconClass}`}
                      />
                    </button>

                    <button
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                      type="button"
                      aria-label="Devices"
                      title="Devices"
                      onClick={() => setAirplayOn((v) => !v)}
                    >
                      <Airplay
                        className={`h-4 w-4 ${airplayOn ? activeIconClass : inactiveIconClass}`}
                      />
                    </button>

                    <div className="hidden md:flex items-center gap-2 ml-1">
                      <Volume2 className="h-4 w-4 text-black/70" />
                      <Slider
                        value={volume}
                        onValueChange={setVolume}
                        max={100}
                        step={1}
                        className="w-28"
                      />
                    </div>

                    <button
                      className="ml-1 grid h-9 w-9 place-items-center rounded-xl hover:bg-black/10"
                      type="button"
                      aria-label="Expand player"
                      title="Expand"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedPlayer(true);
                      }}
                    >
                      <Maximize2 className="h-4 w-4 text-black/80" />
                    </button>
                  </div>
                </div>

                {(lyricsOn || queueOpen || airplayOn) && (
                  <div className="mt-3 grid gap-2">
                    {lyricsOn && (
                      <div className="rounded-2xl border border-black/10 bg-white/60 px-4 py-3 text-sm text-black/70">
                        Lyrics panel (UI) — wire this to your lyrics source later.
                      </div>
                    )}
                    {queueOpen && (
                      <div className="rounded-2xl border border-black/10 bg-white/60 px-4 py-3 text-sm text-black/70">
                        Queue panel (UI) — show upcoming tracks here later.
                      </div>
                    )}
                    {airplayOn && (
                      <div className="rounded-2xl border border-black/10 bg-white/60 px-4 py-3 text-sm text-black/70">
                        Devices panel (UI) — choose output device here later.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DOT (always visible, attached to the right end of the bar when expanded) */}
          <div className="relative pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                // only toggle if this was a click, not a drag
                if (!movedRef.current) setBarExpanded((v) => !v);
                movedRef.current = false;
              }}
              onPointerDown={(e) => {
                draggingRef.current = true;
                movedRef.current = false;

                startPointerRef.current = { x: e.clientX, y: e.clientY };
                startPosRef.current = { ...notePos };

                (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
              }}
              className={[
                "h-16 w-16 rounded-full",
                "bg-[#ff8f95] text-black",
                "shadow-[0_18px_50px_rgba(0,0,0,0.25)]",
                "grid place-items-center",
                "hover:scale-[1.02] active:scale-[0.98] transition",
                "cursor-grab active:cursor-grabbing",
              ].join(" ")}
              aria-label={barExpanded ? "Minimize player bar" : "Expand player bar"}
              title={barExpanded ? "Minimize player" : "Expand player"}
            >
              <Music className="h-7 w-7" />
            </button>
          </div>
        </div>
      </div>

      <ExpandedPlayer
        open={expandedPlayer}
        onClose={() => setExpandedPlayer(false)}
        title={currentTrack.title}
        artist={currentTrack.artist}
        coverUrl={currentTrack.coverUrl}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((v) => !v)}
      />
    </>
  );
};
