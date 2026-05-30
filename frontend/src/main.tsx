import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth";
import { initPostHog } from "./lib/posthog";
import { applyAppearance, loadPrefs } from "./lib/preferences";
import "./index.css";

initPostHog();
applyAppearance(loadPrefs().appearance);

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
