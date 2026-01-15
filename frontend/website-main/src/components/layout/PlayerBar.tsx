import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Shuffle,
  Heart,
  Maximize2,
} from "lucide-react";
import { useState } from "react";
import { currentTrack } from "@/data/mockData";
import { Slider } from "@/components/ui/slider";
import { ExpandedPlayer } from "@/components/player/ExpandedPlayer";

export const PlayerBar = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState([35]); // 0..100
  const [volume, setVolume] = useState([75]); // 0..100
  const [isLiked, setIsLiked] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* OUTER wrapper — does not block page */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        {/* INNER bar — interactive */}
        <div className="h-player bg-card border-t border-border pointer-events-auto">
          <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
            {/* Track Info */}
            <div className="flex items-center gap-3 w-1/4 min-w-[180px]">
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className="w-14 h-14 rounded-lg object-cover"
              />
              <div className="hidden sm:block min-w-0">
                <p className="font-medium text-sm truncate">{currentTrack.title}</p>
                <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
              </div>

              <button
                onClick={() => setIsLiked(!isLiked)}
                className="hidden sm:flex ml-2"
                aria-label={isLiked ? "Unlike" : "Like"}
                title={isLiked ? "Unlike" : "Like"}
                type="button"
              >
                <Heart
                  className={`w-4 h-4 transition-colors ${
                    isLiked
                      ? "fill-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                />
              </button>
            </div>

            {/* Player Controls */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-xl">
              <div className="flex items-center gap-4">
                <button
                  className="player-button player-button-secondary hidden sm:flex"
                  type="button"
                  aria-label="Shuffle"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  className="player-button player-button-secondary"
                  type="button"
                  aria-label="Previous"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="player-button player-button-primary w-12 h-12"
                  type="button"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>

                <button
                  className="player-button player-button-secondary"
                  type="button"
                  aria-label="Next"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                <button
                  className="player-button player-button-secondary hidden sm:flex"
                  type="button"
                  aria-label="Repeat"
                >
                  <Repeat className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full flex items-center gap-2 px-2">
                <span className="text-xs text-muted-foreground w-10 text-right">1:18</span>
                <Slider
                  value={progress}
                  onValueChange={setProgress}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10">{currentTrack.duration}</span>
              </div>
            </div>

            {/* Volume & Expand */}
            <div className="flex items-center gap-3 w-1/4 justify-end">
              <div className="hidden md:flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  max={100}
                  step={1}
                  className="w-24"
                />
              </div>

              <button
                className="player-button player-button-secondary"
                type="button"
                aria-label="Expand player"
                title="Expand"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded overlay */}
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
