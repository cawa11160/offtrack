import { useMemo, useState } from "react";
import { MerchCard } from "@/components/MerchCard";
import { SectionHeader } from "@/components/SectionHeader";
import { merchItems } from "@/data/mockData";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

const categories = ["All", "Apparel", "Vinyl", "Poster", "Accessory"];

function getArtistName(item: any): string {
  return (
    item.artist ||
    item.artistName ||
    item.creator ||
    item.band ||
    item.performer ||
    "Unknown Artist"
  );
}

const Merchandise = () => {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeArtist, setActiveArtist] = useState<string>("All");

  const artists = useMemo(() => {
    const set = new Set<string>();
    for (const item of merchItems as any[]) set.add(getArtistName(item));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, []);

  const filteredItems = useMemo(() => {
    const byCategory =
      activeCategory === "All"
        ? (merchItems as any[])
        : (merchItems as any[]).filter(
            (item) =>
              (item.category || "")
                .toLowerCase()
                .trim() === activeCategory.toLowerCase()
          );

    const byArtist =
      activeArtist === "All"
        ? byCategory
        : byCategory.filter((item) => getArtistName(item) === activeArtist);

    return byArtist;
  }, [activeCategory, activeArtist]);

  const itemsGroupedByArtist = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const item of filteredItems as any[]) {
      const name = getArtistName(item);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
  }, [filteredItems]);

  return (
    <div className="p-4 lg:p-8 space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Merchandise</h1>
          <p className="text-muted-foreground mt-2">
            Official merch from your favorite artists
          </p>
        </div>

        <Button variant="secondary">
          <ShoppingBag className="w-4 h-4 mr-2" />
          Cart (0)
        </Button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === category
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* ARTIST ROW */}
      <section className="space-y-4">
        <SectionHeader title="Popular artists" />

        <div className="flex gap-6 overflow-x-auto pb-2 scrollbar-hide">
          {artists.map((artist) => {
            const isActive = activeArtist === artist;

            return (
              <button
                key={artist}
                type="button"
                onClick={() => setActiveArtist(artist)}
                className="flex flex-col items-start gap-3 min-w-[140px] text-left group"
              >
                {/* FIXED CONTAINER */}
                <div
                  className={`
                    relative p-1 overflow-visible
                    transition-transform
                    ${isActive ? "ring-2 ring-primary rounded-full" : ""}
                    group-hover:scale-[1.02]
                  `}
                >
                  <div className="w-28 h-28 rounded-full bg-secondary relative">
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-foreground">
                      {artist === "All" ? "★" : artist.charAt(0).toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="leading-tight">
                  <div className="font-medium truncate max-w-[140px]">
                    {artist}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {artist === "All" ? "All artists" : "Artist"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* MERCH LIST */}
      <section className="space-y-6">
        {activeArtist !== "All" ? (
          <>
            <SectionHeader
              title={
                activeCategory === "All"
                  ? `${activeArtist} Merch`
                  : `${activeArtist} • ${activeCategory}`
              }
              subtitle={`${filteredItems.length} items available`}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredItems.map((item: any) => (
                <MerchCard key={item.id} item={item} />
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionHeader
              title={activeCategory === "All" ? "All Products" : activeCategory}
              subtitle={`${filteredItems.length} items available`}
            />

            {itemsGroupedByArtist.map(([artist, items]) => (
              <div key={artist} className="space-y-3">
                <div className="flex items-end justify-between">
                  <h3 className="text-xl font-bold">{artist}</h3>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setActiveArtist(artist)}
                  >
                    View all
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {items.slice(0, 10).map((item: any) => (
                    <MerchCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
};

export default Merchandise;
