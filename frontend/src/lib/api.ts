import { getAlreadyShownIds, getDistinctId } from "./analytics";
import { getAccessToken } from "./auth";

export type SearchResult = {
  title: string;
  artist?: string;
  year?: number | null;
  id?: string | null;
  imageUrl?: string;
  source?: "db" | "spotify";
};

export type SeedSong = {
  title: string;
  artist?: string;
  year?: number | null;
  id?: string | null;
};

export type RecItem = {
  id: string;
  title: string;
  artist: string;
  year?: number | null;
  popularity?: number;
  imageUrl?: string;

  previewUrl?: string | null;
  audioUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyUri?: string | null;
  spotifyArtistUrl?: string | null;
  durationMs?: number | null;

  reasons?: string[];
};

export type MusicianRec = {
  id: string;
  name: string;
  imageUrl?: string | null;
  spotifyUrl?: string | null;
  topTracks?: string[];
  reasons?: string[];
  concertsUrl?: string;
};

export type RecommendResponse = {
  recommendations: RecItem[];
  musicians?: MusicianRec[];
};

export type TrackDetail = {
  id?: string | null;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  previewUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyUri?: string | null;
  durationMs?: number | null;
  source?: string;
};

// If you set VITE_API_BASE_URL on Vercel (e.g. https://your-backend.com),
// we’ll call it directly. Otherwise we use same-origin (/api/*) which works
// great with a Vercel rewrite.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

export function apiUrl(path: string) {
  // Use backend base if configured; otherwise same-origin.
  return API_BASE ? `${API_BASE}${path}` : path;
}

function withDistinct(headers?: HeadersInit): HeadersInit {
  const h = new Headers(headers);
  // keep both: header for server logs + body field for explicit tracking
  h.set("X-Posthog-Distinct-Id", getDistinctId());
  const token = getAccessToken();
  if (token && !h.has("Authorization")) {
    h.set("Authorization", `Bearer ${token}`);
  }
  return h;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const url = apiUrl(path);
  return fetch(url, { credentials: init.credentials ?? "include", ...init, headers: withDistinct(init.headers) });
}

async function readError(r: Response): Promise<string> {
  // try json first, then text
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await r.json().catch(() => null);
    const msg =
      (j && (j.error || j.message || j.detail)) ? String(j.error || j.message || j.detail) : "";
    if (msg) return msg;
  }
  const t = await r.text().catch(() => "");
  return t || `${r.status} ${r.statusText}`;
}

export async function apiSearch(q: string, limit = 8): Promise<SearchResult[]> {
  const r = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.results ?? []) as SearchResult[];
}

export async function apiRecommend(
  seeds: SeedSong[],
  n = 9,
  mode: "all" | "indie" | "mainstream" = "all",
  alreadyShownIds: string[] = getAlreadyShownIds()
): Promise<RecommendResponse> {
  const r = await apiFetch(`/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seeds,
      n,
      mode,
      already_shown_ids: alreadyShownIds,
      distinct_id: getDistinctId()
    }),
  });

  if (!r.ok) {
    throw new Error(await readError(r));
  }
  return (await r.json()) as RecommendResponse;
}

export async function apiFeedback(
  trackId: string,
  event: "like" | "superlike" | "dislike" | "play" | "open_spotify" | "click_recommendation"
): Promise<boolean> {
  const r = await apiFetch(`/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, event, distinct_id: getDistinctId() }),
  });
  if (!r.ok) return false;
  return true;
}

export async function apiGetTrackDetail(args: {
  trackId?: string;
  title?: string;
  artist?: string;
}): Promise<TrackDetail> {
  const q = new URLSearchParams();
  if (args.trackId) q.set("track_id", args.trackId);
  if (args.title) q.set("title", args.title);
  if (args.artist) q.set("artist", args.artist);
  const r = await apiFetch(`/api/track?${q.toString()}`);
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as TrackDetail;
}

export type UploadedTrackItem = {
  id: string;
  title: string;
  artist?: string;
  imageUrl?: string | null;
  audioUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
};

