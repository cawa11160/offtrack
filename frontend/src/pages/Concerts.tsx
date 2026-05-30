import "mapbox-gl/dist/mapbox-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map, Marker, Popup } from "mapbox-gl";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, MapPin, Music2, Search, Ticket, X } from "lucide-react";

import { useLiveConcerts } from "@/lib/liveEvents";

type ConcertLike = {
  id: string;
  title?: string;
  artist?: string;
  venue?: string;
  city?: string;
  date?: string;
  time?: string;
  ticketUrl?: string;
  coverUrl?: string;
  lat?: number;
  lng?: number;
  genre?: string;
  price?: string;
};

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim();
type MapboxGL = typeof import("mapbox-gl").default;
let mapboxPromise: Promise<MapboxGL> | null = null;

function loadMapbox() {
  if (!mapboxPromise) {
    mapboxPromise = import("mapbox-gl").then((mod) => mod.default);
  }
  return mapboxPromise;
}

function normalizeCityParam(value: string | null) {
  return value && value !== "any" ? value : "all";
}

function normalizeDateParam(value: string | null): "all" | "week" | "weekend" | "month" {
  if (value === "week" || value === "weekend" || value === "month") return value;
  return "all";
}

async function initMapboxCspWorker(mapboxgl: MapboxGL) {
  try {
    // @ts-expect-error - Vite worker import
    const mod = await import("mapbox-gl/dist/mapbox-gl-csp-worker?worker");
    // @ts-expect-error - mapboxgl.workerClass is not typed in all versions
    mapboxgl.workerClass = mod.default;
  } catch {
    // Optional CSP worker support.
  }
}

function getConcertCoords(c: ConcertLike, index: number) {
  if (typeof c.lng === "number" && typeof c.lat === "number") return { lng: c.lng, lat: c.lat };
  const base = { lng: -74.006, lat: 40.7128 };
  const jitter = (n: number) => (n % 2 === 0 ? 1 : -1) * (0.01 + (n % 5) * 0.003);
  return { lng: base.lng + jitter(index), lat: base.lat + jitter(index + 1) };
}

function prettyDate(value?: string) {
  if (!value) return "Date TBA";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return value;
}

