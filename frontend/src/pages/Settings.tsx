import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BrainCircuit,
  CreditCard,
  Headphones,
  LayoutGrid,
  Lock,
  Moon,
  Music2,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  UserRound,
  Volume2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth";
import { applyAppearance, loadPrefs, savePrefs as persistPrefs, type AppPreferences } from "@/lib/preferences";

type SectionId = "account" | "general" | "audio" | "notifications" | "billing" | "security";
type PreferenceState = AppPreferences;

const ADMIN_KEY_STORAGE = "offtrack_admin_api_key";
const ADMIN_UI_ENABLED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_ENABLE_ADMIN_SECURITY ?? "false").toLowerCase()
);

function hasAdminKeyStored(): boolean {
  if (typeof window === "undefined") return false;
  const legacy = window.localStorage.getItem(ADMIN_KEY_STORAGE);
  if (legacy) {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, legacy);
  }
  return Boolean((window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || "").trim());
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-md border border-black/10 bg-white px-4 py-3 text-left transition hover:bg-black/5"
    >
      <span className="text-sm font-semibold text-black">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-black" : "bg-black/20"}`}>
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}
        />
      </span>
    </button>
  );
}

function RangeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="block rounded-md border border-black/10 bg-white px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-sm font-semibold text-black">
        <span>{label}</span>
        <span>{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-black"
      />
    </label>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [active, setActive] = useState<SectionId>("general");
  const [prefs, setPrefs] = useState<PreferenceState>(() => loadPrefs());
  const [saved, setSaved] = useState(false);
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
    applyAppearance(prefs.appearance);
    if (prefs.appearance !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => applyAppearance("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs.appearance]);

  const sections = useMemo(
    () =>
      [
        { id: "general" as const, label: "General", icon: SlidersHorizontal },
        { id: "account" as const, label: "Account", icon: UserRound },
        { id: "audio" as const, label: "Audio", icon: Headphones },
        { id: "notifications" as const, label: "Notifications", icon: Bell },
        { id: "billing" as const, label: "Billing", icon: CreditCard },
        { id: "security" as const, label: "Security", icon: Lock },
      ],
    []
  );

  function updatePrefs(next: Partial<PreferenceState>) {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      if (next.appearance) {
        applyAppearance(next.appearance);
        persistPrefs(merged);
      }
      return merged;
    });
    setSaved(false);
  }

  function savePrefs() {
    persistPrefs(prefs);
    applyAppearance(prefs.appearance);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="min-h-screen w-full bg-white pb-32 text-black">
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
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
          <button
            type="button"
            onClick={savePrefs}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            <Save className="h-4 w-4" />
            {saved ? "Saved" : "Save"}
          </button>
        </div>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-black/45">Settings</p>
            <h1 className="mt-1 text-4xl font-bold leading-none sm:text-5xl">Preferences</h1>
          </div>
          {showAdminButton ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate("/admin/recommender")}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-black/5"
              >
                <BrainCircuit className="h-4 w-4" />
                Recommender
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin/security")}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-black/5"
              >
                <ShieldAlert className="h-4 w-4" />
                Admin security
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-black/10 bg-[#f8f7f2] p-2">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActive(section.id)}
                  className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                    active === section.id ? "bg-black text-white" : "text-black/65 hover:bg-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </button>
              );
            })}
          </aside>

          <main className="rounded-lg border border-black/10 bg-[#f8f7f2] p-4 sm:p-5">
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
                          onClick={() => updatePrefs({ appearance: item.id as PreferenceState["appearance"] })}
                          className={`flex h-24 flex-col items-start justify-between rounded-md border p-3 text-left transition ${
                            prefs.appearance === item.id ? "border-black bg-black text-white" : "border-black/10 bg-white hover:bg-black/5"
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
                  <h2 className="text-xl font-bold">Display</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {(["compact", "normal", "comfortable"] as const).map((density) => (
                      <button
                        key={density}
                        type="button"
                        onClick={() => updatePrefs({ density })}
                        className={`h-12 rounded-md border px-3 text-sm font-semibold capitalize transition ${
                          prefs.density === density ? "border-black bg-black text-white" : "border-black/10 bg-white hover:bg-black/5"
                        }`}
                      >
                        {density}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Toggle checked={prefs.autoplay} onChange={(autoplay) => updatePrefs({ autoplay })} label="Autoplay previews" />
                  </div>
                </section>
              </div>
            ) : null}

            {active === "account" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Account</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Name</p>
                    <p className="mt-2 text-lg font-bold">{user?.name || "Listener"}</p>
                  </div>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Email</p>
                    <p className="mt-2 truncate text-lg font-bold">{user?.email || "Not signed in"}</p>
                  </div>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Account type</p>
                    <p className="mt-2 text-lg font-bold capitalize">{user?.account_type || "listener"}</p>
                  </div>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Email status</p>
                    <p className="mt-2 text-lg font-bold">{user?.email_verified ? "Verified" : "Unverified"}</p>
                  </div>
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={() => void logout().then(() => navigate("/login"))}
                    className="mt-4 h-10 rounded-md border border-black/10 px-4 text-sm font-semibold transition hover:bg-black/5"
                  >
                    Log out
                  </button>
                ) : null}
              </section>
            ) : null}

            {active === "audio" ? (
              <section className="rounded-lg bg-white p-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  <h2 className="text-xl font-bold">Audio</h2>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <RangeControl label="Volume" value={prefs.volume} onChange={(volume) => updatePrefs({ volume })} />
                  <RangeControl label="Bass" value={prefs.bass} onChange={(bass) => updatePrefs({ bass })} />
                  <RangeControl label="Treble" value={prefs.treble} onChange={(treble) => updatePrefs({ treble })} />
                  <RangeControl label="Balance" value={prefs.balance} onChange={(balance) => updatePrefs({ balance })} />
                </div>
              </section>
            ) : null}

            {active === "notifications" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Notifications</h2>
                <div className="mt-4 grid gap-3">
                  <Toggle checked={prefs.releaseAlerts} onChange={(releaseAlerts) => updatePrefs({ releaseAlerts })} label="New music releases" />
                  <Toggle checked={prefs.friendActivity} onChange={(friendActivity) => updatePrefs({ friendActivity })} label="Friend activity" />
                  <Toggle checked={prefs.concertAlerts} onChange={(concertAlerts) => updatePrefs({ concertAlerts })} label="Concert alerts" />
                </div>
              </section>
            ) : null}

            {active === "billing" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Billing</h2>
                <div className="mt-4 rounded-md bg-[#f8f7f2] p-4">
                  <p className="text-sm font-semibold text-black/55">Payment methods and receipts are managed in Account.</p>
                  <button
                    type="button"
                    onClick={() => navigate("/account")}
                    className="mt-4 h-10 rounded-md bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
                  >
                    Open account
                  </button>
                </div>
              </section>
            ) : null}

            {active === "security" ? (
              <section className="rounded-lg bg-white p-4">
                <h2 className="text-xl font-bold">Security</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-sm font-semibold text-black/55">Session</p>
                    <p className="mt-2 text-lg font-bold">{user ? "Active" : "Signed out"}</p>
                  </div>
                  <div className="rounded-md bg-[#f8f7f2] p-4">
                    <p className="text-sm font-semibold text-black/55">Admin tools</p>
                    <p className="mt-2 text-lg font-bold">{showAdminButton ? "Enabled" : "Hidden"}</p>
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