export async function apiListUploads(limit = 50): Promise<UploadedTrackItem[]> {
  const r = await apiFetch(`/api/uploads?limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.tracks ?? []) as UploadedTrackItem[];
}

export async function apiUploadNewTrack(args: {
  title: string;
  artist?: string;
  imageUrl?: string;
  file: File;
}): Promise<UploadedTrackItem> {
  const fd = new FormData();
  fd.append("title", args.title);
  fd.append("artist", args.artist ?? "");
  fd.append("image_url", args.imageUrl ?? "");
  fd.append("file", args.file);

  const r = await apiFetch(`/api/uploads`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as UploadedTrackItem;
}

// -----------------------------
// Lyric AI reels / images
// -----------------------------
export type ReelItem = {
  id: string;
  downloadUrl?: string;
  sizeBytes?: number;
  createdAt?: string;
  mode?: "video" | "images";
  provider?: string;
  imageDataUrls?: string[];
  detail?: string;
};

export async function apiCreateReel(args: {
  lyrics: string;
  title?: string;
  artist?: string;
  output?: "video" | "images";
  imageCount?: number;
}): Promise<ReelItem> {
  const r = await apiFetch(`/api/reels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lyrics: args.lyrics,
      title: args.title ?? null,
      artist: args.artist ?? null,
      output: args.output ?? "video",
      image_count: args.imageCount ?? 4,
    }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as ReelItem;
}

export async function apiListReels(limit = 20): Promise<ReelItem[]> {
  const r = await apiFetch(`/api/reels?limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.reels ?? []) as ReelItem[];
}

// -----------------------------
// Billing
// -----------------------------
export type BillingPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName?: string | null;
  isDefault: boolean;
  createdAt?: string;
};

export type BillingReceipt = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  description: string;
  paymentMethodLast4?: string | null;
  createdAt?: string;
  downloadUrl: string;
};

export async function apiListPaymentMethods(): Promise<BillingPaymentMethod[]> {
  const r = await apiFetch("/api/billing/payment-methods");
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.methods ?? []) as BillingPaymentMethod[];
}

export async function apiAddPaymentMethod(args: {
  cardNumber: string;
  expMonth: number;
  expYear: number;
  holderName?: string;
  brand?: string;
  setDefault?: boolean;
}): Promise<BillingPaymentMethod> {
  const r = await apiFetch("/api/billing/payment-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      card_number: args.cardNumber,
      exp_month: args.expMonth,
      exp_year: args.expYear,
      holder_name: args.holderName ?? "",
      brand: args.brand ?? "card",
      set_default: args.setDefault ?? true,
    }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as BillingPaymentMethod;
}

export async function apiDeletePaymentMethod(methodId: string): Promise<void> {
  const r = await apiFetch(`/api/billing/payment-methods/${encodeURIComponent(methodId)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await readError(r));
}

export async function apiListReceipts(limit = 20): Promise<BillingReceipt[]> {
  const r = await apiFetch(`/api/billing/receipts?limit=${limit}`);
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.receipts ?? []) as BillingReceipt[];
}

export async function apiDownloadReceipt(receiptId: string): Promise<Blob> {
  const r = await apiFetch(`/api/billing/receipts/${encodeURIComponent(receiptId)}/download`);
  if (!r.ok) throw new Error(await readError(r));
  return await r.blob();
}

// -----------------------------
// Admin security
// -----------------------------
export type AdminAuditLog = {
  id: string;
  actor: string;
  action: string;
  userId?: number | null;
  email?: string | null;
  ip?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: string;
};

async function adminFetch(path: string, adminApiKey: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("X-Admin-Api-Key", adminApiKey);
  const r = await apiFetch(path, { ...init, headers });
  return r;
}

export async function apiAdminLockUser(args: {
  adminApiKey: string;
  userId: number;
  minutes: number;
  reason?: string;
}): Promise<{ ok: boolean; userId: number; lockedUntil?: string; reason?: string }> {
  const r = await adminFetch(`/api/admin/users/${args.userId}/lock`, args.adminApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minutes: args.minutes, reason: args.reason ?? "manual_admin_lock" }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as { ok: boolean; userId: number; lockedUntil?: string; reason?: string };
}

export async function apiAdminUnlockUser(args: {
  adminApiKey: string;
  userId: number;
}): Promise<{ ok: boolean; userId: number }> {
  const r = await adminFetch(`/api/admin/users/${args.userId}/unlock`, args.adminApiKey, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as { ok: boolean; userId: number };
}

export async function apiAdminAuditLogs(args: {
  adminApiKey: string;
  limit?: number;
}): Promise<AdminAuditLog[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
  const r = await adminFetch(`/api/admin/audit-logs?limit=${limit}`, args.adminApiKey);
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.logs ?? []) as AdminAuditLog[];
}
