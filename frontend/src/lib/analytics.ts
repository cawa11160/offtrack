const DISTINCT_KEY = "offtrack_distinct_id";
const SHOWN_KEY = "offtrack_already_shown_ids";

/** Stable anonymous user id (stored in localStorage). */
export function getDistinctId(): string {
  try {
    let v = localStorage.getItem(DISTINCT_KEY);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(DISTINCT_KEY, v);
    }
    return v;
  } catch {
    return "anon-" + Math.random().toString(16).slice(2);
  }
}

/** Rolling "already shown" list to avoid repeats across sessions. */
export function getAlreadyShownIds(max = 300): string[] {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string" && x.trim()).slice(0, max);
  } catch {
    return [];
  }
}

export function addAlreadyShownIds(ids: string[], max = 300): void {
  try {
    const cur = getAlreadyShownIds(max);
    const set = new Set(cur);
    for (const id of ids) {
      if (typeof id === "string" && id.trim()) set.add(id.trim());
    }
    const out = Array.from(set);
    const trimmed = out.slice(Math.max(0, out.length - max));
    localStorage.setItem(SHOWN_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}
