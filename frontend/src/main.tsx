import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth";
import { initPostHog } from "./lib/posthog";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";

initPostHog();

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
