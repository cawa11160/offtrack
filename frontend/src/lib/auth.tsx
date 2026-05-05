import { useCallback, useEffect, useMemo, useState, createContext, useContext } from "react";
import { normalizeAuthEmail, sanitizeDisplayName } from "./authInput";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const TOKEN_KEY = "offtrack_access_token";
let accessToken: string | null = null;

try {
  window.localStorage.removeItem(TOKEN_KEY);
} catch {
  // Ignore storage access failures; auth still works through the refresh cookie.
}

function makeUrl(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export type Me = {
  id: number;
  email: string;
  name?: string | null;
  account_type?: "listener" | "artist";
  email_verified?: boolean;
  email_verification_url?: string | null;
};

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage access failures.
  }
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

export async function apiSignup(params: { name?: string; email: string; password: string; account_type?: "listener" | "artist" }) {
  const res = await fetch(makeUrl("/api/auth/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      ...params,
      name: sanitizeDisplayName(params.name ?? ""),
      email: normalizeAuthEmail(params.email),
    }),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { access_token: string; email_verification_url?: string | null; email_verified?: boolean };
}

export async function apiLogin(params: { email: string; password: string }) {
  const res = await fetch(makeUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...params, email: normalizeAuthEmail(params.email) }),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { access_token: string; email_verified?: boolean };
}

export async function apiRefresh() {
  const res = await fetch(makeUrl("/api/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { access_token: string; email_verified?: boolean };
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

export async function apiUpdateMe(
  token: string,
  params: { name?: string | null; email?: string; account_type?: "listener" | "artist" }
): Promise<Me> {
  const body: Record<string, string | null> = {};
  if ("name" in params) body.name = params.name == null ? null : sanitizeDisplayName(params.name);
  if (params.email !== undefined) body.email = normalizeAuthEmail(params.email);
  if (params.account_type !== undefined) body.account_type = params.account_type;

  const res = await fetch(makeUrl("/api/auth/me"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as Me;
}

export async function apiResendEmailVerification(token: string): Promise<{ email_verification_url?: string | null }> {
  const res = await fetch(makeUrl("/api/auth/resend-verification"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readErr(res));
  return (await res.json()) as { email_verification_url?: string | null };
}

type AuthState = {
  user: Me | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, accountType?: "listener" | "artist") => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: (nextToken?: string) => Promise<void>;
  updateMe: (params: { name?: string | null; email?: string; account_type?: "listener" | "artist" }) => Promise<Me>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async (nextToken?: string) => {
    const t = nextToken ?? token ?? getAccessToken();
    if (!t) {
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
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refreshMe();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiLogin({ email, password });
    setAccessToken(r.access_token);
    setToken(r.access_token);
    await refreshMe(r.access_token);
  }, [refreshMe]);

  const signup = useCallback(async (name: string, email: string, password: string, accountType: "listener" | "artist" = "listener") => {
    const r = await apiSignup({ name, email, password, account_type: accountType });
    setAccessToken(r.access_token);
    setToken(r.access_token);
    await refreshMe(r.access_token);
  }, [refreshMe]);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    clearAccessToken();
    setToken(null);
    setUser(null);
  }, []);

  const updateMe = useCallback(async (params: { name?: string | null; email?: string; account_type?: "listener" | "artist" }) => {
    const t = token ?? getAccessToken();
    if (!t) throw new Error("Log in to update your profile.");
    const nextUser = await apiUpdateMe(t, params);
    setUser(nextUser);
    return nextUser;
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, login, signup, logout, refreshMe, updateMe }),
    [user, token, loading, login, signup, logout, refreshMe, updateMe]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
