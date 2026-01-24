import { useState } from "react";
import { Bell, Globe, Moon, Shield, Volume2 } from "lucide-react";

export default function Settings() {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [explicitFilter, setExplicitFilter] = useState(false);
  const [autoplay, setAutoplay] = useState(true);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        App preferences (presentation only).
      </p>

      <div className="mt-8 grid gap-4">
        <Section title="Appearance" icon={<Moon className="h-5 w-5 text-muted-foreground" />}>
          <ToggleRow
            label="Dark mode"
            description="Toggle theme (demo state only)."
            checked={darkMode}
            onChange={setDarkMode}
          />
        </Section>

        <Section title="Playback" icon={<Volume2 className="h-5 w-5 text-muted-foreground" />}>
          <ToggleRow
            label="Autoplay"
            description="Automatically play similar tracks."
            checked={autoplay}
            onChange={setAutoplay}
          />
        </Section>

        <Section title="Notifications" icon={<Bell className="h-5 w-5 text-muted-foreground" />}>
          <ToggleRow
            label="Push notifications"
            description="New releases, concert alerts, and artist updates."
            checked={notifications}
            onChange={setNotifications}
          />
        </Section>

        <Section title="Privacy" icon={<Shield className="h-5 w-5 text-muted-foreground" />}>
          <ToggleRow
            label="Explicit content filter"
            description="Hide explicit tracks in browse."
            checked={explicitFilter}
            onChange={setExplicitFilter}
          />
        </Section>

        <Section title="Language & Region" icon={<Globe className="h-5 w-5 text-muted-foreground" />}>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-xl border border-border bg-background px-3 py-2">
              Language: English
            </span>
            <span className="rounded-xl border border-border bg-background px-3 py-2">
              Region: AU
            </span>
            <button
              type="button"
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
              onClick={() => console.log("Change language/region")}
            >
              Change
            </button>
          </div>
        </Section>
      </div>

      <div className="mt-8 text-xs text-muted-foreground">
        Demo only — these settings are not saved.
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-base font-semibold">{title}</div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-background p-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          "relative h-7 w-12 rounded-full border border-border transition-colors",
          checked ? "bg-black" : "bg-white",
        ].join(" ")}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={[
            // PERFECTLY CENTERED KNOB
            "absolute inset-y-0 my-auto left-0.5 h-6 w-6 rounded-full shadow-sm transition-transform",
            checked ? "translate-x-5 bg-white" : "translate-x-0 bg-black",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
