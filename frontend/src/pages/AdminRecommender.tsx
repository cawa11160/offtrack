import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrainCircuit, Database, LineChart, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";

import {
  apiAdminBuildRewardArtifact,
  apiAdminBuildTrainingDataset,
  apiAdminRecommenderArtifacts,
  apiAdminRecommenderEvaluation,
  apiAdminRecommenderMetrics,
  apiAdminRollbackRewardArtifact,
  apiAdminTrainRanker,
  type RecommenderArtifactInfo,
  type RecommenderEvaluation,
  type RecommenderMetrics,
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

function formatTs(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function pct(v?: number) {
  return `${Math.round(Number(v || 0) * 1000) / 10}%`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[#f8f7f2] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
    </div>
  );
}

export default function AdminRecommender() {
  const navigate = useNavigate();
  const [adminApiKey, setAdminApiKey] = useState(() => readAdminApiKey());
  const [days, setDays] = useState("30");
  const [metrics, setMetrics] = useState<RecommenderMetrics | null>(null);
  const [evaluation, setEvaluation] = useState<RecommenderEvaluation | null>(null);
  const [artifacts, setArtifacts] = useState<RecommenderArtifactInfo[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const parsedDays = useMemo(() => Math.max(1, Math.min(Number(days) || 30, 365)), [days]);

  function persistKey(v: string) {
    const next = v.trim();
    setAdminApiKey(next);
    if (next) window.sessionStorage.setItem(ADMIN_KEY_STORAGE, next);
    else window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    window.dispatchEvent(new Event("admin-key-change"));
  }

  async function refreshAll() {
    if (!adminApiKey) {
      setError("Admin API key is required.");
      return;
    }
    setBusy("refresh");
    setError("");
    setMessage("");
    try {
      const [nextMetrics, nextEvaluation, artifactData] = await Promise.all([
        apiAdminRecommenderMetrics({ adminApiKey, days: Math.min(parsedDays, 90) }),
        apiAdminRecommenderEvaluation({ adminApiKey, days: Math.min(parsedDays, 180) }),
        apiAdminRecommenderArtifacts({ adminApiKey }),
      ]);
      setMetrics(nextMetrics);
      setEvaluation(nextEvaluation);
      setArtifacts(artifactData.artifacts);
      setMessage("Recommender data refreshed.");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load recommender data"));
    } finally {
      setBusy("");
    }
  }

  async function runAction(name: string, action: () => Promise<string>) {
    if (!adminApiKey) {
      setError("Admin API key is required.");
      return;
    }
    setBusy(name);
    setError("");
    setMessage("");
    try {
      setMessage(await action());
      await refreshAll();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Recommender action failed"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-black text-white">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-black/45">Admin</p>
            <h1 className="text-3xl font-bold">Recommender Control</h1>
          </div>
        </div>
        <button type="button" onClick={() => navigate("/settings")} className="rounded-md border border-black/10 px-4 py-2 text-sm font-bold hover:bg-black/5">
          Settings
        </button>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px_160px]">
        <label className="grid gap-1 text-sm font-bold">
          Admin API key
          <input value={adminApiKey} onChange={(e) => persistKey(e.target.value)} type="password" className="h-11 rounded-md border border-black/10 px-3 outline-none focus:border-black/35" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Window days
          <input value={days} onChange={(e) => setDays(e.target.value)} className="h-11 rounded-md border border-black/10 px-3 outline-none focus:border-black/35" />
        </label>
        <button type="button" onClick={() => void refreshAll()} disabled={busy === "refresh"} className="self-end rounded-md bg-black px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {busy === "refresh" ? "Loading" : "Refresh"}
        </button>
      </section>

      {message ? <div className="mt-4 rounded-md bg-[#ecfdf5] px-4 py-3 text-sm font-bold text-[#047857]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-md bg-[#fff1f0] px-4 py-3 text-sm font-bold text-[#9f2f26]">{error}</div> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Impressions" value={metrics?.impressions ?? 0} />
        <Stat label="Completion" value={pct(metrics?.rates?.completion)} />
        <Stat label="Save / Like" value={pct(metrics?.rates?.saveLike)} />
        <Stat label="Upload Exposure" value={pct(metrics?.rates?.uploadExposure)} />
        <Stat label="New Upload Exposure" value={pct(metrics?.rates?.newUploadExposure)} />
        <Stat label="Skip Rate" value={pct(metrics?.rates?.skip)} />
        <Stat label="Quality Score" value={metrics?.qualityScore ?? 0} />
        <Stat label="Eval Accuracy" value={pct(evaluation?.pairwiseAccuracy)} />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            <h2 className="text-xl font-bold">Evaluation</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Stat label="Artifact Tracks" value={evaluation?.artifactTrackCount ?? 0} />
            <Stat label="Impressions With Outcome" value={evaluation?.impressionsWithOutcome ?? 0} />
            <Stat label="Positive Precision" value={pct(evaluation?.positivePrecisionWhenScorePositive)} />
            <Stat label="Pair Count" value={evaluation?.pairCount ?? 0} />
          </div>
        </div>

        <div className="rounded-lg border border-black/10 bg-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-xl font-bold">Actions</h2>
          </div>
          <div className="mt-4 grid gap-2">
            <button type="button" disabled={!!busy} onClick={() => void runAction("reward", async () => {
              const res = await apiAdminBuildRewardArtifact({ adminApiKey });
              return `Reward artifact built with ${res.trackCount} tracks.`;
            })} className="rounded-md bg-black px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
              Build reward artifact
            </button>
            <button type="button" disabled={!!busy} onClick={() => void runAction("dataset", async () => {
              const res = await apiAdminBuildTrainingDataset({ adminApiKey, days: parsedDays });
              return `Training dataset built with ${res.rowCount} rows.`;
            })} className="rounded-md border border-black/10 px-4 py-3 text-sm font-bold hover:bg-black/5 disabled:opacity-50">
              Build training dataset
            </button>
            <button type="button" disabled={!!busy} onClick={() => void runAction("train", async () => {
              const res = await apiAdminTrainRanker({ adminApiKey, days: parsedDays });
              return `Ranker trained with ${res.ranker.trackCount} track scores.`;
            })} className="rounded-md border border-black/10 px-4 py-3 text-sm font-bold hover:bg-black/5 disabled:opacity-50">
              Train ranker
            </button>
            <button type="button" disabled={!!busy} onClick={() => navigate("/admin/security")} className="rounded-md border border-black/10 px-4 py-3 text-sm font-bold hover:bg-black/5">
              <span className="inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Security tools</span>
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <h2 className="text-xl font-bold">Reward Artifacts</h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Generated</th>
                <th className="px-2 py-2">Tracks</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">State</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.length ? artifacts.map((artifact) => (
                <tr key={artifact.name} className="border-b border-black/10">
                  <td className="px-2 py-2 font-bold">{artifact.name}</td>
                  <td className="px-2 py-2">{formatTs(artifact.generatedAt)}</td>
                  <td className="px-2 py-2">{artifact.trackCount ?? "-"}</td>
                  <td className="px-2 py-2">{artifact.sizeBytes}</td>
                  <td className="px-2 py-2">{artifact.current ? "Current" : artifact.previous ? "Previous" : "Version"}</td>
                  <td className="px-2 py-2">
                    {!artifact.current ? (
                      <button type="button" disabled={!!busy} onClick={() => void runAction(`rollback-${artifact.name}`, async () => {
                        const res = await apiAdminRollbackRewardArtifact({ adminApiKey, name: artifact.name });
                        return `Rolled back to ${res.restored}.`;
                      })} className="inline-flex items-center gap-1 rounded-md border border-black/10 px-3 py-2 text-xs font-bold hover:bg-black/5 disabled:opacity-50">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </button>
                    ) : "-"}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-black/50">No artifacts loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
