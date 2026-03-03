import { useMemo, useState } from "react";
import { ArrowLeft, Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { merchItems } from "@/data/mockData";

const categories = ["All", "Apparel", "Accessories", "Vinyl", "CD"] as const;

function getArtistName(item: any): string {
  return item.artist || item.artistName || item.creator || item.band || item.performer || "Unknown Artist";
}

function normalizeCategory(value?: string): string {
  const v = (value || "").toLowerCase().trim();
  if (v === "accessory" || v === "accessories") return "Accessories";
  if (v === "apparel") return "Apparel";
  if (v === "vinyl") return "Vinyl";
  if (v === "cd") return "CD";
  return "Other";
}

const Merchandise = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>("All");
  const [activeArtist, setActiveArtist] = useState<string>("All");

  const artists = useMemo(() => {
    const set = new Set<string>();
    for (const item of merchItems as any[]) set.add(getArtistName(item));

    const ordered = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ["All", ...ordered];
  }, []);

  const filteredItems = useMemo(() => {
    const byArtist =
      activeArtist === "All"
        ? (merchItems as any[])
        : (merchItems as any[]).filter((item) => getArtistName(item) === activeArtist);

    const byCategory =
      activeCategory === "All"
        ? byArtist
        : byArtist.filter((item) => normalizeCategory(item.category) === activeCategory);

    return byCategory;
  }, [activeArtist, activeCategory]);

  const featuredItem = filteredItems[0] ?? (merchItems as any[])[0] ?? null;
  const featuredArtist = featuredItem ? getArtistName(featuredItem) : "Artist";
  const featuredName = featuredItem?.name || "Merch item";
  const featuredPrice = typeof featuredItem?.price === "number" ? `$${featuredItem.price}` : "$50";
  const featuredImage =
    featuredItem?.imageUrl ||
    "https://images.unsplash.com/photo-1521369909029-2afed882baee?w=800&h=500&fit=crop";

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-28">
      <section className="mx-auto w-full max-w-[1420px] px-4 pt-8 sm:px-8">
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

        <div className="mt-6">
          <h1 className="font-['Arimo',sans-serif] text-[34px] font-bold leading-none text-black sm:text-[42px]">Merch</h1>
          <p className="font-['Arimo',sans-serif] text-[17px] font-bold leading-tight text-black sm:text-[29px]">
            Official merch from your favorite artists
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          {artists.slice(0, 3).map((artist) => {
            const isActive = activeArtist === artist;
            return (
              <button
                key={artist}
                type="button"
                onClick={() => setActiveArtist(artist)}
                className={
                  artist === "All"
                    ? "grid h-[204px] w-[204px] place-items-center rounded-full border-[3px] border-black bg-[#c7c7c7] px-4 font-['Arimo',sans-serif] text-[26px] font-bold text-black"
                    : isActive
                    ? "grid h-[204px] w-[204px] place-items-center rounded-full bg-[#ff9494] px-4 font-['Arimo',sans-serif] text-center text-[26px] font-bold leading-tight text-black"
                    : "grid h-[204px] w-[204px] place-items-center rounded-full bg-[#d9d9d9] px-4 font-['Arimo',sans-serif] text-center text-[26px] font-bold leading-tight text-black"
                }
              >
                <span className="max-w-full whitespace-normal break-words">
                  {artist === "All" ? "All" : artist.split(" ").slice(0, 2).join(" ")}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={
                activeCategory === category
                  ? "h-[47px] rounded-[10px] bg-black px-6 font-['Arimo',sans-serif] text-[21px] font-bold leading-none text-white"
                  : "h-[47px] rounded-[10px] bg-[#d9d9d9] px-6 font-['Arimo',sans-serif] text-[21px] font-bold leading-none text-black"
              }
            >
              {category}
            </button>
          ))}
        </div>

        <div className="mt-7 w-full max-w-[420px] rounded-[10px] bg-[#d9d9d9] px-5 pb-6 pt-5">
          <div className="h-[180px] w-full overflow-hidden bg-white sm:h-[220px]">
            <img src={featuredImage} alt={featuredName} className="h-full w-full object-cover" />
          </div>

          <div className="mt-3 font-['Arimo',sans-serif] text-[21px] font-bold leading-[1.05] text-black">
            <p>{featuredArtist}</p>
            <p>{featuredName}</p>
            <p>{featuredPrice}</p>
          </div>

          <button
            type="button"
            className="mt-4 font-['Arimo',sans-serif] text-[28px] font-bold leading-none text-black"
          >
            Add to cart
          </button>
        </div>
      </section>
    </div>
  );
};

export default Merchandise;
