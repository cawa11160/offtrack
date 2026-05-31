import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BrainCircuit,
  CreditCard,
  Download,
  Headphones,
  LayoutGrid,
  Link as LinkIcon,
  Lock,
  Mail,
  Moon,
  Music2,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  apiChangePassword,
  apiDeleteListeningHistory,
  apiExportUserData,
  apiGetUserSettings,
  apiListPaymentMethods,
  apiListReceipts,
  apiLogoutAllSessions,
  apiUpdateUserSettings,
  type BillingPaymentMethod,
  type BillingReceipt,
  type UserSettingsPayload,
} from "@/lib/api";
import { apiResendEmailVerification, useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { applyAppearance, loadPrefs, savePrefs as persistPrefs, type AppPreferences } from "@/lib/preferences";

type SectionId = "account" | "general" | "artist" | "notifications" | "privacy" | "billing" | "security";
type SettingsSection = Exclude<keyof UserSettingsPayload, "account">;

const ADMIN_KEY_STORAGE = "offtrack_admin_api_key";
const ADMIN_UI_ENABLED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_ENABLE_ADMIN_SECURITY ?? "false").toLowerCase()
);

const defaultSettings: UserSettingsPayload = {
  general: { appearance: "light", density: "normal", autoplay: true },
  audio: { volume: 74, bass: 52, treble: 48, balance: 50 },
  notifications: {
    releaseAlerts: true,
    friendActivity: false,
    concertAlerts: true,
    listenerActivity: true,
    discoveryScoreChanges: true,
    weeklyArtistReport: true,
    securityAlerts: true,
  },
  privacy: {
    personalizedRecommendations: true,
    analyticsConsent: true,
    publicListening: false,
    shareAggregateArtistFit: true,
  },
  artist: {
    publicProfile: true,
    discoveryEnabled: true,
    explicitContentDefault: false,
    ownershipConfirmed: false,
    playMilestoneThreshold: 100,
    saveMilestoneThreshold: 25,
    skipAlertThreshold: 35,
  },
  conversionLinks: {
    spotify: "",
    website: "",
    merch: "",
    tickets: "",
    emailSignup: "",
    support: "",
  },
};

function hasAdminKeyStored(): boolean {
  if (typeof window === "undefined") return false;
  const legacy = window.localStorage.getItem(ADMIN_KEY_STORAGE);
  if (legacy) {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, legacy);
  }
  return Boolean((window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || "").trim());
}

function mergeSettings(next: Partial<UserSettingsPayload>): UserSettingsPayload {
  return {
    general: { ...defaultSettings.general, ...(next.general || {}) },
    audio: { ...defaultSettings.audio, ...(next.audio || {}) },
    notifications: { ...defaultSettings.notifications, ...(next.notifications || {}) },
    privacy: { ...defaultSettings.privacy, ...(next.privacy || {}) },
    artist: { ...defaultSettings.artist, ...(next.artist || {}) },
    conversionLinks: { ...defaultSettings.conversionLinks, ...(next.conversionLinks || {}) },
    account: next.account,
  };
}

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (next: boolean) => void; label: string; detail?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-md border border-black/10 bg-white px-4 py-3 text-left transition hover:bg-black/5"
    >
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold text-black">{label}</span>
        {detail ? <span className="mt-1 block break-words text-xs font-semibold text-black/50">{detail}</span> : null}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-black" : "bg-black/20"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

