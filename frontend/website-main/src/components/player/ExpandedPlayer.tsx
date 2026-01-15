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
      {/* panel */}
      <div className="absolute inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center">
        <div className="relative w-full md:max-w-5xl md:rounded-2xl bg-background border border-border shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="min-w-0">
              <p className="font-semibold truncate">{title}</p>
              <p className="text-sm text-muted-foreground truncate">{artist}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 grid place-items-center rounded-md hover:bg-accent"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-[360px_1fr] gap-6 p-6">
            <div className="rounded-xl overflow-hidden bg-muted">
              <img src={coverUrl} alt={title} className="w-full aspect-square object-cover" />
            </div>

            <div className="min-h-[240px]">
              {/* placeholder for lyrics panel */}
              <div className="h-full rounded-xl border border-border p-4 text-muted-foreground">
                Lyrics (placeholder)
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold"
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
