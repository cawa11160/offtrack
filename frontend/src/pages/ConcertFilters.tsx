import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { concerts } from "@/data/mockData";
import { Button } from "@/components/ui/button";

type ConcertLike = { city?: string };

export default function ConcertFilters() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [city, setCity] = useState(searchParams.get("city") || "any");
  const [date, setDate] = useState(searchParams.get("date") || "any");
  const [genre, setGenre] = useState(searchParams.get("genre") || "any");
  const [price, setPrice] = useState(searchParams.get("price") || "any");

  const cities = useMemo(() => {
    const set = new Set<string>();
    (concerts as unknown as ConcertLike[]).forEach((c) => {
      if (c.city) set.add(c.city);
    });
    return ["any", ...Array.from(set).sort()];
  }, []);

  const apply = () => {
    const sp = new URLSearchParams();
    if (city !== "any") sp.set("city", city);
    if (date !== "any") sp.set("date", date);
    if (genre !== "any") sp.set("genre", genre);
    if (price !== "any") sp.set("price", price);

    const qs = sp.toString();
    navigate(`/concerts${qs ? `?${qs}` : ""}`);
  };

  const clear = () => {
    setCity("any");
    setDate("any");
    setGenre("any");
    setPrice("any");
    navigate("/concerts");
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Filters</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Refine upcoming events.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-medium">City</label>
          <select
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            {cities.map((c) => (
              <option key={c} value={c}>
                {c === "any" ? "Any city" : c}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-medium">Date</label>
          <select
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          >
            <option value="any">Any time</option>
            <option value="weekend">This weekend</option>
            <option value="month">This month</option>
          </select>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-medium">Genre (optional)</label>
          <select
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          >
            <option value="any">Any</option>
            <option value="indie">Indie</option>
            <option value="electronic">Electronic</option>
            <option value="hiphop">Hip-hop</option>
            <option value="rock">Rock</option>
          </select>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-medium">Price (optional)</label>
          <select
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          >
            <option value="any">Any</option>
            <option value="free">Free</option>
            <option value="under50">Under $50</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={apply}>Apply filters</Button>
          <Button variant="secondary" onClick={clear}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
