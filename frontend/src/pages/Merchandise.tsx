import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Minus,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { merchItems, type MerchItem } from "@/data/mockData";

const categories = ["All", "Apparel", "Accessories", "Vinyl", "Poster"] as const;
const cartStorageKey = "offtrack_merch_cart_v1";

type CategoryFilter = (typeof categories)[number];
type SortMode = "featured" | "low" | "high" | "artist";
type CartLine = {
  itemId: string;
  size: string;
  color: string;
  qty: number;
};
type CheckoutForm = {
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  card: string;
};

const emptyCheckoutForm: CheckoutForm = {
  name: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  card: "",
};

function getArtistName(item: MerchItem): string {
  return item.artist || "Unknown Artist";
}

function normalizeCategory(value?: string): CategoryFilter | "Other" {
  const v = (value || "").toLowerCase().trim();
  if (v === "accessory" || v === "accessories") return "Accessories";
  if (v === "apparel") return "Apparel";
  if (v === "vinyl") return "Vinyl";
  if (v === "poster") return "Poster";
  return "Other";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function getSizes(item: MerchItem): string[] {
  if (item.category === "apparel") return ["S", "M", "L", "XL"];
  if (item.category === "poster") return ["18x24"];
  if (item.category === "vinyl") return item.name.toLowerCase().includes("box") ? ["Box set"] : ["LP"];
  return ["One size"];
}

function getColors(item: MerchItem): string[] {
  if (item.category === "apparel") return item.name.toLowerCase().includes("hoodie") ? ["Black", "Concrete"] : ["Black", "White"];
  if (item.category === "poster") return ["Matte"];
  if (item.category === "vinyl") return ["Black vinyl", "Clear vinyl"];
  return ["Black"];
}

function getStock(item: MerchItem): number {
  const stockById: Record<string, number> = {
    m1: 18,
    m2: 9,
    m3: 24,
    m4: 6,
    m5: 15,
    m6: 4,
  };
  return stockById[item.id] ?? 10;
}

function cartKey(itemId: string, size: string, color: string): string {
  return `${itemId}::${size}::${color}`;
}

function readSavedCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cartStorageKey) || "[]") as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line) => line.itemId && line.size && line.color && Number.isFinite(line.qty) && line.qty > 0);
  } catch {
    return [];
  }
}

