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
  source?: string;
  sourceType?: "catalog" | "upload" | string;
  recommendationRequestId?: string;
  recommendationRank?: number;
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
  recommendationRequestId?: string;
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
  event:
    | "like"
    | "superlike"
    | "dislike"
    | "not_interested"
    | "save"
    | "share"
    | "replay"
    | "play"
    | "play_start"
    | "play_30s"
    | "play_complete"
    | "skip"
    | "upload_play"
    | "open_spotify"
    | "click_recommendation"
    | "artist_click"
    | "genre_click"
    | "follow_artist",
  context?: {
    artistId?: number;
    genreId?: number;
    durationMs?: number;
    playPositionMs?: number;
    sourcePage?: string;
    recommendationRequestId?: string;
    recommendationRank?: number;
    extra?: Record<string, unknown>;
  }
): Promise<boolean> {
  const r = await apiFetch(`/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track_id: trackId,
      event,
      distinct_id: getDistinctId(),
      artist_id: context?.artistId ?? null,
      genre_id: context?.genreId ?? null,
      duration_ms: context?.durationMs ?? null,
      play_position_ms: context?.playPositionMs ?? null,
      source_page: context?.sourcePage ?? null,
      recommendation_request_id: context?.recommendationRequestId ?? null,
      recommendation_rank: context?.recommendationRank ?? null,
      context: context?.extra ?? null,
    }),
  });
  if (!r.ok) return false;
  return true;
}

export type MusicWebNode = {
  id: string;
  type: "user" | "track" | "artist" | "genre";
  label: string;
  subtitle?: string;
  imageUrl?: string | null;
  source?: string;
  weight?: number;
  lastEvent?: string;
  lastSeenAt?: string;
};

export type MusicWebEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
};

export type MusicWebResponse = {
  distinctId: string;
  hasData: boolean;
  nodes: MusicWebNode[];
  edges: MusicWebEdge[];
  stats: {
    events?: Record<string, number>;
    topArtists?: Array<{ name: string; score: number }>;
    topGenres?: Array<{ name: string; score: number }>;
    trackCount?: number;
    interactionCount?: number;
  };
};

export async function apiGetMusicWeb(limit = 120): Promise<MusicWebResponse> {
  const q = new URLSearchParams({ distinct_id: getDistinctId(), limit: String(limit) });
  const r = await apiFetch(`/api/profile/music-web?${q.toString()}`);
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as MusicWebResponse;
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
  audioUrl?: string | null;
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number | null;
  waveformPeaks?: number[];
  processingStatus?: string | null;
  processingError?: string | null;
  storageBackend?: string;
  storagePath?: string | null;
  ownerUserId?: number | null;
  isPublished?: boolean;
  createdAt?: string;
  metrics?: ArtistTrackMetrics;
};

export type ArtistTrackMetrics = {
  eventCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  uniqueListeners: number;
  qualifiedListeners: number;
  lastInteractionAt?: string | null;
  discoveryScore?: {
    value: number;
    label: string;
    nextAction: string;
    reasons: string[];
    rates: {
      completion: number;
      save: number;
      conversion: number;
      skip: number;
      qualified: number;
    };
  };
};

export type ArtistDashboard = {
  artist: {
    id: number;
    name?: string;
    email: string;
    emailVerified: boolean;
  };
  summary: {
    totalTracks: number;
    publishedTracks: number;
    totalInteractions: number;
    uniqueListeners: number;
    qualifiedConnections: number;
    plays: number;
    likes: number;
    recommendationClicks: number;
    conversionClicks: number;
    averageDiscoveryScore?: number;
  };
  eventCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  tracks: UploadedTrackItem[];
  recentInteractions: Array<{
    id: number;
    trackId: string;
    trackTitle: string;
    event: string;
    sourcePage?: string | null;
    listenerKey: string;
    createdAt?: string;
  }>;
};

export async function apiListUploads(limit = 50): Promise<UploadedTrackItem[]> {
  const r = await apiFetch(`/api/uploads?limit=${limit}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.tracks ?? []) as UploadedTrackItem[];
}

export async function apiListManagedUploads(limit = 100): Promise<UploadedTrackItem[]> {
  const r = await apiFetch(`/api/uploads/manage?limit=${limit}`);
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.tracks ?? []) as UploadedTrackItem[];
}

