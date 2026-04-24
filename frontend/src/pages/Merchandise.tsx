import { useMemo, useState } from "react";
import { ArrowLeft, Minus, Music2, Plus, Search, ShoppingBag, ShoppingCart, SlidersHorizontal, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { merchItems, type MerchItem } from "@/data/mockData";

const categories = ["All", "Apparel", "Accessories", "Vinyl", "Poster"] as const;

function getArtistName(item: MerchItem): string {
  return item.artist || "Unknown Artist";
}

function normalizeCategory(value?: string): string {
  const v = (value || "").toLowerCase().trim();
  if (v === "accessory" || v === "accessories") return "Accessories";
  if (v === "apparel") return "Apparel";
  if (v === "vinyl") return "Vinyl";
  if (v === "poster") return "Poster";
  return "Other";
}

const Merchandise = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>("All");
  const [activeArtist, setActiveArtist] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"featured" | "low" | "high">("featured");
  const [cart, setCart] = useState<Record<string, number>>({});

  const artists = useMemo(() => {
    const set = new Set<string>();
    for (const item of merchItems) set.add(getArtistName(item));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = merchItems.filter((item) => {
      if (activeArtist !== "All" && getArtistName(item) !== activeArtist) return false;
      if (activeCategory !== "All" && normalizeCategory(item.category) !== activeCategory) return false;
      if (q && !`${item.name} ${item.artist} ${item.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === "low") return a.price - b.price;
      if (sort === "high") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  }, [activeArtist, activeCategory, query, sort]);

  const featuredItem = filteredItems[0] ?? merchItems[0] ?? null;
  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const item = merchItems.find((row) => row.id === id);
          return item ? { item, qty } : null;
        })
        .filter(Boolean) as Array<{ item: MerchItem; qty: number }>,
    [cart]
  );
  const cartCount = cartItems.reduce((sum, row) => sum + row.qty, 0);
  const cartTotal = cartItems.reduce((sum, row) => sum + row.item.price * row.qty, 0);

  function addToCart(id: string) {
    setCart((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }

  function decrement(id: string) {
    setCart((prev) => {
      const nextQty = (prev[id] ?? 0) - 1;
      if (nextQty <= 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: nextQty };
    });
  }

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-md text-black transition-colors hover:bg-black/5"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="grid h-11 w-11 place-items-center rounded-md border border-black/10 bg-white">
              <Music2 className="h-6 w-6 text-black" />
            </div>
          </div>
          <div className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white">
            <ShoppingCart className="h-4 w-4" />
            {cartCount}
          </div>
        </div>

        <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f2]">
            {featuredItem ? (
              <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <img src={featuredItem.imageUrl} alt={featuredItem.name} className="h-72 w-full object-cover md:h-full" />
                <div className="flex min-h-[300px] flex-col justify-end p-5 sm:p-7">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Merch</p>
                  <h1 className="mt-2 text-4xl font-bold leading-none sm:text-5xl">{featuredItem.name}</h1>
                  <p className="mt-3 text-lg font-semibold text-black/60">{featuredItem.artist}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span className="rounded-md bg-white px-3 py-2 text-sm font-bold">${featuredItem.price}</span>
                    <span className="rounded-md bg-white px-3 py-2 text-sm font-bold">{normalizeCategory(featuredItem.category)}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(featuredItem.id)}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Cart</h2>
              <span className="text-sm font-bold text-black/50">${cartTotal}</span>
            </div>
            <div className="mt-4 space-y-3">
              {cartItems.length ? (
                cartItems.map(({ item, qty }) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-md bg-[#f8f7f2] p-2">
                    <img src={item.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.name}</p>
                      <p className="text-xs font-semibold text-black/50">${item.price}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => decrement(item.id)} className="grid h-7 w-7 place-items-center rounded bg-white">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold">{qty}</span>
                      <button type="button" onClick={() => addToCart(item.id)} className="grid h-7 w-7 place-items-center rounded bg-white">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid min-h-[130px] place-items-center rounded-md bg-[#f8f7f2] text-sm font-semibold text-black/50">
                  Cart is empty
                </div>
              )}
            </div>
            {cartItems.length ? (
              <button type="button" onClick={() => setCart({})} className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-black/10 px-4 text-sm font-semibold hover:bg-black/5">
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            ) : null}
          </aside>
        </section>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_170px]">
          <div className="flex h-12 items-center gap-3 rounded-md border border-black/10 bg-[#f8f7f2] px-4">
            <Search className="h-5 w-5 text-black/45" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-black/35"
              placeholder="Search merch"
            />
          </div>
          <select value={activeArtist} onChange={(event) => setActiveArtist(event.target.value)} className="h-12 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none">
            {artists.map((artist) => (
              <option key={artist} value={artist}>
                {artist === "All" ? "All artists" : artist}
              </option>
            ))}
          </select>
          <div className="flex h-12 items-center gap-2 rounded-md border border-black/10 bg-white px-3">
            <SlidersHorizontal className="h-4 w-4 text-black/45" />
            <select value={sort} onChange={(event) => setSort(event.target.value as "featured" | "low" | "high")} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">
              <option value="featured">Featured</option>
              <option value="low">Price low</option>
              <option value="high">Price high</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
                activeCategory === category ? "bg-black text-white" : "border border-black/10 bg-white text-black hover:bg-black/5"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <section className="mt-5 rounded-lg border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Shop catalog</h2>
            <span className="text-sm font-semibold text-black/45">{filteredItems.length} items</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredItems.map((item) => (
              <article key={item.id} className="rounded-lg border border-black/10 bg-[#f8f7f2] p-3">
                <img src={item.imageUrl} alt={item.name} className="aspect-square w-full rounded-md object-cover" />
                <div className="mt-3">
                  <p className="truncate text-xs font-semibold text-black/50">{item.artist}</p>
                  <h3 className="mt-1 line-clamp-2 min-h-[40px] text-sm font-bold">{item.name}</h3>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-lg font-bold">${item.price}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(item.id)}
                      className="grid h-9 w-9 place-items-center rounded-md bg-black text-white transition hover:bg-black/80"
                      aria-label={`Add ${item.name} to cart`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
};

export default Merchandise;
