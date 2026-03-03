import "mapbox-gl/dist/mapbox-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { Map, Marker, Popup } from "mapbox-gl";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Music2 } from "lucide-react";

import { concerts } from "@/data/mockData";

type ConcertLike = {
  id: string;
  title?: string;
  artist?: string;
  venue?: string;
  city?: string;
  date?: string;
  ticketUrl?: string;
  lat?: number;
  lng?: number;
  genre?: string;
  price?: string;
};

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim();

async function initMapboxCspWorker() {
  try {
    // @ts-expect-error - Vite worker import
    const mod = await import("mapbox-gl/dist/mapbox-gl-csp-worker?worker");
    // @ts-expect-error - mapboxgl.workerClass is not typed in all versions
    mapboxgl.workerClass = mod.default;
  } catch {
    // No-op.
  }
}

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

  const base = { lng: -74.006, lat: 40.7128 };
  const jitter = (n: number) => (n % 2 === 0 ? 1 : -1) * (0.01 + (n % 5) * 0.003);
  return { lng: base.lng + jitter(index), lat: base.lat + jitter(index + 1) };
}

function prettyDate(value?: string) {
  if (!value) return "Date TBA";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return value;
}

const Concerts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const popupRef = useRef<Popup | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const typedConcerts = concerts as unknown as ConcertLike[];

  const filteredConcerts = useMemo(() => {
    const city = searchParams.get("city") || "any";
    const date = searchParams.get("date") || "any";
    const genre = searchParams.get("genre") || "any";
    const price = searchParams.get("price") || "any";

    return typedConcerts.filter((c) => {
      if (city !== "any") {
        const cCity = (c.city || "").toLowerCase();
        if (!cCity.includes(city.toLowerCase())) return false;
      }

      if (date !== "any") {
        const d = (c.date || "").toLowerCase();
        if (date === "weekend" && !d.includes("sat") && !d.includes("sun")) return false;
        if (date === "month" && !d) return false;
      }

      if (genre !== "any") {
        const g = (c.genre || "").toLowerCase();
        if (!g.includes(genre.toLowerCase())) return false;
      }

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
    if (!selectedId) return filteredConcerts[0] ?? null;
    return filteredConcerts.find((c) => c.id === selectedId) ?? filteredConcerts[0] ?? null;
  }, [filteredConcerts, selectedId]);

  useEffect(() => {
    if (!filteredConcerts.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredConcerts.some((c) => c.id === selectedId)) {
      setSelectedId(filteredConcerts[0].id);
    }
  }, [filteredConcerts, selectedId]);

  useEffect(() => {
    if (!mapboxgl.supported()) {
      setMapError("WebGL is not available in this browser/device.");
      return;
    }

    void initMapboxCspWorker();

    if (!MAPBOX_TOKEN) {
      setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
      return;
    }
    if (!mapContainerRef.current) {
      setMapError("Map container not found.");
      return;
    }
    if (mapRef.current) return;

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      setMapError(null);

      const first = filteredConcerts[0] ?? typedConcerts[0];
      const center = first ? getConcertCoords(first, 0) : { lng: -74.006, lat: 40.7128 };

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [center.lng, center.lat],
        zoom: 11,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      mapRef.current = map;

      map.on("error", (e) => {
        const msg =
          (e?.error && (e.error as { message?: string }).message) ||
          "Map failed to load (token/style/network).";
        setMapError(msg);
      });

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
      });

      requestAnimationFrame(resizeSoon);
      setTimeout(resizeSoon, 300);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Map initialization failed.";
      setMapError(message);
    }

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [filteredConcerts, typedConcerts]);

  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    markersRef.current = filteredConcerts.map((c, i) => {
      const coords = getConcertCoords(c, i);
      const isSelected = c.id === selectedConcert?.id;

      const el = document.createElement("button");
      el.type = "button";
      el.className = isSelected
        ? "h-4 w-4 rounded-full bg-black shadow-[0_0_0_6px_rgba(0,0,0,0.15)]"
        : "h-4 w-4 rounded-full bg-[#ff9494] shadow-[0_0_0_6px_rgba(0,0,0,0.08)]";
      el.setAttribute("aria-label", "Concert location");
      el.addEventListener("click", () => setSelectedId(c.id));

      return new mapboxgl.Marker({ element: el }).setLngLat([coords.lng, coords.lat]).addTo(mapRef.current!);
    });
  }, [filteredConcerts, selectedConcert?.id]);

  useEffect(() => {
    if (!mapRef.current || !selectedConcert) return;

    const idx = Math.max(0, filteredConcerts.findIndex((c) => c.id === selectedConcert.id));
    const { lng, lat } = getConcertCoords(selectedConcert, idx);

    popupRef.current?.remove();

    const title = selectedConcert.artist ?? selectedConcert.title ?? "Concert";
    const venue = selectedConcert.venue ?? "Venue TBA";
    const city = selectedConcert.city ?? "";
    const date = prettyDate(selectedConcert.date);

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 14 })
      .setLngLat([lng, lat])
      .setHTML(
        `<div style="font-family:Arimo,sans-serif;font-weight:700;color:#000;line-height:1.25;min-width:180px">` +
          `<div>${title}</div><div style="margin-top:2px">${venue}</div><div style="margin-top:4px">${date}</div></div>`
      )
      .addTo(mapRef.current);

    popupRef.current = popup;

    mapRef.current.easeTo({
      center: [lng, lat],
      zoom: Math.max(mapRef.current.getZoom(), 11.5),
      duration: 500,
    });
  }, [filteredConcerts, selectedConcert]);

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-32">
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

        <div className="mt-5">
          <h1 className="font-['Arimo',sans-serif] text-[56px] font-bold leading-none text-black sm:text-[60px]">Map</h1>
          <p className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">
            Discover music gigs close to you
          </p>
        </div>

        <div className="mt-4 grid w-full gap-0 lg:grid-cols-[361px_1fr]">
          <aside className="h-[420px] rounded-t-[10px] bg-[#d9d9d9] px-[14px] py-[23px] lg:h-[662px] lg:rounded-l-[10px] lg:rounded-r-none">
            <div className="space-y-7 font-['Arimo',sans-serif] text-[20px] font-bold leading-tight text-black">
              {filteredConcerts.slice(0, 8).map((concert, index) => {
                const title = `Concert ${index + 1}`;
                const venue = concert.venue ?? "Venue TBA";
                const isSelected = concert.id === selectedConcert?.id;

                return (
                  <button
                    key={concert.id}
                    type="button"
                    onClick={() => setSelectedId(concert.id)}
                    className={
                      isSelected
                        ? "flex w-full items-end justify-between rounded-[8px] bg-white/70 px-2 py-1 text-left"
                        : "flex w-full items-end justify-between text-left"
                    }
                  >
                    <div>
                      <p>{title}</p>
                      <p>{venue}</p>
                    </div>
                    <span className="underline underline-offset-2">Tickets</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="relative h-[420px] overflow-hidden rounded-b-[10px] bg-[#e7e7e7] lg:h-[662px] lg:rounded-l-none lg:rounded-r-[10px] lg:rounded-bl-none">
            {!MAPBOX_TOKEN ? (
              <div className="grid h-full place-items-center p-6 text-center font-['Arimo',sans-serif] text-[22px] font-bold text-black">
                Missing Mapbox token (`VITE_MAPBOX_TOKEN`)
              </div>
            ) : (
              <>
                <div ref={mapContainerRef} className="absolute inset-0" />
                {mapError && (
                  <div className="absolute inset-0 grid place-items-center bg-white/75 p-6 text-center font-['Arimo',sans-serif] text-[20px] font-bold text-black">
                    {mapError}
                  </div>
                )}
              </>
            )}

            <div className="absolute bottom-6 right-6 w-[min(361px,calc(100%-2rem))] rounded-[10px] bg-[#d9d9d9] p-2">
              <div className="font-['Arimo',sans-serif] text-[20px] font-bold leading-tight text-black">
                <p>Concert</p>
                <p>{selectedConcert?.artist ?? selectedConcert?.title ?? "Wetleg"}</p>
                <p className="mt-1">{prettyDate(selectedConcert?.date)}</p>
                <p>
                  Location: {selectedConcert?.venue ?? "30 Bowery St"}
                  {selectedConcert?.city ? `, ${selectedConcert.city}` : ""}
                </p>
                <a
                  href={selectedConcert?.ticketUrl && selectedConcert.ticketUrl !== "#" ? selectedConcert.ticketUrl : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  More info
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Concerts;
