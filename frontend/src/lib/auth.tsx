import { useEffect, useMemo, useState, createContext, useContext } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const TOKEN_KEY = "offtrack_access_token";

function makeUrl(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export type Me = { id: number; email: string; name?: string | null };

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function readErr(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await res.json().catch(() => null);
    const msg = j?.detail ?? j?.message ?? j?.error;
    if (msg) return String(msg);
  }
  return (await res.text().catch(() => "")) || `${res.status} ${res.statusText}`;
}

export async function apiSignup(params: { name?: string; email: string; password: string }) {
  const res = await fetch(makeUrl("/api/auth/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { access_token: string };
}

export async function apiLogin(params: { email: string; password: string }) {
  const res = await fetch(makeUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { access_token: string };
}

export async function apiRefresh() {
  const res = await fetch(makeUrl("/api/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { access_token: string };
}

export async function apiLogout() {
  await fetch(makeUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
}

export async function apiMe(token: string): Promise<Me> {
  const res = await fetch(makeUrl("/api/auth/me"), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as Me;
}

type AuthState = {
  user: Me | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    const t = token ?? getAccessToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const me = await apiMe(t);
      setUser(me);
    } catch {
      // try refresh cookie -> new access token
      try {
        const r = await apiRefresh();
        setAccessToken(r.access_token);
        setToken(r.access_token);
        const me = await apiMe(r.access_token);
        setUser(me);
      } catch {
        clearAccessToken();
        setToken(null);
        setUser(null);
      }
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshMe();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const r = await apiLogin({ email, password });
    setAccessToken(r.access_token);
    setToken(r.access_token);
    await refreshMe();
  }

  async function signup(name: string, email: string, password: string) {
    const r = await apiSignup({ name, email, password });
    setAccessToken(r.access_token);
    setToken(r.access_token);
    await refreshMe();
  }

  async function logout() {
    await apiLogout().catch(() => {});
    clearAccessToken();
    setToken(null);
    setUser(null);
  }

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, login, signup, logout, refreshMe }),
    [user, token, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