function daysUntil(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

const Concerts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const initialConcertsRef = useRef<ConcertLike[]>([]);
  const mapboxRef = useRef<MapboxGL | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  const { concerts: liveConcerts, loading: eventsLoading, source: eventsSource, error: eventsError, refreshedAt } = useLiveConcerts(24);
  const typedConcerts = liveConcerts as unknown as ConcertLike[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState(() => normalizeCityParam(searchParams.get("city")));
  const [dateFilter, setDateFilter] = useState<"all" | "week" | "weekend" | "month">(() => normalizeDateParam(searchParams.get("date")));

  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(typedConcerts.map((c) => c.city || "Unknown").filter(Boolean))).sort();
    return ["all", ...cities];
  }, [typedConcerts]);

  const filteredConcerts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return typedConcerts.filter((concert) => {
      const haystack = [concert.artist, concert.title, concert.venue, concert.city].filter(Boolean).join(" ").toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (cityFilter !== "all" && concert.city !== cityFilter) return false;
      const days = daysUntil(concert.date);
      if (dateFilter === "week" && (days === null || days < 0 || days > 7)) return false;
      if (dateFilter === "weekend") {
        const day = concert.date ? new Date(concert.date).getDay() : -1;
        if ((day !== 0 && day !== 6) || days === null || days < 0 || days > 14) return false;
      }
      if (dateFilter === "month" && (days === null || days < 0 || days > 31)) return false;
      return true;
    });
  }, [cityFilter, dateFilter, query, typedConcerts]);

  const selectedConcert = useMemo(() => {
    if (!selectedId) return filteredConcerts[0] ?? null;
    return filteredConcerts.find((c) => c.id === selectedId) ?? filteredConcerts[0] ?? null;
  }, [filteredConcerts, selectedId]);

  useEffect(() => {
    if (!initialConcertsRef.current.length && typedConcerts.length) {
      initialConcertsRef.current = typedConcerts;
    }
  }, [typedConcerts]);

  useEffect(() => {
    if (!filteredConcerts.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredConcerts.some((c) => c.id === selectedId)) setSelectedId(filteredConcerts[0].id);
  }, [filteredConcerts, selectedId]);

  useEffect(() => {
    let disposed = false;
    if (!MAPBOX_TOKEN) {
      setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
      return;
    }
    if (!mapContainerRef.current || mapRef.current) return;

    void (async () => {
      const mapboxgl = await loadMapbox();
      mapboxRef.current = mapboxgl;
      if (disposed) return;
      if (!mapboxgl.supported()) {
        setMapError("WebGL is not available in this browser/device.");
        return;
      }
      await initMapboxCspWorker(mapboxgl);
      if (disposed || !mapContainerRef.current) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;
      const first = initialConcertsRef.current[0];
      const center = first ? getConcertCoords(first, 0) : { lng: -74.006, lat: 40.7128 };
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [center.lng, center.lat],
        zoom: 11,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      mapRef.current = map;
      map.on("error", (e) => {
        const msg = (e?.error && (e.error as { message?: string }).message) || "Map failed to load.";
        setMapError(msg);
      });
      map.on("load", () => map.resize());
      setTimeout(() => map.resize(), 250);
    })().catch((err: unknown) => {
      if (!disposed) setMapError(err instanceof Error ? err.message : "Map initialization failed.");
    });

    return () => {
      disposed = true;
      popupRef.current?.remove();
      markersRef.current.forEach((m) => m.remove());
      mapRef.current?.remove();
      popupRef.current = null;
      markersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapboxgl = mapboxRef.current;
    if (!mapRef.current || !mapboxgl) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = filteredConcerts.map((concert, index) => {
      const coords = getConcertCoords(concert, index);
      const selected = concert.id === selectedConcert?.id;
      const el = document.createElement("button");
      el.type = "button";
      el.className = selected
        ? "h-5 w-5 rounded-full bg-white shadow-[0_0_0_7px_rgba(255,255,255,0.22)]"
        : "h-4 w-4 rounded-full bg-[#ff9494] shadow-[0_0_0_6px_rgba(255,148,148,0.22)]";
      el.setAttribute("aria-label", "Concert location");
      el.addEventListener("click", () => setSelectedId(concert.id));
      return new mapboxgl.Marker({ element: el }).setLngLat([coords.lng, coords.lat]).addTo(mapRef.current!);
    });
  }, [filteredConcerts, selectedConcert?.id]);

  useEffect(() => {
    const mapboxgl = mapboxRef.current;
    if (!mapRef.current || !selectedConcert || !mapboxgl) return;
    const idx = Math.max(0, filteredConcerts.findIndex((c) => c.id === selectedConcert.id));
    const { lng, lat } = getConcertCoords(selectedConcert, idx);
    popupRef.current?.remove();
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 18 })
      .setLngLat([lng, lat])
      .setHTML(
        `<div style="font-family:Inter,system-ui,sans-serif;color:#111;line-height:1.25;min-width:190px">` +
          `<div style="font-weight:800">${selectedConcert.artist ?? selectedConcert.title ?? "Concert"}</div>` +
          `<div style="margin-top:3px;font-weight:700;color:#555">${selectedConcert.venue ?? "Venue TBA"}</div>` +
          `<div style="margin-top:6px;font-weight:700">${prettyDate(selectedConcert.date)}</div></div>`
      )
      .addTo(mapRef.current);
    popupRef.current = popup;
    mapRef.current.easeTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 11.8), duration: 500 });
  }, [filteredConcerts, selectedConcert]);

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
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

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Concert Map</p>
            <h1 className="mt-1 text-4xl font-bold leading-none sm:text-5xl">Live near you</h1>
          </div>
          <div className="rounded-md bg-[#f8f7f2] px-4 py-3 text-sm font-semibold text-black/60">
            {eventsLoading ? "Updating..." : `${filteredConcerts.length} shows`}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-black/45">
          <span>{eventsSource === "ticketmaster" ? "Live Ticketmaster feed" : "Updated local venue feed"}</span>
          <span>Updated {refreshedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          {eventsError ? <span>Fallback active</span> : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_160px]">
          <div className="flex h-12 items-center gap-3 rounded-md border border-black/10 bg-[#f8f7f2] px-4">
            <Search className="h-5 w-5 text-black/45" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-black/35"
              placeholder="Artist, venue, city"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="grid h-8 w-8 place-items-center rounded-md hover:bg-black/5" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="h-12 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none">
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city === "all" ? "All cities" : city}
              </option>
            ))}
          </select>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as "all" | "week" | "weekend" | "month")} className="h-12 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none">
            <option value="all">Any date</option>
            <option value="week">This week</option>
            <option value="weekend">Weekend</option>
            <option value="month">This month</option>
          </select>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="order-2 max-h-[720px] overflow-y-auto rounded-lg border border-black/10 bg-[#f8f7f2] p-3 xl:order-1">
            <div className="space-y-2">
              {filteredConcerts.length ? filteredConcerts.map((concert, index) => {
                const selected = concert.id === selectedConcert?.id;
                return (
                  <button
                    key={concert.id}
                    type="button"
                    onClick={() => setSelectedId(concert.id)}
                    className={`flex w-full gap-3 rounded-md p-2 text-left transition ${selected ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
                  >
                    <img src={concert.coverUrl} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{concert.artist ?? `Concert ${index + 1}`}</span>
                      <span className={`mt-1 block truncate text-xs font-semibold ${selected ? "text-white/65" : "text-black/55"}`}>
                        {concert.venue ?? "Venue TBA"}
                      </span>
                      <span className={`mt-3 flex items-center gap-1 text-xs font-semibold ${selected ? "text-white/70" : "text-black/45"}`}>
                        <Calendar className="h-3.5 w-3.5" />
                        {prettyDate(concert.date)}
                      </span>
                    </span>
                  </button>
                );
              }) : (
                <div className="rounded-md bg-white p-4 text-sm font-semibold text-black/55">
                  No upcoming live events match these filters.
                </div>
              )}
            </div>
          </aside>

          <section className="order-1 overflow-hidden rounded-lg border border-black/10 bg-[#111111] xl:order-2">
            <div className="relative h-[720px] min-h-[520px]">
              {!MAPBOX_TOKEN ? (
                <div className="grid h-full place-items-center p-6 text-center text-lg font-bold text-white">Missing Mapbox token: VITE_MAPBOX_TOKEN</div>
              ) : (
                <>
                  <div ref={mapContainerRef} className="absolute inset-0" />
                  {mapError ? <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center text-lg font-bold text-white">{mapError}</div> : null}
                </>
              )}

              {selectedConcert ? (
                <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-white/15 bg-white p-4 shadow-xl md:left-auto md:w-[380px]">
                  <img src={selectedConcert.coverUrl} alt="" className="h-32 w-full rounded-md object-cover" />
                  <h2 className="mt-3 truncate text-xl font-bold">{selectedConcert.artist ?? selectedConcert.title ?? "Concert"}</h2>
                  <div className="mt-3 space-y-2 text-sm font-semibold text-black/60">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedConcert.venue ?? "Venue TBA"}, {selectedConcert.city ?? "City TBA"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {prettyDate(selectedConcert.date)}
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {selectedConcert.time ?? "Time TBA"}
                    </p>
                  </div>
                  <a
                    href={selectedConcert.ticketUrl && selectedConcert.ticketUrl !== "#" ? selectedConcert.ticketUrl : "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-black text-sm font-semibold text-white transition hover:bg-black/80"
                  >
                    <Ticket className="h-4 w-4" />
                    Tickets
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
};

export default Concerts;