function RangeControl({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <label className="block rounded-md border border-black/10 bg-white px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-sm font-semibold text-black">
        <span>{label}</span>
        <span>{value}</span>
      </span>
      <input type="range" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full accent-black" />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">{label}</span>
      <input
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full min-w-0 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none focus:border-black/35"
      />
    </label>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, token, logout, updateMe } = useAuth();
  const [active, setActive] = useState<SectionId>("general");
  const [settings, setSettings] = useState<UserSettingsPayload>(() => mergeSettings({}));
  const [prefs, setPrefs] = useState<AppPreferences>(() => loadPrefs());
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [methods, setMethods] = useState<BillingPaymentMethod[]>([]);
  const [receipts, setReceipts] = useState<BillingReceipt[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftAccountType, setDraftAccountType] = useState<"listener" | "artist">("listener");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showAdminButton, setShowAdminButton] = useState<boolean>(() => ADMIN_UI_ENABLED || hasAdminKeyStored());

  useEffect(() => {
    const refresh = () => setShowAdminButton(ADMIN_UI_ENABLED || hasAdminKeyStored());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("admin-key-change", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("admin-key-change", refresh as EventListener);
    };
  }, []);

  useEffect(() => {
    applyAppearance(settings.general.appearance);
    if (settings.general.appearance !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => applyAppearance("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings.general.appearance]);

  useEffect(() => {
    setDraftName(user?.name || "");
    setDraftEmail(user?.email || "");
    setDraftAccountType(user?.account_type === "artist" ? "artist" : "listener");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingSettings(true);
    setError("");
    Promise.all([apiGetUserSettings(), apiListPaymentMethods(), apiListReceipts(20)])
      .then(([remote, paymentMethods, billingReceipts]) => {
        const merged = mergeSettings(remote);
        setSettings(merged);
        setMethods(paymentMethods);
        setReceipts(billingReceipts);
        const nextPrefs: AppPreferences = {
          ...prefs,
          appearance: merged.general.appearance,
          density: merged.general.density,
          autoplay: merged.general.autoplay,
          releaseAlerts: merged.notifications.releaseAlerts,
          friendActivity: merged.notifications.friendActivity,
          concertAlerts: merged.notifications.concertAlerts,
          volume: merged.audio.volume,
          bass: merged.audio.bass,
          treble: merged.audio.treble,
          balance: merged.audio.balance,
        };
        setPrefs(nextPrefs);
        persistPrefs(nextPrefs);
        applyAppearance(merged.general.appearance);
      })
      .catch((err: unknown) => setError(getErrorMessage(err, "Could not load settings.")))
      .finally(() => setLoadingSettings(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const sections = useMemo(
    () =>
      [
        { id: "general" as const, label: "General", icon: SlidersHorizontal },
        { id: "account" as const, label: "Account", icon: UserRound },
        { id: "artist" as const, label: "Artist", icon: Sparkles },
        { id: "notifications" as const, label: "Alerts", icon: Bell },
        { id: "privacy" as const, label: "Privacy", icon: ShieldAlert },
        { id: "billing" as const, label: "Billing", icon: CreditCard },
        { id: "security" as const, label: "Security", icon: Lock },
      ],
    []
  );

  function updateSection<K extends SettingsSection>(section: K, next: Partial<UserSettingsPayload[K]>) {
    setSettings((prev) => ({ ...prev, [section]: { ...prev[section], ...next } }));
    setSaved(false);
    setStatus("");
    setError("");
  }

  function localPrefsFromSettings(next = settings): AppPreferences {
    return {
      ...prefs,
      appearance: next.general.appearance,
      density: next.general.density,
      autoplay: next.general.autoplay,
      releaseAlerts: next.notifications.releaseAlerts,
      friendActivity: next.notifications.friendActivity,
      concertAlerts: next.notifications.concertAlerts,
      volume: next.audio.volume,
      bass: next.audio.bass,
      treble: next.audio.treble,
      balance: next.audio.balance,
    };
  }

  async function saveSettings() {
    setError("");
    setStatus("");
    try {
      const remote = await apiUpdateUserSettings({
        general: settings.general,
        audio: settings.audio,
        notifications: settings.notifications,
        privacy: settings.privacy,
        artist: settings.artist,
        conversionLinks: settings.conversionLinks,
      });
      const merged = mergeSettings(remote);
      setSettings(merged);
      const nextPrefs = localPrefsFromSettings(merged);
      setPrefs(nextPrefs);
      persistPrefs(nextPrefs);
      applyAppearance(merged.general.appearance);
      setSaved(true);
      setStatus("Settings saved.");
      window.setTimeout(() => setSaved(false), 1800);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save settings."));
    }
  }

  async function saveAccount() {
    setError("");
    setStatus("");
    try {
      const updated = await updateMe({ name: draftName, email: draftEmail, account_type: draftAccountType });
      setVerificationUrl(updated.email_verification_url || "");
      setStatus(updated.email_verified ? "Account updated." : "Account updated. Email verification may be required.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not update account."));
    }
  }

  async function resendVerification() {
    if (!token) return;
    setError("");
    setStatus("");
    try {
      const result = await apiResendEmailVerification(token);
      setVerificationUrl(result.email_verification_url || "");
      setStatus(result.email_verification_url ? "Verification link created." : "Email is already verified.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not create verification link."));
    }
  }

  async function changePassword() {
    setError("");
    setStatus("");
    try {
      await apiChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setStatus("Password changed.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not change password."));
    }
  }

  async function logoutEverywhere() {
    setError("");
    setStatus("");
    try {
      await apiLogoutAllSessions();
      await logout();
      navigate("/login");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not log out all sessions."));
    }
  }

  async function exportData() {
    setError("");
    setStatus("");
    try {
      downloadBlob(await apiExportUserData(), "offtrack-data-export.json");
      setStatus("Data export downloaded.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not export data."));
    }
  }

  async function deleteHistory() {
    if (!window.confirm("Delete your account-linked listening history? This cannot be undone.")) return;
    setError("");
    setStatus("");
    try {
      const result = await apiDeleteListeningHistory();
      setStatus(`Deleted ${result.deleted} listening signal(s).`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not delete listening history."));
    }
  }

  async function refreshBilling() {
    if (!user) return;
    setBillingLoading(true);
    setError("");
    try {
      const [paymentMethods, billingReceipts] = await Promise.all([apiListPaymentMethods(), apiListReceipts(20)]);
      setMethods(paymentMethods);
      setReceipts(billingReceipts);
      setStatus("Billing refreshed.");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not refresh billing."));
    } finally {
      setBillingLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 place-items-center rounded-md text-black transition-colors hover:bg-black/5" aria-label="Go back">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div className="grid h-11 w-11 place-items-center rounded-md border border-black/10 bg-white">
              <Music2 className="h-6 w-6 text-black" />
            </div>
          </div>
          <button type="button" onClick={() => void saveSettings()} className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80">
            <Save className="h-4 w-4" />
            {saved ? "Saved" : "Save settings"}
          </button>
        </div>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Settings</p>
            <h1 className="mt-1 text-4xl font-bold leading-none sm:text-5xl">Control Center</h1>
          </div>
          {showAdminButton ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate("/admin/recommender")} className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-black/5">
                <BrainCircuit className="h-4 w-4" />
                Recommender
              </button>
              <button type="button" onClick={() => navigate("/admin/security")} className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-black/5">
                <ShieldAlert className="h-4 w-4" />
                Admin security
              </button>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {status ? <div className="mt-4 rounded-md border border-black/10 bg-[#f8f7f2] px-4 py-3 text-sm font-semibold text-black/65">{status}</div> : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-black/10 bg-[#f8f7f2] p-2">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActive(section.id)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                    active === section.id ? "bg-black text-white" : "text-black/65 hover:bg-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="break-words">{section.label}</span>
                </button>
              );
            })}
          </aside>

          <main className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4 sm:p-5">
            {loadingSettings ? <div className="mb-4 rounded-md bg-white p-3 text-sm font-semibold text-black/55">Loading settings...</div> : null}

            {active === "general" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg bg-white p-4">
                  <h2 className="text-xl font-bold">Appearance</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      { id: "light", label: "Light", icon: Sun },
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "system", label: "System", icon: LayoutGrid },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateSection("general", { appearance: item.id as UserSettingsPayload["general"]["appearance"] })}
                          className={`flex h-24 flex-col items-start justify-between rounded-md border p-3 text-left transition ${
                            settings.general.appearance === item.id ? "border-black bg-black text-white" : "border-black/10 bg-white hover:bg-black/5"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-sm font-bold">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4">
                  <h2 className="text-xl font-bold">Display and Audio</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {(["compact", "normal", "comfortable"] as const).map((density) => (
                      <button
                        key={density}
                        type="button"
                        onClick={() => updateSection("general", { density })}
                        className={`min-h-12 rounded-md border px-3 py-2 text-sm font-semibold capitalize transition ${
                          settings.general.density === density ? "border-black bg-black text-white" : "border-black/10 bg-white hover:bg-black/5"
                        }`}
                      >
                        {density}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3">
                    <Toggle checked={settings.general.autoplay} onChange={(autoplay) => updateSection("general", { autoplay })} label="Autoplay previews" />
                    <RangeControl label="Volume" value={settings.audio.volume} onChange={(volume) => updateSection("audio", { volume })} />
                    <RangeControl label="Bass" value={settings.audio.bass} onChange={(bass) => updateSection("audio", { bass })} />
                    <RangeControl label="Treble" value={settings.audio.treble} onChange={(treble) => updateSection("audio", { treble })} />
                    <RangeControl label="Balance" value={settings.audio.balance} onChange={(balance) => updateSection("audio", { balance })} />
                  </div>
                </section>
              </div>
            ) : null}

            {active === "account" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Account</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <TextField label="Name" value={draftName} onChange={setDraftName} />
                  <TextField label="Email" value={draftEmail} onChange={setDraftEmail} type="email" />
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Account Type</span>
                    <select
                      value={draftAccountType}
                      onChange={(event) => setDraftAccountType(event.target.value === "artist" ? "artist" : "listener")}
                      className="mt-2 h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-semibold outline-none focus:border-black/35"
                    >
                      <option value="listener">Listener</option>
                      <option value="artist">Artist</option>
                    </select>
                  </label>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Email Status</p>
                    <p className="mt-2 text-lg font-bold">{user?.email_verified ? "Verified" : "Unverified"}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void saveAccount()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/80">
                    <Save className="h-4 w-4" />
                    Save account
                  </button>
                  {!user?.email_verified ? (
                    <button type="button" onClick={() => void resendVerification()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/5">
                      <Mail className="h-4 w-4" />
                      Resend verification
                    </button>
                  ) : null}
                </div>
                {verificationUrl ? (
                  <div className="mt-4 rounded-md bg-[#f8f7f2] p-3 text-sm font-semibold text-black/60">
                    Verification link: <span className="break-all text-black">{verificationUrl}</span>
                  </div>
                ) : null}
              </section>
            ) : null}

            {active === "artist" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-lg bg-white p-4">
                  <h2 className="text-xl font-bold">Musician Discovery</h2>
                  <div className="mt-4 grid gap-3">
                    <Toggle checked={settings.artist.publicProfile} onChange={(publicProfile) => updateSection("artist", { publicProfile })} label="Public artist profile" detail="Allow listeners to open your artist profile from recommendations and uploads." />
                    <Toggle checked={settings.artist.discoveryEnabled} onChange={(discoveryEnabled) => updateSection("artist", { discoveryEnabled })} label="Participate in discovery tests" detail="Let eligible uploads enter fair exposure and Discovery Graph candidate pools." />
                    <Toggle checked={settings.artist.ownershipConfirmed} onChange={(ownershipConfirmed) => updateSection("artist", { ownershipConfirmed })} label="I own or control uploaded audio rights" detail="Required before serious beta distribution." />
                    <Toggle checked={settings.artist.explicitContentDefault} onChange={(explicitContentDefault) => updateSection("artist", { explicitContentDefault })} label="Default new uploads to explicit" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <TextField label="Play Alert" value={String(settings.artist.playMilestoneThreshold)} onChange={(v) => updateSection("artist", { playMilestoneThreshold: Number(v) || 1 })} />
                    <TextField label="Save Alert" value={String(settings.artist.saveMilestoneThreshold)} onChange={(v) => updateSection("artist", { saveMilestoneThreshold: Number(v) || 1 })} />
                    <TextField label="Skip Alert %" value={String(settings.artist.skipAlertThreshold)} onChange={(v) => updateSection("artist", { skipAlertThreshold: Number(v) || 0 })} />
                  </div>
                </section>

                <section className="rounded-lg bg-white p-4">
                  <h2 className="text-xl font-bold">Conversion Links</h2>
                  <div className="mt-4 grid gap-3">
                    {(Object.keys(settings.conversionLinks) as Array<keyof UserSettingsPayload["conversionLinks"]>).map((key) => (
                      <TextField
                        key={key}
                        label={key.replace(/([A-Z])/g, " $1")}
                        value={settings.conversionLinks[key] || ""}
                        onChange={(value) => updateSection("conversionLinks", { [key]: value })}
                        placeholder="https://"
                      />
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {active === "notifications" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Notifications</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Toggle checked={settings.notifications.listenerActivity} onChange={(listenerActivity) => updateSection("notifications", { listenerActivity })} label="Listener activity" detail="Plays, saves, likes, and artist clicks on uploaded tracks." />
                  <Toggle checked={settings.notifications.discoveryScoreChanges} onChange={(discoveryScoreChanges) => updateSection("notifications", { discoveryScoreChanges })} label="Discovery Score changes" />
                  <Toggle checked={settings.notifications.weeklyArtistReport} onChange={(weeklyArtistReport) => updateSection("notifications", { weeklyArtistReport })} label="Weekly artist report" />
                  <Toggle checked={settings.notifications.securityAlerts} onChange={(securityAlerts) => updateSection("notifications", { securityAlerts })} label="Security alerts" />
                  <Toggle checked={settings.notifications.releaseAlerts} onChange={(releaseAlerts) => updateSection("notifications", { releaseAlerts })} label="New music releases" />
                  <Toggle checked={settings.notifications.concertAlerts} onChange={(concertAlerts) => updateSection("notifications", { concertAlerts })} label="Concert alerts" />
                  <Toggle checked={settings.notifications.friendActivity} onChange={(friendActivity) => updateSection("notifications", { friendActivity })} label="Friend activity" />
                </div>
              </section>
            ) : null}

            {active === "privacy" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Privacy</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Toggle checked={settings.privacy.personalizedRecommendations} onChange={(personalizedRecommendations) => updateSection("privacy", { personalizedRecommendations })} label="Personalized recommendations" detail="Use listening signals to tune recommendations." />
                  <Toggle checked={settings.privacy.analyticsConsent} onChange={(analyticsConsent) => updateSection("privacy", { analyticsConsent })} label="Product analytics" detail="Help improve Offtrack with privacy-aware usage data." />
                  <Toggle checked={settings.privacy.publicListening} onChange={(publicListening) => updateSection("privacy", { publicListening })} label="Public listening activity" />
                  <Toggle checked={settings.privacy.shareAggregateArtistFit} onChange={(shareAggregateArtistFit) => updateSection("privacy", { shareAggregateArtistFit })} label="Aggregate artist fit" detail="Allow artists to see anonymous cohort-level discovery fit." />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void exportData()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/5">
                    <Download className="h-4 w-4" />
                    Export data
                  </button>
                  <button type="button" onClick={() => void deleteHistory()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                    Delete listening history
                  </button>
                </div>
              </section>
            ) : null}

            {active === "billing" ? (
              <section className="rounded-lg bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Billing</h2>
                  <button type="button" onClick={() => void refreshBilling()} className="rounded-md border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-black/5" disabled={billingLoading}>
                    {billingLoading ? "Refreshing" : "Refresh"}
                  </button>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-sm font-semibold text-black/55">Plan</p>
                    <p className="mt-2 text-2xl font-bold">Free Beta</p>
                    <p className="mt-2 text-sm font-semibold text-black/50">Billing is ready for saved methods and receipts. Paid musician plans can plug into this surface later.</p>
                  </div>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-sm font-semibold text-black/55">Payment Methods</p>
                    <p className="mt-2 text-2xl font-bold">{methods.length}</p>
                    <button type="button" onClick={() => navigate("/account")} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/80">
                      <CreditCard className="h-4 w-4" />
                      Manage cards
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  {methods.map((method) => (
                    <div key={method.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2">
                      <span className="text-sm font-semibold uppercase">{method.brand} ending {method.last4}</span>
                      <span className="text-xs font-semibold text-black/45">{String(method.expMonth).padStart(2, "0")}/{method.expYear}{method.isDefault ? " default" : ""}</span>
                    </div>
                  ))}
                  {!methods.length ? <p className="text-sm font-semibold text-black/50">No payment method connected.</p> : null}
                </div>
                <div className="mt-5">
                  <h3 className="text-lg font-bold">Receipts</h3>
                  <div className="mt-3 grid gap-2">
                    {receipts.slice(0, 5).map((receipt) => (
                      <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2">
                        <span className="min-w-0 break-words text-sm font-semibold">{receipt.description}</span>
                        <span className="text-xs font-semibold text-black/45">{receipt.status.toUpperCase()} {(receipt.amountCents / 100).toFixed(2)} {receipt.currency}</span>
                      </div>
                    ))}
                    {!receipts.length ? <p className="text-sm font-semibold text-black/50">No receipts yet.</p> : null}
                  </div>
                </div>
              </section>
            ) : null}

            {active === "security" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Security</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <h3 className="text-lg font-bold">Change Password</h3>
                    <div className="mt-4 grid gap-3">
                      <TextField label="Current Password" value={currentPassword} onChange={setCurrentPassword} type="password" />
                      <TextField label="New Password" value={newPassword} onChange={setNewPassword} type="password" />
                      <button type="button" onClick={() => void changePassword()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/80">
                        <Lock className="h-4 w-4" />
                        Change password
                      </button>
                    </div>
                  </div>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <h3 className="text-lg font-bold">Session and Admin</h3>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-md bg-white p-3">
                        <p className="text-sm font-semibold text-black/55">Session</p>
                        <p className="mt-2 text-lg font-bold">{user ? "Active" : "Signed out"}</p>
                      </div>
                      <div className="rounded-md bg-white p-3">
                        <p className="text-sm font-semibold text-black/55">Admin tools</p>
                        <p className="mt-2 text-lg font-bold">{showAdminButton ? "Enabled" : "Hidden"}</p>
                      </div>
                      <button type="button" onClick={() => void logoutEverywhere()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                        <ShieldAlert className="h-4 w-4" />
                        Log out all devices
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-md bg-[#f8f7f2] p-4">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    <p className="text-sm font-semibold text-black/60">Two-factor auth and active session listing are next production security upgrades.</p>
                  </div>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </section>
    </div>
  );
}
