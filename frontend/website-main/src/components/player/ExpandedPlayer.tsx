// src/components/player/ExpandedPlayer.tsx
import { X } from "lucide-react";

type ExpandedPlayerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  artist: string;
  coverUrl: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
};

function MiniWaveform({ isPlaying }: { isPlaying: boolean }) {
  // Fixed bar pattern (looks like Spotify-style mini-wave)
  const bars = [5, 10, 16, 10, 6, 14, 22, 14, 7, 12, 18, 12, 6];

  return (
    <div className="mt-4">
      <div className="flex items-end gap-1 h-6">
        {bars.map((h, i) => (
          <div
            key={i}
            className={[
              "w-[3px] rounded-full bg-white/70",
              isPlaying ? "animate-pulse" : "",
            ].join(" ")}
            style={{
              height: `${h}px`,
              animationDelay: isPlaying ? `${i * 60}ms` : undefined,
            }}
          />
        ))}
      </div>

      {/* subtle baseline */}
      <div className="mt-2 h-px w-full bg-white/15" />
    </div>
  );
}

export function ExpandedPlayer({
  open,
  onClose,
  title,
  artist,
  coverUrl,
  isPlaying,
  onTogglePlay,
}: ExpandedPlayerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        aria-label="Close expanded player"
      />

      {/* panel wrapper */}
      <div className="absolute inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center">
        <div className="relative w-full md:max-w-6xl md:rounded-2xl shadow-2xl overflow-hidden border border-white/10">
          {/* blurred artwork background */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${coverUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          {/* blur + tint overlay */}
          <div className="absolute inset-0 backdrop-blur-2xl bg-black/35" />

          {/* content */}
          <div className="relative">
            {/* top bar */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/10">
              <div className="min-w-0">
                <p className="font-semibold truncate text-white">{title}</p>
                <p className="text-sm text-white/70 truncate">{artist}</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-9 w-9 grid place-items-center rounded-md hover:bg-white/10 text-white"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* body */}
            <div className="grid md:grid-cols-[360px_1fr] gap-6 p-4 md:p-6">
              {/* cover */}
              <div className="rounded-2xl overflow-hidden bg-white/5 border border-white/10">
                <img
                  src={coverUrl}
                  alt={title}
                  className="w-full aspect-square object-cover"
                />
              </div>

              {/* lyrics + controls */}
              <div className="min-h-[240px] flex flex-col">
                {/* lyrics panel */}
                <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="text-white/85 text-lg md:text-2xl leading-snug font-semibold">
                    Lyrics (placeholder)
                  </div>
                  <div className="mt-3 text-white/55 text-sm md:text-base">
                    Replace this with your lyrics rendering logic (scrollable, timed lines, etc).
                  </div>
                </div>

                {/* controls */}
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onTogglePlay}
                      className="px-5 py-2.5 rounded-full bg-white text-black font-semibold hover:opacity-90 transition-opacity"
                    >
                      {isPlaying ? "Pause" : "Play"}
                    </button>

                    <div className="text-white/70 text-sm">
                      {isPlaying ? "Now playing" : "Paused"}
                    </div>
                  </div>

                  {/* NEW: mini waveform under playback */}
                  <MiniWaveform isPlaying={isPlaying} />
                </div>
              </div>
            </div>

            {/* extra bottom padding on mobile so it feels like a sheet */}
            <div className="h-2 md:hidden" />
          </div>
        </div>
      </div>
    </div>
  );
}
