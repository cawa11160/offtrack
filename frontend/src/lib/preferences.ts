export type AppearanceMode = "light" | "dark" | "system";

export type AppPreferences = {
  appearance: AppearanceMode;
  density: "compact" | "normal" | "comfortable";
  autoplay: boolean;
  releaseAlerts: boolean;
  friendActivity: boolean;
  concertAlerts: boolean;
  volume: number;
  bass: number;
  treble: number;
  balance: number;
};

export const PREF_KEY = "offtrack_settings_preferences";

export const defaultPrefs: AppPreferences = {
  appearance: "light",
  density: "normal",
  autoplay: true,
  releaseAlerts: true,
  friendActivity: false,
  concertAlerts: true,
  volume: 74,
  bass: 52,
  treble: 48,
  balance: 50,
};

export function loadPrefs(): AppPreferences {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREF_KEY) || "{}") as Partial<AppPreferences>;
    return { ...defaultPrefs, ...parsed };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(prefs: AppPreferences) {
  window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

export function resolveAppearance(appearance: AppearanceMode) {
  if (appearance === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return appearance;
}

export function applyAppearance(appearance: AppearanceMode) {
  if (typeof window === "undefined") return;
  const resolved = resolveAppearance(appearance);
  const root = window.document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.offtrackTheme = resolved;
  root.style.colorScheme = resolved;
}
