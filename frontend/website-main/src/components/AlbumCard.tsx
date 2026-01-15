import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Album } from "@/data/mockData";

interface AlbumCardProps {
  album: Album;
  onPlay?: (album: Album) => void;
  onClick?: (album: Album) => void;
}

export const AlbumCard = ({ album, onPlay, onClick }: AlbumCardProps) => {
  const navigate = useNavigate();

  const goToDetails = () => {
    // If parent supplied an onClick handler, use it.
    if (onClick) {
      onClick(album);
      return;
    }

    // Otherwise navigate to your details page route.
    // IMPORTANT: your Album must have a stable `id` for this to work.
    const id = (album as any).id;
    if (!id) {
      console.warn(
        "AlbumCard: album.id is missing. Add an `id` field in mockData so cards can route to /release/:id",
        album
      );
      return;
    }

    navigate(`/release/${id}`);
  };

  return (
    <div
      className="album-card group cursor-pointer"
      onClick={goToDetails}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") goToDetails();
      }}
    >
      <div className="relative mb-4">
        <img
          src={album.coverUrl}
          alt={album.title}
          className="w-full aspect-square object-cover rounded-lg shadow-lg"
          draggable={false}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.(album);
          }}
          className="absolute bottom-2 right-2 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center
                     opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0
                     transition-all duration-300 shadow-xl hover:scale-105"
          aria-label={`Play ${album.title}`}
        >
          <Play className="w-5 h-5 ml-0.5" />
        </button>
      </div>

      <h3 className="font-semibold text-sm truncate">{album.title}</h3>
      <p className="text-xs text-muted-foreground truncate mt-1">{album.artist}</p>
    </div>
  );
};

// ✅ Also export default so either import style works
export default AlbumCard;
