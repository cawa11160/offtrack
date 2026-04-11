import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { apiAdminAuditLogs, apiAdminLockUser, apiAdminUnlockUser, type AdminAuditLog } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

const ADMIN_KEY_STORAGE = "offtrack_admin_api_key";

function formatTs(v?: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AdminSecurity() {
  const navigate = useNavigate();
  const [adminApiKey, setAdminApiKey] = useState(() => localStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const [userId, setUserId] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [reason, setReason] = useState("manual_admin_lock");
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const parsedUserId = useMemo(() => Number(userId), [userId]);

  function persistKey(v: string) {
    const next = v.trim();
    setAdminApiKey(next);
    localStorage.setItem(ADMIN_KEY_STORAGE, next);
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
