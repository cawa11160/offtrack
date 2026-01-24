import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map, Marker, Popup } from "mapbox-gl";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ConcertCard } from "@/components/ConcertCard";
import { SectionHeader } from "@/components/SectionHeader";
import { concerts } from "@/data/mockData";
import { MapPin, List, Filter, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConcertLike = {
  id: string;
  title?: string;
  artist?: string;
  venue?: string;
  city?: string;
  date?: string;
  imageUrl?: string;
  coverUrl?: string;
  lat?: number;
  lng?: number;
  // optional future fields:
  genre?: string;
  price?: string;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Default coords so pins show up even without lat/lng
const cityFallbackCoords: Record<string, { lng: number; lat: number }> = {
  "New York": { lng: -74.006, lat: 40.7128 },
  "Los Angeles": { lng: -118.2437, lat: 34.0522 },
  London: { lng: -0.1276, lat: 51.5072 },
  "San Francisco": { lng: -122.4194, lat: 37.7749 },
  Chicago: { lng: -87.6298, lat: 41.8781 },
  Seattle: { lng: -122.3321, lat: 47.6062 },
  Boston: { lng: -71.0589, lat: 42.3601 },
  Denver: { lng: -104.9903, lat: 39.7392 },
};

function getConcertCoords(c: ConcertLike, index: number) {
  if (typeof c.lng === "number" && typeof c.lat === "number") {
    return { lng: c.lng, lat: c.lat };
  }

  const city = c.city ?? "";
  if (cityFallbackCoords[city]) return cityFallbackCoords[city];

  // scatter around NYC so markers don’t overlap perfectly
  const base = { lng: -74.006, lat: 40.7128 };
  const jitter = (n: number) => (n % 2 === 0 ? 1 : -1) * (0.01 + (n % 5) * 0.003);
  return { lng: base.lng + jitter(index), lat: base.lat + jitter(index + 1) };
}

const Concerts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  const typedConcerts = concerts as unknown as ConcertLike[];

  // --- NEW: filter concerts based on query params ---
  const filteredConcerts = useMemo(() => {
    const city = searchParams.get("city") || "any";
    const date = searchParams.get("date") || "any"; // "weekend" | "month" | "any"
    const genre = searchParams.get("genre") || "any"; // optional
    const price = searchParams.get("price") || "any"; // "free" | "under50" | "any"

    return typedConcerts.filter((c) => {
      // City filter
      if (city !== "any") {
        const cCity = (c.city || "").toLowerCase();
        if (!cCity.includes(city.toLowerCase())) return false;
      }

      // Date bucket filter (light demo logic)
      if (date !== "any") {
        const d = (c.date || "").toLowerCase();
        if (date === "weekend" && !d.includes("sat") && !d.includes("sun")) return false;
        if (date === "month" && !d) return false;
      }

      // Optional: Genre filter (only works if data has `genre`)
      if (genre !== "any") {
        const g = (c.genre || "").toLowerCase();
        if (!g.includes(genre.toLowerCase())) return false;
      }

      // Optional: Price filter (only works if data has `price`)
      if (price !== "any") {
        const p = (c.price || "").toLowerCase();
        if (price === "free" && !p.includes("free")) return false;

        if (price === "under50") {
          const num = Number(p.replace(/[^0-9]/g, ""));
          if (Number.isFinite(num) && num > 50) return false;
        }
      }

      return true;
    });
  }, [searchParams, typedConcerts]);

  const selectedConcert = useMemo(() => {
    if (!selectedId) return null;
    return typedConcerts.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, typedConcerts]);

  // Init + destroy map when switching modes
  useEffect(() => {
    if (viewMode !== "map") {
      // If leaving map view, clean up fully so re-entering works reliably.
      popupRef.current?.remove();
      popupRef.current = null;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      mapRef.current?.remove();
      mapRef.current = null;

      setMapError(null);
      return;
    }

    // map mode:
    if (!MAPBOX_TOKEN) {
      setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
      return;
    }
    if (!mapContainerRef.current) {
      setMapError("Map container not found.");
      return;
    }

    // Prevent double-init
    if (mapRef.current) return;

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      setMapError(null);

      const first = typedConcerts[0];
      const center = first ? getConcertCoords(first, 0) : { lng: -74.006, lat: 40.7128 };

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        // Use a known-stable style first (avoids “blank map” issues)
        style: "mapbox://styles/mapbox/streets-v12",
        center: [center.lng, center.lat],
        zoom: 11,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

      // If Mapbox fails to load style/tiles, show an error instead of blank white.
      map.on("error", (e) => {
        const msg =
          (e?.error && (e.error as any).message) ||
          "Map failed to load (token/style/network). Check console for details.";
        setMapError(msg);
      });

      // Critical: resize after mount / layout settle (fixes blank map after toggles)
      const resizeSoon = () => {
        try {
          map.resize();
        } catch {
          // ignore
        }
      };

      map.on("load", () => {
        resizeSoon();
        setTimeout(resizeSoon, 0);
        setTimeout(resizeSoon, 250);

        // Add markers
        markersRef.current = typedConcerts.map((c, i) => {
          const coords = getConcertCoords(c, i);

          const el = document.createElement("button");
          el.type = "button";
          el.className =
            "w-4 h-4 rounded-full bg-primary shadow-[0_0_0_6px_rgba(0,0,0,0.08)] hover:scale-110 transition-transform";
          el.setAttribute("aria-label", "Concert location");
          el.addEventListener("click", () => setSelectedId(c.id));

          return new mapboxgl.Marker({ element: el }).setLngLat([coords.lng, coords.lat]).addTo(map);
        });
      });

      // Also resize on next paint (helps in some browsers)
      requestAnimationFrame(resizeSoon);
      setTimeout(resizeSoon, 300);
    } catch (err: any) {
      setMapError(err?.message ?? "Map initialization failed.");
    }
  }, [viewMode, typedConcerts]);

  // Popup on selection
  useEffect(() => {
    if (viewMode !== "map") return;
    if (!mapRef.current) return;
    if (!selectedConcert) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }

    const i = Math.max(0, typedConcerts.findIndex((c) => c.id === selectedConcert.id));
    const { lng, lat } = getConcertCoords(selectedConcert, i);

    popupRef.current?.remove();

    const title = selectedConcert.title ?? selectedConcert.artist ?? "Live show";
    const venue = selectedConcert.venue ?? "Venue TBA";
    const city = selectedConcert.city ?? "";
    const date = selectedConcert.date ?? "";
    const labelLine = [venue, city].filter(Boolean).join(" • ");

    const gmapsQuery = encodeURIComponent([venue, city].filter(Boolean).join(" "));
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${gmapsQuery}`;

    const html = `
      <div class="min-w-[220px] max-w-[280px]">
        <div class="font-semibold text-sm">${title}</div>
        <div class="text-xs opacity-80 mt-1">${labelLine}</div>
        ${date ? `<div class="text-xs opacity-70 mt-1">${date}</div>` : ""}
        <a class="text-xs mt-3 inline-flex items-center gap-1 underline" href="${gmapsUrl}" target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
      </div>
    `;

    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: "320px",
      offset: 16,
    })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(mapRef.current);

    popupRef.current = popup;

    mapRef.current.easeTo({
      center: [lng, lat],
      zoom: Math.max(mapRef.current.getZoom(), 12),
      duration: 600,
    });
  }, [selectedConcert, typedConcerts, viewMode]);

  return (
    <div className="p-4 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Concert Map</h1>
          <p className="text-muted-foreground mt-2">Discover live events near you</p>
        </div>

        <div className="flex items-center gap-3">
          {/* NEW: Navigate to filters page */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/concerts/filters")}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>

          <div className="flex items-center bg-secondary rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="List view"
              type="button"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "map"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Map view"
              type="button"
            >
              <MapPin className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <section>
          <SectionHeader title="Upcoming Events" subtitle="Don't miss these shows" />
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* NEW: render filteredConcerts */}
            {filteredConcerts.map((concert) => (
              <ConcertCard key={concert.id} concert={concert as any} />
            ))}
          </div>
        </section>
      ) : (
        <div className="relative h-[60vh] min-h-[420px] rounded-2xl bg-card border border-border overflow-hidden">
          {!MAPBOX_TOKEN ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="max-w-md">
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                  <MapPin className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Mapbox token missing</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Add{" "}
                  <code className="px-1 py-0.5 rounded bg-secondary">
                    VITE_MAPBOX_TOKEN
                  </code>{" "}
                  in{" "}
                  <code className="px-1 py-0.5 rounded bg-secondary">
                    .env.local
                  </code>
                  , then restart the dev server.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div ref={mapContainerRef} className="absolute inset-0" />

              {/* Overlay hint */}
              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-background/70 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground border border-border">
                <ExternalLink className="w-3.5 h-3.5" />
                Click a pin to view details
              </div>

              {/* Error overlay (prevents “blank white box” mystery) */}
              {mapError && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-background/70 backdrop-blur">
                  <div className="max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
                    <h3 className="text-lg font-semibold">Map couldn’t load</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {mapError}
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Common fixes: restart{" "}
                      <code className="px-1 py-0.5 rounded bg-secondary">
                        npm run dev
                      </code>{" "}
                      after adding env vars, confirm your token allows{" "}
                      <code className="px-1 py-0.5 rounded bg-secondary">
                        localhost
                      </code>
                      , and ensure
                      <code className="px-1 py-0.5 rounded bg-secondary">
                        mapbox-gl/dist/mapbox-gl.css
                      </code>{" "}
                      is imported in{" "}
                      <code className="px-1 py-0.5 rounded bg-secondary">
                        main.tsx
                      </code>
                      .
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Featured Venues */}
      <section>
        <SectionHeader title="Featured Venues" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: "Madison Square Garden", city: "New York" },
            { name: "The Forum", city: "Los Angeles" },
            { name: "O2 Arena", city: "London" },
            { name: "Red Rocks", city: "Denver" },
          ].map((venue) => (
            <div
              key={venue.name}
              className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-colors cursor-pointer"
            >
              <h4 className="font-semibold text-sm">{venue.name}</h4>
              <p className="text-xs text-muted-foreground mt-1">{venue.city}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Concerts;
