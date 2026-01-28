import { useRef } from "react";
import { AlbumCard } from "@/components/AlbumCard";
import {
  recentlyPlayed,
  recommendedForYou,
  usageStats,
  HOME_USER_NAME,
} from "@/data/mockData";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    const walk = (x - state.current.startX) * 1.2;
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
  const amount = Math.max(260, Math.floor(el.clientWidth * 0.8));
  el.scrollBy({
    left: direction === "left" ? -amount : amount,
    behavior: "smooth",
  });
}

const scrollerClassName = [
  "-mt-2 overflow-x-auto scroll-smooth cursor-grab active:cursor-grabbing pb-2",
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
  "overscroll-x-contain touch-pan-x",
].join(" ");

function ArrowButtons({ targetRef }: { targetRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => scrollRow(targetRef, "left")}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-muted/50 text-foreground transition hover:bg-muted"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => scrollRow(targetRef, "right")}
        className="grid h-9 w-9 place-items-center rounded-full border border-border bg-muted/50 text-foreground transition hover:bg-muted"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

const Index = () => {
  const recentlyDrag = useDragScroll<HTMLDivElement>();
  const recommendedDrag = useDragScroll<HTMLDivElement>();

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Welcome */}
      <section className="rounded-2xl bg-muted/40 px-6 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Welcome back {HOME_USER_NAME},
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-snug text-muted-foreground">
          A streaming experience built for discovering new voices, new scenes, and new sounds.
          Explore new artists, scenes, and sounds before they break through.
        </p>
      </section>

      {/* Stats cards */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-muted/40 px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your daily usage pattern
          </h3>
          <p className="mt-2 text-[15px] text-foreground">
            On average, you have spent {usageStats.avgHours} on Offtrack
          </p>
          <p className="mt-1 text-[15px] text-foreground">
            You typically use Offtrack {usageStats.typicalTime}.
          </p>
        </div>
        <div className="rounded-2xl bg-muted/40 px-6 py-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Most streamed genres for you are currently…
          </h3>
          <p className="mt-2 text-[15px] text-foreground">
            {usageStats.topGenres.join(", ")}
          </p>
          <h3 className="mt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Most streamed musicians for you are currently…
          </h3>
          <p className="mt-2 text-[15px] text-foreground">
            {usageStats.topArtists.join(", ")}
          </p>
        </div>
      </section>

      {/* Recently played */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground md:text-2xl">Recently played</h2>
          <ArrowButtons targetRef={recentlyDrag.ref} />
        </div>
        <div
          ref={recentlyDrag.ref}
          {...recentlyDrag}
          className={scrollerClassName}
        >
          <div className="flex gap-4 pr-2">
            {recentlyPlayed.map((album) => (
              <div key={album.id} className="w-[170px] shrink-0 sm:w-[190px] md:w-[210px]">
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended for you */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground md:text-2xl">Recommended for you</h2>
          <ArrowButtons targetRef={recommendedDrag.ref} />
        </div>
        <div
          ref={recommendedDrag.ref}
          {...recommendedDrag}
          className={scrollerClassName}
        >
          <div className="flex gap-4 pr-2">
            {recommendedForYou.map((album) => (
              <div key={album.id} className="w-[170px] shrink-0 sm:w-[190px] md:w-[210px]">
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