export async function apiGetArtistDashboard(): Promise<ArtistDashboard> {
  const r = await apiFetch("/api/artist/dashboard");
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as ArtistDashboard;
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

export async function apiUpdateUpload(args: {
  id: string;
  title?: string;
  artist?: string;
  imageUrl?: string;
  isPublished?: boolean;
}): Promise<UploadedTrackItem> {
  const r = await apiFetch(`/api/uploads/${encodeURIComponent(args.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: args.title ?? undefined,
      artist: args.artist ?? undefined,
      image_url: args.imageUrl ?? undefined,
      is_published: args.isPublished ?? undefined,
    }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as UploadedTrackItem;
}

export async function apiReplaceUploadAudio(args: { id: string; file: File }): Promise<UploadedTrackItem> {
  const fd = new FormData();
  fd.append("file", args.file);
  const r = await apiFetch(`/api/uploads/${encodeURIComponent(args.id)}/replace`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as UploadedTrackItem;
}

export async function apiUnpublishUpload(id: string): Promise<UploadedTrackItem | null> {
  const r = await apiFetch(`/api/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.track ?? null) as UploadedTrackItem | null;
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

export type CatalogSyncRun = {
  id: string;
  provider: string;
  status: string;
  query?: string | null;
  inserted: number;
  updated: number;
  refs: number;
  error?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
};

export type CatalogSyncResult = {
  ok: boolean;
  runId: string;
  inserted: number;
  updated: number;
  refs: number;
  genres: number;
  fetched: number;
  providerNotes?: Record<string, string>;
};

export type RecommenderMetrics = {
  windowDays: number;
  generatedAt: string;
  events: Record<string, number>;
  impressions: number;
  positiveSignals: number;
  negativeSignals: number;
  rates: Record<string, number>;
  qualityScore: number;
};

export type RecommenderEvaluation = {
  windowDays: number;
  generatedAt: string;
  artifactTrackCount: number;
  impressionsWithOutcome: number;
  pairwiseAccuracy: number;
  positivePrecisionWhenScorePositive: number;
  pairCount: number;
};

export type RecommenderArtifactInfo = {
  name: string;
  path: string;
  current: boolean;
  previous: boolean;
  generatedAt?: string | null;
  trackCount?: number | null;
  sizeBytes: number;
};

export type RecommenderArtifactsResponse = {
  current: string;
  artifacts: RecommenderArtifactInfo[];
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

export async function apiAdminUnownedUploads(args: {
  adminApiKey: string;
  limit?: number;
}): Promise<UploadedTrackItem[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
  const r = await adminFetch(`/api/admin/uploads/unowned?limit=${limit}`, args.adminApiKey);
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.tracks ?? []) as UploadedTrackItem[];
}

export async function apiAdminClaimUploadOwner(args: {
  adminApiKey: string;
  uploadId: string;
  ownerUserId: number;
}): Promise<UploadedTrackItem | null> {
  const r = await adminFetch(`/api/admin/uploads/${encodeURIComponent(args.uploadId)}/claim`, args.adminApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_user_id: args.ownerUserId }),
  });
  if (!r.ok) throw new Error(await readError(r));
  const data = await r.json().catch(() => ({}));
  return (data?.track ?? null) as UploadedTrackItem | null;
}

export async function apiCatalogSyncStatus(limit = 5): Promise<CatalogSyncRun[]> {
  const r = await apiFetch(`/api/catalog/sync/status?limit=${Math.max(1, Math.min(limit, 20))}`);
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return (data?.runs ?? []) as CatalogSyncRun[];
}

export async function apiAdminCatalogSync(args: {
  adminApiKey: string;
  query?: string;
  limit?: number;
  enrich?: boolean;
}): Promise<CatalogSyncResult> {
  const r = await adminFetch(`/api/admin/catalog/sync`, args.adminApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: args.query ?? "",
      limit: Math.max(1, Math.min(args.limit ?? 10, 50)),
      enrich: args.enrich ?? true,
    }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as CatalogSyncResult;
}

export async function apiAdminRecommenderMetrics(args: {
  adminApiKey: string;
  days?: number;
}): Promise<RecommenderMetrics> {
  const days = Math.max(1, Math.min(args.days ?? 7, 90));
  const r = await adminFetch(`/api/admin/recommender/metrics?days=${days}`, args.adminApiKey);
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as RecommenderMetrics;
}

export async function apiAdminRecommenderEvaluation(args: {
  adminApiKey: string;
  days?: number;
}): Promise<RecommenderEvaluation> {
  const days = Math.max(1, Math.min(args.days ?? 30, 180));
  const r = await adminFetch(`/api/admin/recommender/evaluation?days=${days}`, args.adminApiKey);
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as RecommenderEvaluation;
}

export async function apiAdminRecommenderArtifacts(args: {
  adminApiKey: string;
}): Promise<RecommenderArtifactsResponse> {
  const r = await adminFetch("/api/admin/recommender/artifacts", args.adminApiKey);
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as RecommenderArtifactsResponse;
}

export async function apiAdminBuildRewardArtifact(args: {
  adminApiKey: string;
}): Promise<{ ok: boolean; version?: number; generatedAt?: string; trackCount: number }> {
  const r = await adminFetch("/api/admin/recommender/reward-artifact", args.adminApiKey, { method: "POST" });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as { ok: boolean; version?: number; generatedAt?: string; trackCount: number };
}

export async function apiAdminRollbackRewardArtifact(args: {
  adminApiKey: string;
  name?: string;
}): Promise<{ ok: boolean; restored: string; current: string; trackCount: number }> {
  const r = await adminFetch("/api/admin/recommender/rollback", args.adminApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: args.name ?? null }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as { ok: boolean; restored: string; current: string; trackCount: number };
}

export async function apiAdminBuildTrainingDataset(args: {
  adminApiKey: string;
  days?: number;
}): Promise<{ ok: boolean; path: string; rowCount: number; windowDays: number }> {
  const r = await adminFetch("/api/admin/recommender/training-dataset", args.adminApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: Math.max(1, Math.min(args.days ?? 90, 365)) }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as { ok: boolean; path: string; rowCount: number; windowDays: number };
}

export async function apiAdminTrainRanker(args: {
  adminApiKey: string;
  days?: number;
}): Promise<{ ok: boolean; dataset: { rowCount: number; path: string }; ranker: { kind?: string; generatedAt?: string; trackCount: number } }> {
  const r = await adminFetch("/api/admin/recommender/train-ranker", args.adminApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: Math.max(1, Math.min(args.days ?? 90, 365)) }),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as { ok: boolean; dataset: { rowCount: number; path: string }; ranker: { kind?: string; generatedAt?: string; trackCount: number } };
}
