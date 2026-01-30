import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (e: any) {
      setErr(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white">
            <Music2 className="h-5 w-5 text-black" />
          </div>
          <div className="text-xl font-semibold tracking-tight">Tunes</div>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-black/60">Welcome back.</p>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 w-full rounded-xl bg-black text-white hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="h-11 w-full rounded-xl border border-black/10 bg-white hover:bg-black/5 active:scale-[0.99]"
          >
            Continue as guest
          </button>
        </form>

        <div className="mt-6 text-sm text-black/70">
          Don’t have an account?{" "}
          <Link to="/signup" className="font-medium text-black underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
