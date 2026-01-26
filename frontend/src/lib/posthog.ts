import posthog from "posthog-js";
import { getDistinctId } from "./analytics";

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://app.posthog.com";
  if (!key) return;

  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: true,
    persistence: "localStorage",
  });

  posthog.identify(getDistinctId());
}

export function phCapture(event: string, properties: Record<string, any> = {}) {
  try {
    posthog.capture(event, { ...properties, distinct_id: getDistinctId() });
  } catch {
    // ignore
  }
}
