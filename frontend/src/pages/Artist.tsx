import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle2,
  Play,
  Shuffle,
  MoreHorizontal,
} from "lucide-react";

type Card = {
  title: string;
  subtitle?: string;
};

type Track = {
  title: string;
  plays: string;
  duration: string;
};

export default function Artist() {
  const { name } = useParams<{ name: string }>();
  const artistName = decodeURIComponent(name ?? "Artist");

  const monthlyListeners = "56,641,342 monthly listeners";

  const popular = useMemo<Track[]>(
    () => [
      { title: "Skyfall", plays: "1,248,950,102", duration: "4:46" },
      { title: "Set Fire to the Rain", plays: "2,217,921,513", duration: "4:02" },
      { title: "Easy On Me", plays: "2,363,722,944", duration: "3:44" },
      { title: "Someone Like You", plays: "2,505,287,559", duration: "4:45" },
      { title: "Rolling in the Deep", plays: "2,301,812,895", duration: "3:48" },
    ],
    []
  );

  const featuring = useMemo<Card[]>(
    () => [
      { title: `This Is ${artistName}`, subtitle: "Playlist" },
      { title: `${artistName} Radio`, subtitle: "Station" },
      { title: "Soft Pop Hits", subtitle: "Playlist" },
      { title: "All Out 2000s", subtitle: "Playlist" },
      { title: "Workout", subtitle: "Playlist" },
    ],
    [artistName]
  );

  const discography = useMemo<Card[]>(
    () => [
      { title: "30", subtitle: "2021 • Album" },
      { title: "21", subtitle: "2011 • Album" },
      { title: "Skyfall", subtitle: "2012 • Single" },
      { title: "25", subtitle: "2015 • Album" },
      { title: "19", subtitle: "2008 • Album" },
    ],
    []
  );

  const [discTab, setDiscTab] = useState<"popular" | "albums" | "singles">(
    "popular"
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white text-black">
      {/* HERO */}
      <div className="relative border-b border-black/10">
        {/* Light banner */}
        <div className="h-[260px] w-full bg-black/5" />

        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="-mt-[140px] pb-6">
            <div className="flex items-center gap-2 text-sm text-black/70">
              <CheckCircle2 className="h-4 w-4 text-black/70" />
              <span>Verified Artist</span>
            </div>

            <h1 className="mt-3 text-5xl font-extrabold tracking-tight">
              {artistName}
            </h1>

            <div className="mt-3 text-base text-black/70">
              {monthlyListeners}
            </div>

            {/* ACTIONS */}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-white hover:bg-black/90"
              >
                <Play className="h-6 w-6 fill-white text-white" />
              </button>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-black ring-1 ring-black/10 hover:bg-black/10"
              >
                <Shuffle className="h-4 w-4" />
                Shuffle
              </button>

              <button
                type="button"
                className="rounded-full px-5 py-2 text-sm font-semibold ring-1 ring-black/20 hover:bg-black/5"
              >
                Follow
              </button>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="mx-auto w-full max-w-6xl px-6 pb-24">
        {/* POPULAR */}
        <section className="mt-8">
          <h2 className="text-2xl font-bold">Popular</h2>

          <div className="mt-4">
            {popular.map((t, idx) => (
              <button
                key={t.title}
                type="button"
                className="group grid w-full grid-cols-[40px_52px_1fr_140px_60px] items-center gap-4 rounded-xl px-2 py-2 text-left hover:bg-black/5"
              >
                <div className="text-sm text-black/50">{idx + 1}</div>

                <div className="h-12 w-12 rounded-md bg-black/10 ring-1 ring-black/10" />

                <div className="min-w-0">
                  <div className="truncate text-base font-medium">
                    {t.title}
                  </div>
                </div>

                <div className="text-right text-sm text-black/50">
                  {t.plays}
                </div>
                <div className="text-right text-sm text-black/50">
                  {t.duration}
                </div>
              </button>
            ))}

            <button className="mt-3 text-sm font-semibold text-black/60 hover:text-black">
              See more
            </button>
          </div>
        </section>

        {/* FEATURING */}
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Featuring {artistName}</h2>
            <button className="text-sm font-semibold text-black/60 hover:text-black">
              Show all
            </button>
          </div>

          <div className="mt-5 flex gap-5 overflow-x-auto pb-2">
            {featuring.map((c) => (
              <div key={c.title} className="w-[180px] shrink-0">
                <div className="aspect-square w-full rounded-2xl bg-black/5 ring-1 ring-black/10" />
                <div className="mt-3 text-base font-semibold">{c.title}</div>
                {c.subtitle && (
                  <div className="mt-1 text-sm text-black/60">
                    {c.subtitle}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* DISCOGRAPHY */}
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Discography</h2>
            <button className="text-sm font-semibold text-black/60 hover:text-black">
              Show all
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <TabButton active={discTab === "popular"} onClick={() => setDiscTab("popular")}>
              Popular releases
            </TabButton>
            <TabButton active={discTab === "albums"} onClick={() => setDiscTab("albums")}>
              Albums
            </TabButton>
            <TabButton active={discTab === "singles"} onClick={() => setDiscTab("singles")}>
              Singles and EPs
            </TabButton>
          </div>

          <div className="mt-6 flex gap-5 overflow-x-auto pb-2">
            {discography.map((c) => (
              <div key={c.title} className="w-[180px] shrink-0">
                <div className="aspect-square w-full rounded-2xl bg-black/5 ring-1 ring-black/10" />
                <div className="mt-3 text-base font-semibold">{c.title}</div>
                {c.subtitle && (
                  <div className="mt-1 text-sm text-black/60">
                    {c.subtitle}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ABOUT */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold">About</h2>

          <div className="mt-5 overflow-hidden rounded-2xl bg-black/5 ring-1 ring-black/10">
            <div className="h-[220px] w-full bg-black/10" />

            <div className="p-5">
              <div className="text-sm font-semibold text-black/70">
                {monthlyListeners}
              </div>

              <p className="mt-3 text-sm leading-6 text-black/70">
                This is placeholder copy for the artist bio. Swap in real text
                when your API is ready.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
          : "rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-black ring-1 ring-black/10 hover:bg-black/10"
      }
    >
      {children}
    </button>
  );
}