const Merchandise = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");
  const [activeArtist, setActiveArtist] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("featured");
  const [cart, setCart] = useState<CartLine[]>(() => readSavedCart());
  const [selectedItem, setSelectedItem] = useState<MerchItem | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState<CheckoutForm>(emptyCheckoutForm);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart]);

  const itemById = useMemo(() => new Map(merchItems.map((item) => [item.id, item])), []);

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
      if (sort === "artist") return getArtistName(a).localeCompare(getArtistName(b)) || a.name.localeCompare(b.name);
      return merchItems.findIndex((item) => item.id === a.id) - merchItems.findIndex((item) => item.id === b.id);
    });
  }, [activeArtist, activeCategory, query, sort]);

  const cartItems = useMemo(
    () =>
      cart
        .map((line) => {
          const item = itemById.get(line.itemId);
          return item ? { ...line, item, key: cartKey(line.itemId, line.size, line.color) } : null;
        })
        .filter(Boolean) as Array<CartLine & { item: MerchItem; key: string }>,
    [cart, itemById],
  );

  const featuredItem = filteredItems[0] ?? merchItems[0] ?? null;
  const cartCount = cartItems.reduce((sum, row) => sum + row.qty, 0);
  const subtotal = cartItems.reduce((sum, row) => sum + row.item.price * row.qty, 0);
  const shipping = cartCount === 0 || subtotal >= 100 ? 0 : 6.99;
  const tax = subtotal * 0.08875;
  const total = subtotal + shipping + tax;

  function addToCart(item: MerchItem, size = getSizes(item)[0], color = getColors(item)[0], qty = 1) {
    const stock = getStock(item);
    let added = false;

    setCart((prev) => {
      const key = cartKey(item.id, size, color);
      const existing = prev.find((line) => cartKey(line.itemId, line.size, line.color) === key);
      const existingQty = existing?.qty ?? 0;
      if (existingQty >= stock) return prev;

      added = true;
      if (existing) {
        return prev.map((line) => (cartKey(line.itemId, line.size, line.color) === key ? { ...line, qty: Math.min(stock, line.qty + qty) } : line));
      }
      return [...prev, { itemId: item.id, size, color, qty: Math.min(stock, qty) }];
    });

    if (added) {
      toast.success("Added to cart", { description: `${item.name} (${size}, ${color})` });
    } else {
      toast.error("No more stock available", { description: `${item.name} is already at the cart limit.` });
    }
  }

  function decrement(line: CartLine) {
    const key = cartKey(line.itemId, line.size, line.color);
    setCart((prev) =>
      prev.flatMap((row) => {
        if (cartKey(row.itemId, row.size, row.color) !== key) return [row];
        return row.qty > 1 ? [{ ...row, qty: row.qty - 1 }] : [];
      }),
    );
  }

  function removeLine(line: CartLine) {
    const key = cartKey(line.itemId, line.size, line.color);
    setCart((prev) => prev.filter((row) => cartKey(row.itemId, row.size, row.color) !== key));
  }

  function openProduct(item: MerchItem) {
    setSelectedItem(item);
    setSelectedSize(getSizes(item)[0]);
    setSelectedColor(getColors(item)[0]);
  }

  function updateCheckoutField(field: keyof CheckoutForm, value: string) {
    setCheckoutForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateCheckout(): string | null {
    if (!checkoutForm.name.trim()) return "Enter a full name.";
    if (!/^\S+@\S+\.\S+$/.test(checkoutForm.email.trim())) return "Enter a valid email address.";
    if (!checkoutForm.address.trim()) return "Enter a shipping address.";
    if (!checkoutForm.city.trim()) return "Enter a city.";
    if (!checkoutForm.state.trim()) return "Enter a state.";
    if (!/^\d{5}(-\d{4})?$/.test(checkoutForm.zip.trim())) return "Enter a valid ZIP code.";
    if (checkoutForm.card.replace(/\D/g, "").length < 12) return "Enter a valid demo card number.";
    return null;
  }

  function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateCheckout();
    if (error) {
      toast.error("Checkout needs attention", { description: error });
      return;
    }
    const nextOrder = `OT-${Math.floor(100000 + Math.random() * 900000)}`;
    setOrderNumber(nextOrder);
    setCart([]);
    setCheckoutOpen(false);
    setCheckoutForm(emptyCheckoutForm);
    toast.success("Order placed", { description: `Confirmation ${nextOrder}` });
  }

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-black transition-colors hover:bg-black/5"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-black/45">Artist merch</p>
              <h1 className="truncate text-3xl font-bold sm:text-4xl">Shop offtrack drops</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            disabled={!cartItems.length}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30"
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount} items
          </button>
        </div>

        {orderNumber ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 p-4 text-emerald-950">
            <div className="flex items-center gap-3">
              <PackageCheck className="h-5 w-5" />
              <p className="text-sm font-semibold">Order {orderNumber} is confirmed. A receipt was sent to your email.</p>
            </div>
            <button type="button" onClick={() => setOrderNumber(null)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-emerald-100" aria-label="Dismiss order confirmation">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-lg border border-black/10 bg-[#f8f7f2]">
            {featuredItem ? (
              <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <img src={featuredItem.imageUrl} alt={featuredItem.name} className="h-72 w-full object-cover md:h-full" />
                <div className="flex min-h-[320px] flex-col justify-end p-5 sm:p-7">
                  <div className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-bold uppercase text-black/55">
                    <Sparkles className="h-4 w-4" />
                    Featured drop
                  </div>
                  <h2 className="mt-4 text-4xl font-bold leading-none sm:text-5xl">{featuredItem.name}</h2>
                  <p className="mt-3 text-lg font-semibold text-black/60">{featuredItem.artist}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span className="rounded-md bg-white px-3 py-2 text-sm font-bold">{formatCurrency(featuredItem.price)}</span>
                    <span className="rounded-md bg-white px-3 py-2 text-sm font-bold">{normalizeCategory(featuredItem.category)}</span>
                    <span className="rounded-md bg-white px-3 py-2 text-sm font-bold">{getStock(featuredItem)} left</span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => addToCart(featuredItem)} className="inline-flex h-11 items-center gap-2 rounded-md bg-black px-5 text-sm font-semibold text-white transition hover:bg-black/80">
                      <ShoppingBag className="h-4 w-4" />
                      Quick add
                    </button>
                    <button type="button" onClick={() => openProduct(featuredItem)} className="inline-flex h-11 items-center gap-2 rounded-md border border-black/10 bg-white px-5 text-sm font-semibold transition hover:bg-black/5">
                      Choose options
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Cart</h2>
              <span className="text-sm font-bold text-black/50">{formatCurrency(subtotal)}</span>
            </div>
            <div className="mt-4 space-y-3">
              {cartItems.length ? (
                cartItems.map((line) => (
                  <div key={line.key} className="flex items-center gap-3 rounded-md bg-[#f8f7f2] p-2">
                    <img src={line.item.imageUrl} alt="" className="h-14 w-14 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{line.item.name}</p>
                      <p className="truncate text-xs font-semibold text-black/50">
                        {line.size} / {line.color}
                      </p>
                      <p className="text-xs font-semibold text-black/50">{formatCurrency(line.item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => decrement(line)} className="grid h-7 w-7 place-items-center rounded bg-white" aria-label={`Decrease ${line.item.name}`}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold">{line.qty}</span>
                      <button type="button" onClick={() => addToCart(line.item, line.size, line.color)} className="grid h-7 w-7 place-items-center rounded bg-white" aria-label={`Increase ${line.item.name}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeLine(line)} className="grid h-7 w-7 place-items-center rounded bg-white text-black/55 hover:text-black" aria-label={`Remove ${line.item.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid min-h-[150px] place-items-center rounded-md bg-[#f8f7f2] px-4 text-center text-sm font-semibold text-black/50">
                  Add merch to start an order.
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2 rounded-md border border-black/10 p-3 text-sm font-semibold">
              <div className="flex justify-between gap-3">
                <span className="text-black/55">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-black/55">Shipping</span>
                <span>{shipping ? formatCurrency(shipping) : "Free"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-black/55">Tax</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="border-t border-black/10 pt-2 text-base">
                <div className="flex justify-between gap-3">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              disabled={!cartItems.length}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30"
            >
              <ShieldCheck className="h-4 w-4" />
              Checkout
            </button>
          </aside>
        </section>

        <section className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_170px]">
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
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none">
              <option value="featured">Featured</option>
              <option value="low">Price low</option>
              <option value="high">Price high</option>
              <option value="artist">Artist</option>
            </select>
          </div>
        </section>

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Shop catalog</h2>
            <span className="text-sm font-semibold text-black/45">{filteredItems.length} items</span>
          </div>
          {filteredItems.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => (
                <article key={item.id} className="rounded-lg border border-black/10 bg-[#f8f7f2] p-3">
                  <button type="button" onClick={() => openProduct(item)} className="block w-full overflow-hidden rounded-md text-left">
                    <img src={item.imageUrl} alt={item.name} className="aspect-square w-full object-cover transition duration-300 hover:scale-105" />
                  </button>
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-semibold text-black/50">{item.artist}</p>
                      <p className="shrink-0 text-xs font-bold text-black/45">{getStock(item)} left</p>
                    </div>
                    <button type="button" onClick={() => openProduct(item)} className="mt-1 block min-h-[40px] w-full text-left text-sm font-bold leading-5">
                      {item.name}
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-lg font-bold">{formatCurrency(item.price)}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openProduct(item)} className="h-9 rounded-md border border-black/10 bg-white px-3 text-xs font-bold transition hover:bg-black/5">
                          Options
                        </button>
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className="grid h-9 w-9 place-items-center rounded-md bg-black text-white transition hover:bg-black/80"
                          aria-label={`Add ${item.name} to cart`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid min-h-[220px] place-items-center rounded-md bg-[#f8f7f2] px-4 text-center">
              <div>
                <p className="text-lg font-bold">No merch matches those filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategory("All");
                    setActiveArtist("All");
                    setQuery("");
                  }}
                  className="mt-3 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white"
                >
                  Reset filters
                </button>
              </div>
            </div>
          )}
        </section>
      </section>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`${selectedItem.name} options`}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-4 text-black shadow-xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-black/45">{normalizeCategory(selectedItem.category)}</p>
                <h2 className="mt-1 text-2xl font-bold">{selectedItem.name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-black/5" aria-label="Close product details">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
              <img src={selectedItem.imageUrl} alt={selectedItem.name} className="aspect-square w-full rounded-md object-cover" />
              <div>
                <p className="text-sm font-semibold text-black/55">{selectedItem.artist}</p>
                <p className="mt-2 text-3xl font-bold">{formatCurrency(selectedItem.price)}</p>
                <div className="mt-4 grid gap-4">
                  <div>
                    <p className="mb-2 text-sm font-bold">Size</p>
                    <div className="flex flex-wrap gap-2">
                      {getSizes(selectedItem).map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(size)}
                          className={`h-10 rounded-md px-4 text-sm font-semibold ${selectedSize === size ? "bg-black text-white" : "border border-black/10 bg-white hover:bg-black/5"}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-bold">Color</p>
                    <div className="flex flex-wrap gap-2">
                      {getColors(selectedItem).map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setSelectedColor(color)}
                          className={`h-10 rounded-md px-4 text-sm font-semibold ${selectedColor === color ? "bg-black text-white" : "border border-black/10 bg-white hover:bg-black/5"}`}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 rounded-md bg-[#f8f7f2] p-3 text-sm font-semibold text-black/60">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Ships in 3-5 business days
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {getStock(selectedItem)} currently available
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    addToCart(selectedItem, selectedSize, selectedColor);
                    setSelectedItem(null);
                  }}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black px-5 text-sm font-semibold text-white transition hover:bg-black/80"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Add selected item
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {checkoutOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Checkout">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-4 text-black shadow-xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-black/45">Secure checkout</p>
                <h2 className="mt-1 text-2xl font-bold">Complete order</h2>
              </div>
              <button type="button" onClick={() => setCheckoutOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-black/5" aria-label="Close checkout">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <form onSubmit={placeOrder} className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-bold">
                    Name
                    <input value={checkoutForm.name} onChange={(event) => updateCheckoutField("name", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold outline-none" autoComplete="name" />
                  </label>
                  <label className="grid gap-1 text-sm font-bold">
                    Email
                    <input value={checkoutForm.email} onChange={(event) => updateCheckoutField("email", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold outline-none" autoComplete="email" />
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-bold">
                  Address
                  <input value={checkoutForm.address} onChange={(event) => updateCheckoutField("address", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold outline-none" autoComplete="street-address" />
                </label>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_130px]">
                  <label className="grid gap-1 text-sm font-bold">
                    City
                    <input value={checkoutForm.city} onChange={(event) => updateCheckoutField("city", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold outline-none" autoComplete="address-level2" />
                  </label>
                  <label className="grid gap-1 text-sm font-bold">
                    State
                    <input value={checkoutForm.state} onChange={(event) => updateCheckoutField("state", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold uppercase outline-none" autoComplete="address-level1" maxLength={2} />
                  </label>
                  <label className="grid gap-1 text-sm font-bold">
                    ZIP
                    <input value={checkoutForm.zip} onChange={(event) => updateCheckoutField("zip", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold outline-none" autoComplete="postal-code" />
                  </label>
                </div>
                <label className="grid gap-1 text-sm font-bold">
                  Demo card
                  <input value={checkoutForm.card} onChange={(event) => updateCheckoutField("card", event.target.value)} className="h-11 rounded-md border border-black/10 px-3 font-semibold outline-none" inputMode="numeric" placeholder="4242 4242 4242 4242" />
                </label>
                <button type="submit" disabled={!cartItems.length} className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-black px-5 text-sm font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30">
                  <ShieldCheck className="h-4 w-4" />
                  Place order
                </button>
              </form>

              <aside className="rounded-md bg-[#f8f7f2] p-4">
                <h3 className="text-lg font-bold">Order summary</h3>
                <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
                  {cartItems.map((line) => (
                    <div key={line.key} className="flex gap-3">
                      <img src={line.item.imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{line.item.name}</p>
                        <p className="text-xs font-semibold text-black/50">
                          {line.qty} x {line.size} / {line.color}
                        </p>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(line.item.price * line.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 border-t border-black/10 pt-3 text-sm font-semibold">
                  <div className="flex justify-between">
                    <span className="text-black/55">Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black/55">Shipping</span>
                    <span>{shipping ? formatCurrency(shipping) : "Free"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-black/55">Tax</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-black/10 pt-2 text-base font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Merchandise;
