import { getDistinctId } from "./analytics";

type PostHogClient = typeof import("posthog-js").default;

let clientPromise: Promise<PostHogClient | null> | null = null;
let initialized = false;

function posthogConfig() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://app.posthog.com";
  return { key, host };
}

function loadClient(): Promise<PostHogClient | null> {
  const { key } = posthogConfig();
  if (!key) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("posthog-js")
      .then((mod) => mod.default)
      .catch(() => null);
  }
  return clientPromise;
}

function initClient(client: PostHogClient) {
  if (initialized) return;
  const { key, host } = posthogConfig();
  if (!key) return;
  client.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: true,
    persistence: "localStorage",
  });
  client.identify(getDistinctId());
  initialized = true;
}

export function initPostHog() {
  const run = () => {
    void loadClient().then((client) => {
      if (client) initClient(client);
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 1500);
  }
}

export function phCapture(event: string, properties: Record<string, unknown> = {}) {
  void loadClient().then((client) => {
    if (!client) return;
    initClient(client);
    client.capture(event, { ...properties, distinct_id: getDistinctId() });
  });
}
