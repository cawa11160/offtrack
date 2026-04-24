import { useEffect, useState } from "react";

import { concerts, type Concert } from "@/data/mockData";

export type LiveConcert = Concert & {
  source: "ticketmaster" | "local";
  sourceLabel: string;
};

type LiveEventsState = {
  concerts: LiveConcert[];
  loading: boolean;
  source: "ticketmaster" | "local";
  error: string | null;
  refreshedAt: Date;
};

type TicketmasterImage = {
  url?: string;
  width?: number;
  ratio?: string;
};

type TicketmasterVenue = {
  name?: string;
  city?: { name?: string };
  state?: { stateCode?: string; name?: string };
  location?: { latitude?: string; longitude?: string };
};

type TicketmasterEvent = {
  id?: string;
  name?: string;
  url?: string;
  images?: TicketmasterImage[];
  dates?: {
    start?: {
      localDate?: string;
      localTime?: string;
    };
  };
  _embedded?: {
    venues?: TicketmasterVenue[];
    attractions?: Array<{ name?: string }>;
  };
};

const TICKETMASTER_KEY = (import.meta.env.VITE_TICKETMASTER_API_KEY as string | undefined)?.trim();
const DEFAULT_EVENT_CITY = (import.meta.env.VITE_DEFAULT_EVENT_CITY as string | undefined)?.trim() || "New York";
const DEFAULT_EVENT_STATE = (import.meta.env.VITE_DEFAULT_EVENT_STATE_CODE as string | undefined)?.trim() || "NY";
const DEFAULT_EVENT_COUNTRY = (import.meta.env.VITE_DEFAULT_EVENT_COUNTRY_CODE as string | undefined)?.trim() || "US";
const FALLBACK_OFFSETS = [0, 1, 3, 5, 7, 10, 14, 18, 21, 25, 28, 32, 36];

function localDateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function ticketSearchUrl(artist: string) {
  return `https://www.ticketmaster.com/search?q=${encodeURIComponent(artist)}`;
}

function bestTicketmasterImage(images?: TicketmasterImage[]) {
  const sorted = [...(images ?? [])].sort((a, b) => {
    const ratioA = a.ratio === "16_9" ? 1 : 0;
    const ratioB = b.ratio === "16_9" ? 1 : 0;
    return ratioB - ratioA || (b.width ?? 0) - (a.width ?? 0);
  });
  return sorted[0]?.url;
}

function formatTicketmasterTime(value?: string) {
  if (!value) return "Time TBA";
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "Time TBA";
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function mapTicketmasterEvent(event: TicketmasterEvent): LiveConcert | null {
  const venue = event._embedded?.venues?.[0];
  const artist = event._embedded?.attractions?.[0]?.name || event.name || "Live event";
  const date = event.dates?.start?.localDate;
  if (!event.id || !date) return null;
  const lat = Number(venue?.location?.latitude);
  const lng = Number(venue?.location?.longitude);
  const cityParts = [venue?.city?.name, venue?.state?.stateCode || venue?.state?.name].filter(Boolean);

  return {
    id: `tm-${event.id}`,
    artist,
    venue: venue?.name || "Venue TBA",
    city: cityParts.join(", ") || DEFAULT_EVENT_CITY,
    date,
    time: formatTicketmasterTime(event.dates?.start?.localTime),
    coverUrl: bestTicketmasterImage(event.images) || concerts[0]?.coverUrl || "",
    ticketUrl: event.url || ticketSearchUrl(artist),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    source: "ticketmaster",
    sourceLabel: "Ticketmaster live feed",
  };
}

export function getFallbackLiveConcerts(limit = concerts.length, referenceDate = new Date()): LiveConcert[] {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  return concerts.slice(0, limit).map((concert, index) => {
    const date = localDateString(addDays(today, FALLBACK_OFFSETS[index % FALLBACK_OFFSETS.length] + Math.floor(index / FALLBACK_OFFSETS.length) * 7));
    return {
      ...concert,
      date,
      ticketUrl: concert.ticketUrl && concert.ticketUrl !== "#" ? concert.ticketUrl : ticketSearchUrl(concert.artist),
      source: "local",
      sourceLabel: "Local venue feed",
    };
  });
}

export async function fetchLiveConcerts(limit = 16, signal?: AbortSignal): Promise<LiveEventsState> {
  const fallback = getFallbackLiveConcerts(limit);
  if (!TICKETMASTER_KEY) {
    return { concerts: fallback, loading: false, source: "local", error: null, refreshedAt: new Date() };
  }

  const params = new URLSearchParams({
    apikey: TICKETMASTER_KEY,
    classificationName: "music",
    city: DEFAULT_EVENT_CITY,
    stateCode: DEFAULT_EVENT_STATE,
    countryCode: DEFAULT_EVENT_COUNTRY,
    sort: "date,asc",
    size: String(Math.min(Math.max(limit, 1), 50)),
  });

  try {
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`, { signal });
    if (!res.ok) throw new Error(`Ticketmaster returned ${res.status}`);
    const data = (await res.json()) as { _embedded?: { events?: TicketmasterEvent[] } };
    const live = (data._embedded?.events ?? []).map(mapTicketmasterEvent).filter((event): event is LiveConcert => Boolean(event));
    if (!live.length) throw new Error("No live music events found");
    return { concerts: live, loading: false, source: "ticketmaster", error: null, refreshedAt: new Date() };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      concerts: fallback,
      loading: false,
      source: "local",
      error: error instanceof Error ? error.message : "Could not load live events",
      refreshedAt: new Date(),
    };
  }
}

export function useLiveConcerts(limit = 16): LiveEventsState {
  const [state, setState] = useState<LiveEventsState>(() => ({
    concerts: getFallbackLiveConcerts(limit),
    loading: Boolean(TICKETMASTER_KEY),
    source: TICKETMASTER_KEY ? "ticketmaster" : "local",
    error: null,
    refreshedAt: new Date(),
  }));

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: Boolean(TICKETMASTER_KEY) }));
    void fetchLiveConcerts(limit, controller.signal)
      .then(setState)
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ concerts: getFallbackLiveConcerts(limit), loading: false, source: "local", error: "Could not load live events", refreshedAt: new Date() });
        }
      });
    return () => controller.abort();
  }, [limit]);

  return state;
}
