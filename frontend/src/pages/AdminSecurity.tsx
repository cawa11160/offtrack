import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatabaseZap, ShieldAlert } from "lucide-react";
import {
  apiAdminAuditLogs,
  apiAdminClaimUploadOwner,
  apiAdminCatalogSync,
  apiAdminLockUser,
  apiAdminUnownedUploads,
  apiAdminUnlockUser,
  apiCatalogSyncStatus,
  type AdminAuditLog,
  type CatalogSyncRun,
  type UploadedTrackItem,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

const ADMIN_KEY_STORAGE = "offtrack_admin_api_key";

function readAdminApiKey() {
  const legacy = window.localStorage.getItem(ADMIN_KEY_STORAGE);
  if (legacy) {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, legacy);
  }
  return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

function formatTs(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AdminSecurity() {
  const navigate = useNavigate();
  const [adminApiKey, setAdminApiKey] = useState(() => readAdminApiKey());
  const [userId, setUserId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [reason, setReason] = useState("manual_admin_lock");
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [syncRuns, setSyncRuns] = useState<CatalogSyncRun[]>([]);
  const [unownedUploads, setUnownedUploads] = useState<UploadedTrackItem[]>([]);
  const [claimOwnerByUpload, setClaimOwnerByUpload] = useState<Record<string, string>>({});
  const [syncQuery, setSyncQuery] = useState("");
  const [syncLimit, setSyncLimit] = useState("10");
  const [syncEnrich, setSyncEnrich] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [claimBusyByUpload, setClaimBusyByUpload] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const parsedUserId = useMemo(() => Number(userId), [userId]);

  function persistKey(v: string) {
    const next = v.trim();
    setAdminApiKey(next);
    if (next) {
      window.sessionStorage.setItem(ADMIN_KEY_STORAGE, next);
    } else {
      window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    }
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    window.dispatchEvent(new Event("admin-key-change"));
  }

  async function refreshLogs() {
    if (!adminApiKey) {
      setError("Admin API key is required.");
      return;
    }
    setError("");
    setMessage("");
    setLoadingLogs(true);
    try {
      const data = await apiAdminAuditLogs({ adminApiKey, limit: 100 });
      setLogs(data);
      setMessage(`Loaded ${data.length} audit logs.`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load audit logs"));
    } finally {
      setLoadingLogs(false);
    }
  }

  async function refreshSyncRuns() {
    setError("");
    setMessage("");
    try {
      const data = await apiCatalogSyncStatus(8);
      setSyncRuns(data);
      setMessage(`Loaded ${data.length} catalog sync runs.`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load catalog sync status"));
    }
  }

  async function runCatalogSync() {
    if (!adminApiKey) return setError("Admin API key is required.");
    const limit = Number(syncLimit);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 50) return setError("Sync limit must be between 1 and 50.");

    setSyncBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiAdminCatalogSync({
        adminApiKey,
        query: syncQuery.trim(),
        limit,
        enrich: syncEnrich,
      });
      setMessage(
        `Catalog sync completed: ${result.inserted} inserted, ${result.updated} updated, ${result.refs} refs, ${result.genres} genres.`
      );
      await refreshSyncRuns();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to run catalog sync"));
    } finally {
      setSyncBusy(false);
    }
  }

  async function refreshUnownedUploads() {
    if (!adminApiKey) {
      setError("Admin API key is required.");
      return;
    }
    setError("");
    setMessage("");
    try {
      const data = await apiAdminUnownedUploads({ adminApiKey, limit: 100 });
      setUnownedUploads(data);
      setClaimOwnerByUpload(Object.fromEntries(data.map((item) => [item.id, ""])));
      setMessage(`Loaded ${data.length} unowned uploads.`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load unowned uploads"));
    }
  }

  async function claimUpload(upload: UploadedTrackItem) {
    if (!adminApiKey) return setError("Admin API key is required.");
    const ownerUserId = Number(claimOwnerByUpload[upload.id]);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) return setError("Valid artist user ID is required.");

    setClaimBusyByUpload((prev) => ({ ...prev, [upload.id]: true }));
    setError("");
    setMessage("");
    try {
      await apiAdminClaimUploadOwner({ adminApiKey, uploadId: upload.id, ownerUserId });
      setUnownedUploads((prev) => prev.filter((item) => item.id !== upload.id));
      setMessage(`Upload "${upload.title}" assigned to artist user ${ownerUserId}.`);
      await refreshLogs();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to claim upload"));
    } finally {
      setClaimBusyByUpload((prev) => ({ ...prev, [upload.id]: false }));
    }
  }

  async function lockUser() {
    if (!adminApiKey) return setError("Admin API key is required.");
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) return setError("Valid user ID is required.");
    const lockMinutes = Number(minutes);
    if (!Number.isInteger(lockMinutes) || lockMinutes <= 0) return setError("Minutes must be a positive integer.");

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await apiAdminLockUser({
        adminApiKey,
        userId: parsedUserId,
        minutes: lockMinutes,
        reason: reason.trim() || "manual_admin_lock",
      });
      setMessage(`User ${res.userId} locked until ${res.lockedUntil || "N/A"}.`);
      await refreshLogs();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to lock user"));
    } finally {
      setBusy(false);
    }
  }

  async function unlockUser() {
    if (!adminApiKey) return setError("Admin API key is required.");
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) return setError("Valid user ID is required.");

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await apiAdminUnlockUser({ adminApiKey, userId: parsedUserId });
      setMessage(`User ${res.userId} unlocked.`);
      await refreshLogs();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to unlock user"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-black text-white">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold">Admin Security</h1>
            <p className="text-sm text-muted-foreground">Lock/unlock users and inspect security audit logs.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          Back to Settings
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Admin Credentials</h2>
          <label className="mt-3 block text-sm font-medium">Admin API key</label>
          <input
            value={adminApiKey}
            onChange={(e) => persistKey(e.target.value)}
            type="password"
            placeholder="Paste ADMIN_API_KEY"
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">User Lock Controls</h2>
          <div className="mt-3 grid gap-2">
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID (numeric)"
              className="rounded-xl border border-border px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="Minutes"
                className="rounded-xl border border-border px-3 py-2 text-sm"
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason"
                className="rounded-xl border border-border px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={lockUser}
                disabled={busy}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                Lock user
              </button>
              <button
                type="button"
                onClick={unlockUser}
                disabled={busy}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
              >
                Unlock user
              </button>
              <button
                type="button"
                onClick={refreshLogs}
                disabled={loadingLogs}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
              >
                {loadingLogs ? "Loading..." : "Refresh logs"}
              </button>
            </div>
          </div>
          {message ? <div className="mt-3 text-sm text-green-700">{message}</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-black text-white">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Catalog Sync</h2>
              <p className="text-sm text-muted-foreground">Pull current metadata into the canonical music catalog.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshSyncRuns}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Refresh status
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_140px]">
          <input
            value={syncQuery}
            onChange={(e) => setSyncQuery(e.target.value)}
            placeholder="Optional query, e.g. SZA or indie pop"
            className="rounded-xl border border-border px-3 py-2 text-sm"
          />
          <input
            value={syncLimit}
            onChange={(e) => setSyncLimit(e.target.value)}
            placeholder="Limit"
            className="rounded-xl border border-border px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
            <input type="checkbox" checked={syncEnrich} onChange={(e) => setSyncEnrich(e.target.checked)} />
            Enrich
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runCatalogSync}
            disabled={syncBusy}
            className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {syncBusy ? "Syncing..." : "Run sync"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2">Started</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Query</th>
                <th className="px-2 py-2">Inserted</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Refs</th>
                <th className="px-2 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-muted-foreground" colSpan={7}>
                    No sync runs loaded.
                  </td>
                </tr>
              ) : (
                syncRuns.map((run) => (
                  <tr key={run.id} className="border-b border-border/70">
                    <td className="px-2 py-2">{formatTs(run.startedAt)}</td>
                    <td className="px-2 py-2">{run.status}</td>
                    <td className="px-2 py-2">{run.query || "trending"}</td>
                    <td className="px-2 py-2">{run.inserted}</td>
                    <td className="px-2 py-2">{run.updated}</td>
                    <td className="px-2 py-2">{run.refs}</td>
                    <td className="max-w-[280px] truncate px-2 py-2">{run.error || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Upload Ownership</h2>
            <p className="text-sm text-muted-foreground">Assign older unowned uploads to artist accounts.</p>
          </div>
          <button
            type="button"
            onClick={refreshUnownedUploads}
            className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Load unowned uploads
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2">Title</th>
                <th className="px-2 py-2">Artist</th>
                <th className="px-2 py-2">Storage</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">Artist User ID</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {unownedUploads.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-muted-foreground" colSpan={6}>
                    No unowned uploads loaded.
                  </td>
                </tr>
              ) : (
                unownedUploads.map((upload) => (
                  <tr key={upload.id} className="border-b border-border/70">
                    <td className="px-2 py-2">{upload.title}</td>
                    <td className="px-2 py-2">{upload.artist || "-"}</td>
                    <td className="px-2 py-2">{upload.storageBackend || "unknown"}</td>
                    <td className="px-2 py-2">{upload.sizeBytes ?? 0}</td>
                    <td className="px-2 py-2">
                      <input
                        value={claimOwnerByUpload[upload.id] || ""}
                        onChange={(e) =>
                          setClaimOwnerByUpload((prev) => ({ ...prev, [upload.id]: e.target.value }))
                        }
                        placeholder="Artist user ID"
                        className="w-36 rounded-xl border border-border px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => void claimUpload(upload)}
                        disabled={claimBusyByUpload[upload.id]}
                        className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {claimBusyByUpload[upload.id] ? "Claiming..." : "Claim"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Recent Audit Logs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Actor</th>
                <th className="px-2 py-2">User</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">IP</th>
                <th className="px-2 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-muted-foreground" colSpan={7}>
                    No logs loaded.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-b border-border/70">
                    <td className="px-2 py-2">{formatTs(l.createdAt)}</td>
                    <td className="px-2 py-2">{l.action}</td>
                    <td className="px-2 py-2">{l.actor}</td>
                    <td className="px-2 py-2">{l.userId ?? "-"}</td>
                    <td className="px-2 py-2">{l.email || "-"}</td>
                    <td className="px-2 py-2">{l.ip || "-"}</td>
                    <td className="px-2 py-2">{l.reason || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
