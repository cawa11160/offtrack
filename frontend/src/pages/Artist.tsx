import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Play, Shuffle } from "lucide-react";

type Track = {
  title: string;
  plays: string;
  length: string;
};

type Release = {
  title: string;
  subtitle: string;
};

export default function Artist() {
  const { name } = useParams<{ name: string }>();
  const artistName = decodeURIComponent(name ?? "Artist");

  const monthlyListeners = "56,641,342 monthly listeners";

  const tracks = useMemo<Track[]>(
    () => [
      { title: "Skyfall", plays: "1,248,950,102", length: "4:46" },
      { title: "Set Fire to the Rain", plays: "2,217,921,513", length: "4:02" },
      { title: "Easy On Me", plays: "2,363,722,944", length: "3:44" },
      { title: "Someone Like You", plays: "2,505,287,559", length: "4:45" },
      { title: "Rolling in the Deep", plays: "2,301,812,895", length: "3:48" },
    ],
    []
  );

  const releases = useMemo<Release[]>(
    () => [
      { title: "30", subtitle: "2021 • Album" },
      { title: "21", subtitle: "2011 • Album" },
      { title: "25", subtitle: "2015 • Album" },
      { title: "19", subtitle: "2008 • Album" },
    ],
    []
  );

  const featuring = useMemo<Release[]>(
    () => [
      { title: `This Is ${artistName}`, subtitle: "Playlist" },
      { title: `${artistName} Radio`, subtitle: "Station" },
      { title: "Soft Pop Hits", subtitle: "Playlist" },
      { title: "All Out 2000s", subtitle: "Playlist" },
    ],
    [artistName]
  );

  return (
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-[#FFFFFF] pb-44">
      <section className="mx-auto w-full max-w-[1303px] px-3 py-5 sm:px-7 sm:py-7">
        <div className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-6">
          <p className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.08em] text-black/70">
            Verified Artist
          </p>
          <h1 className="mt-2 font-['Arimo',sans-serif] text-[42px] font-bold leading-none text-black sm:text-[56px]">
            {artistName}
          </h1>
          <p className="mt-3 font-['Arimo',sans-serif] text-[20px] font-bold leading-tight text-black/90">
            {monthlyListeners}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[10px] bg-black px-4 py-3 font-['Arimo',sans-serif] text-[18px] font-bold text-white"
            >
              <Play className="h-5 w-5 fill-white text-white" />
              Play
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[10px] bg-white px-4 py-3 font-['Arimo',sans-serif] text-[18px] font-bold text-black"
            >
              <Shuffle className="h-5 w-5" />
              Shuffle
            </button>
            <button
              type="button"
              className="rounded-[10px] bg-white px-4 py-3 font-['Arimo',sans-serif] text-[18px] font-bold text-black"
            >
              Follow
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">
              Popular
            </h2>
            <div className="mt-4 space-y-2">
              {tracks.map((track, index) => (
                <div
                  key={track.title}
                  className="grid grid-cols-[34px_1fr_130px_55px] items-center gap-3 rounded-[10px] bg-white px-3 py-3"
                >
                  <span className="font-['Arimo',sans-serif] text-[18px] font-bold text-black/60">
                    {index + 1}
                  </span>
                  <span className="truncate font-['Arimo',sans-serif] text-[18px] font-bold text-black">
                    {track.title}
                  </span>
                  <span className="text-right font-['Arimo',sans-serif] text-[15px] font-bold text-black/65">
                    {track.plays}
                  </span>
                  <span className="text-right font-['Arimo',sans-serif] text-[15px] font-bold text-black/65">
                    {track.length}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">
              About
            </h2>
            <div className="mt-4 rounded-[10px] bg-white p-4">
              <div className="h-[200px] w-full rounded-[10px] bg-[#b9b9b9]" />
              <p className="mt-4 font-['Arimo',sans-serif] text-[20px] font-bold leading-tight text-black">
                {monthlyListeners}
              </p>
              <p className="mt-2 font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black/85">
                Artist biography content goes here. Replace this block with the final copy from your data source.
              </p>
            </div>
          </article>
        </div>

        <div className="mt-4 rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">
              Featuring {artistName}
            </h2>
            <button className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.06em] text-black/70">
              Show all
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {featuring.map((item) => (
              <article key={item.title} className="rounded-[10px] bg-white p-3">
                <div className="aspect-square w-full rounded-[10px] bg-[#b9b9b9]" />
                <h3 className="mt-3 font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
                  {item.title}
                </h3>
                <p className="mt-1 font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">
                  {item.subtitle}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">
              Discography
            </h2>
            <button className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.06em] text-black/70">
              Show all
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {releases.map((item) => (
              <article key={item.title} className="rounded-[10px] bg-white p-3">
                <div className="aspect-square w-full rounded-[10px] bg-[#b9b9b9]" />
                <h3 className="mt-3 font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black">
                  {item.title}
                </h3>
                <p className="mt-1 font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">
                  {item.subtitle}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
