import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Music2, ShieldCheck } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { normalizeAuthEmail, validateAuthEmail, validateLoginPassword } from "@/lib/authInput";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailError = useMemo(() => validateAuthEmail(email), [email]);
  const passwordError = useMemo(() => validateLoginPassword(password), [password]);
  const canSubmit = !emailError && !passwordError && !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setErr(null);
    if (emailError || passwordError) {
      setErr(emailError || passwordError);
      return;
    }
    setLoading(true);
    try {
      await login(normalizeAuthEmail(email), password);
      navigate("/");
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "Login failed"));
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
          <div className="text-xl font-semibold tracking-tight">Offtrack</div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-[#f8f7f2] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-black/55">
            <ShieldCheck className="h-4 w-4" />
            Secure session
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Log in</h1>
          <p className="mt-2 text-sm text-black/60">Use the email and password attached to your Offtrack account.</p>
        </div>

        {err && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="text-sm font-medium" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail(normalizeAuthEmail(email))}
              type="email"
              placeholder="you@example.com"
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
              required
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              spellCheck={false}
              aria-invalid={Boolean(submitted && emailError)}
            />
            {submitted && emailError ? <p className="mt-2 text-xs font-semibold text-red-700">{emailError}</p> : null}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="login-password">
              Password
            </label>
            <div className="mt-2 flex h-11 items-center rounded-xl border border-black/10 bg-white px-4 focus-within:ring-2 focus-within:ring-black/10">
              <LockKeyhole className="mr-2 h-4 w-4 text-black/40" />
              <input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="min-w-0 flex-1 bg-transparent outline-none"
                required
                autoComplete="current-password"
                maxLength={128}
                aria-invalid={Boolean(submitted && passwordError)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="grid h-8 w-8 place-items-center rounded-md text-black/55 hover:bg-black/5"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {submitted && passwordError ? <p className="mt-2 text-xs font-semibold text-red-700">{passwordError}</p> : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 h-11 w-full rounded-xl bg-black font-semibold text-white hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="h-11 w-full rounded-xl border border-black/10 bg-white font-semibold hover:bg-black/5 active:scale-[0.99]"
          >
            Continue as guest
          </button>
        </form>

        <div className="mt-6 text-sm text-black/70">
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-black underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
