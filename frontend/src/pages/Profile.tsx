import { ArrowLeft, ArrowLeftCircle, ArrowRightCircle, Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type CoverItem = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
};

const topTracks: CoverItem[] = [
  {
    id: "track-1",
    title: "The Ramones",
    subtitle: "Ramones",
    imageUrl: "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?w=400&h=400&fit=crop",
  },
  {
    id: "track-2",
    title: "Moisturiser",
    subtitle: "Wetleg",
    imageUrl: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=400&h=400&fit=crop",
  },
  {
    id: "track-3",
    title: "Models",
    subtitle: "The Wallows",
    imageUrl: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=400&fit=crop",
  },
];

const playlists: CoverItem[] = [
  {
    id: "playlist-1",
    title: "The Ramones",
    subtitle: "Ramones",
    imageUrl: "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?w=400&h=400&fit=crop",
  },
];

function CoverCard({ item }: { item: CoverItem }) {
  return (
    <article className="w-[156px] shrink-0">
      <div className="h-[156px] w-[156px] overflow-hidden bg-[#bfbfbf]">
        <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
      </div>
      <div className="mt-2 text-center font-['Arimo',sans-serif] text-[21px] font-bold leading-[0.95] text-black">
        <p>{item.title}</p>
        <p>{item.subtitle}</p>
      </div>
    </article>
  );
}

export default function Profile() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-36">
      <section className="mx-auto w-full max-w-[1420px] px-4 pt-6 sm:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-[10px] text-black transition-colors hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-7 w-7" />
          </button>
          <div className="grid h-12 w-12 place-items-center rounded-[10px] border border-black bg-white">
            <Music2 className="h-7 w-7 text-black" />
          </div>
        </div>

        <div className="mt-4 rounded-[10px] bg-[#d9d9d9] px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-[320px] items-center gap-6">
              <div className="h-[185px] w-[185px] overflow-hidden rounded-full bg-[#a7b2bf]">
                <img
                  src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=500&h=500&fit=crop"
                  alt="Melissa Wong"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="font-['Arimo',sans-serif] font-bold text-black">
                <h1 className="text-[42px] leading-none">Profile</h1>
                <p className="mt-3 text-[29px] leading-none">Melissa Wong</p>
                <p className="text-[29px] leading-none">@Mlissa</p>
                <p className="mt-2 text-[29px] leading-none">5 followers and 10 following</p>
              </div>
            </div>

            <button
              type="button"
              className="h-[64px] rounded-[10px] border-[5px] border-black px-8 font-['Arimo',sans-serif] text-[29px] font-bold leading-none text-black"
            >
              Edit
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="font-['Arimo',sans-serif] text-[29px] font-bold leading-none text-black">Top tracks from you</h2>
            <div className="flex items-center gap-2 text-black">
              <ArrowLeftCircle className="h-6 w-6" />
              <ArrowRightCircle className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-2 rounded-[10px] bg-[#d9d9d9] px-4 py-4">
            <div className="flex gap-8 overflow-x-auto pb-1">
              {topTracks.map((item) => (
                <CoverCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="font-['Arimo',sans-serif] text-[29px] font-bold leading-none text-black">Your playlists</h2>
            <div className="flex items-center gap-2 text-black">
              <ArrowLeftCircle className="h-6 w-6" />
              <ArrowRightCircle className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-2 rounded-[10px] bg-[#d9d9d9] px-4 py-4">
            <div className="flex gap-8 overflow-x-auto pb-1">
              {playlists.map((item) => (
                <CoverCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
