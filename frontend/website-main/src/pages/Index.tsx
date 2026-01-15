import { useRef } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import { SectionHeader } from "@/components/SectionHeader";
import { albums, featuredPlaylists } from "@/data/mockData";
import { Play, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";

type DragState = {
  isDown: boolean;
  startX: number;
  scrollLeft: number;
};

function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef<DragState>({ isDown: false, startX: 0, scrollLeft: 0 });

  const onMouseDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current.isDown = true;
    state.current.startX = e.pageX - el.offsetLeft;
    state.current.scrollLeft = el.scrollLeft;
  };

  const endDrag = () => {
    state.current.isDown = false;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !state.current.isDown) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - state.current.startX) * 1.2; // drag speed
    el.scrollLeft = state.current.scrollLeft - walk;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current.isDown = true;
    state.current.startX = e.touches[0].pageX - el.offsetLeft;
    state.current.scrollLeft = el.scrollLeft;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const el = ref.current;
    if (!el || !state.current.isDown) return;
    const x = e.touches[0].pageX - el.offsetLeft;
    const walk = (x - state.current.startX) * 1.2;
    el.scrollLeft = state.current.scrollLeft - walk;
  };

  const onTouchEnd = () => {
    state.current.isDown = false;
  };

  return {
    ref,
    onMouseDown,
    onMouseLeave: endDrag,
    onMouseUp: endDrag,
    onMouseMove,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

function scrollRow(ref: React.RefObject<HTMLDivElement>, direction: "left" | "right") {
  const el = ref.current;
  if (!el) return;
  const amount = Math.max(260, Math.floor(el.clientWidth * 0.8)); // nice “page” scroll
  el.scrollBy({
    left: direction === "left" ? -amount : amount,
    behavior: "smooth",
  });
}

const Index = () => {
  const madeForYouDrag = useDragScroll<HTMLDivElement>();
  const newReleasesDrag = useDragScroll<HTMLDivElement>();
  const popularAlbumsDrag = useDragScroll<HTMLDivElement>();

  const scrollerClassName = [
    "-mt-2", // tighten subtitle -> cards
    "overflow-x-auto",
    "scroll-smooth",
    "cursor-grab active:cursor-grabbing",
    "pb-2",
    // hide scrollbar
    "[scrollbar-width:none]",
    "[-ms-overflow-style:none]",
    "[&::-webkit-scrollbar]:hidden",
    // better touch behavior
    "overscroll-x-contain",
    "touch-pan-x",
  ].join(" ");

  const ArrowButtons = ({ targetRef }: { targetRef: React.RefObject<HTMLDivElement> }) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => scrollRow(targetRef, "left")}
        className="h-9 w-9 rounded-full border border-border bg-background/70 hover:bg-accent transition-colors grid place-items-center"
        aria-label="Scroll left"
        title="Scroll left"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={() => scrollRow(targetRef, "right")}
        className="h-9 w-9 rounded-full border border-border bg-background/70 hover:bg-accent transition-colors grid place-items-center"
        aria-label="Scroll right"
        title="Scroll right"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <div className="p-4 lg:p-8 space-y-10 animate-fade-in">
      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-secondary via-card to-accent p-6 md:p-10">
        <div className="relative z-10 max-w-2xl">

          <div className="relative">
            <h1 className="text-3xl md:text-5xl font-bold leading-[1.05]">
              Not what’s popular, but what’s next.
            </h1>

            {/* Decorative watermark */}
            <div className="pointer-events-none absolute left-0 top-10 md:top-14 text-5xl md:text-7xl font-bold text-gradient opacity-10 select-none">
              Favorite Sound
            </div>
          </div>

          <p className="text-muted-foreground max-w-md mt-2 leading-snug">
            A streaming experience built for discovering new voices, new scenes, and new sounds.
            Explore new artists, scenes, and sounds before they break through.
          </p>

          <button className="inline-flex items-center gap-2 px-6 py-3 mt-6 bg-primary text-primary-foreground rounded-full font-semibold hover:scale-105 transition-transform">
            <Play className="w-5 h-5" />
            Start Listening
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="absolute right-0 top-0 w-1/2 h-full opacity-20">
          <div className="absolute right-10 top-10 w-32 h-32 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute right-32 bottom-10 w-48 h-48 rounded-full bg-accent/30 blur-3xl" />
        </div>
      </section>

      {/* Featured Playlists */}
      <section>
        <div className="flex items-end justify-between gap-4">
          <SectionHeader title="Made For You" subtitle="Playlists curated based on your taste" />
          <ArrowButtons targetRef={madeForYouDrag.ref} />
        </div>

        <div ref={madeForYouDrag.ref} {...madeForYouDrag} className={scrollerClassName}>
          <div className="flex gap-4 snap-x snap-mandatory pr-2">
            {featuredPlaylists.map((playlist) => (
              <div
                key={playlist.id}
                className="snap-start shrink-0 w-[170px] sm:w-[190px] md:w-[210px]"
              >
                <AlbumCard album={playlist} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* New Releases */}
      <section>
        <div className="flex items-end justify-between gap-4">
          <SectionHeader title="New Releases" subtitle="Fresh music from your favorite artists" />
          <ArrowButtons targetRef={newReleasesDrag.ref} />
        </div>

        <div ref={newReleasesDrag.ref} {...newReleasesDrag} className={scrollerClassName}>
          <div className="flex gap-4 snap-x snap-mandatory pr-2">
            {albums.slice(0, 6).map((album) => (
              <div
                key={album.id}
                className="snap-start shrink-0 w-[170px] sm:w-[190px] md:w-[210px]"
              >
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Albums */}
      <section>
        <div className="flex items-end justify-between gap-4">
          <SectionHeader title="Popular Albums" subtitle="What everyone's listening to right now" />
          <ArrowButtons targetRef={popularAlbumsDrag.ref} />
        </div>

        <div ref={popularAlbumsDrag.ref} {...popularAlbumsDrag} className={scrollerClassName}>
          <div className="flex gap-4 snap-x snap-mandatory pr-2">
            {albums.slice(2, 8).map((album) => (
              <div
                key={album.id}
                className="snap-start shrink-0 w-[170px] sm:w-[190px] md:w-[210px]"
              >
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
