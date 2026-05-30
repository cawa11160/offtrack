import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Music2, ShieldCheck } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  normalizeAuthEmail,
  passwordStrength,
  sanitizeDisplayName,
  validateAuthEmail,
  validateSignupPassword,
} from "@/lib/authInput";
import { getErrorMessage } from "@/lib/errors";

const strengthLabels = ["Too weak", "Weak", "Basic", "Good", "Strong", "Very strong"];

export default function SignUp() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<"listener" | "artist">("listener");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const cleanName = useMemo(() => sanitizeDisplayName(name), [name]);
  const emailError = useMemo(() => validateAuthEmail(email), [email]);
  const passwordError = useMemo(() => validateSignupPassword(password), [password]);
  const nameError = submitted && !cleanName ? "Enter your name." : null;
  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit = Boolean(cleanName) && !emailError && !passwordError && !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setErr(null);
    if (!cleanName || emailError || passwordError) {
      setErr(!cleanName ? "Enter your name." : emailError || passwordError);
      return;
    }
    setLoading(true);
    try {
      await signup(cleanName, normalizeAuthEmail(email), password, accountType);
      navigate(accountType === "artist" ? "/profile/uploads" : "/");
    } catch (e: unknown) {
      setErr(getErrorMessage(e, "Signup failed"));
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
            Protected account setup
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Sign up</h1>
          <p className="mt-2 text-sm text-black/60">Create a listener or artist account with a stronger password.</p>
        </div>

        {err && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="text-sm font-medium" htmlFor="signup-account-type">
              Account type
            </label>
            <select
              id="signup-account-type"
              value={accountType}
              onChange={(e) => setAccountType((e.target.value as "listener" | "artist") || "listener")}
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="listener">Listener</option>
              <option value="artist">Artist</option>
            </select>
            <p className="mt-2 text-xs text-black/60">Artist accounts go to uploads after signup.</p>
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="signup-name">
              Name
            </label>
            <input
              id="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(cleanName)}
              type="text"
              placeholder="Your name"
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
              required
              autoComplete="name"
              maxLength={120}
              aria-invalid={Boolean(nameError)}
            />
            {nameError ? <p className="mt-2 text-xs font-semibold text-red-700">{nameError}</p> : null}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
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
            <label className="text-sm font-medium" htmlFor="signup-password">
              Password
            </label>
            <div className="mt-2 flex h-11 items-center rounded-xl border border-black/10 bg-white px-4 focus-within:ring-2 focus-within:ring-black/10">
              <LockKeyhole className="mr-2 h-4 w-4 text-black/40" />
              <input
                id="signup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="10+ characters with a letter and number"
                className="min-w-0 flex-1 bg-transparent outline-none"
                required
                autoComplete="new-password"
                minLength={10}
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
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-black transition-all" style={{ width: `${Math.max(8, strength * 20)}%` }} />
              </div>
              <span className="w-20 text-right text-xs font-semibold text-black/55">{strengthLabels[strength]}</span>
            </div>
            {submitted && passwordError ? <p className="mt-2 text-xs font-semibold text-red-700">{passwordError}</p> : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 h-11 w-full rounded-xl bg-black font-semibold text-white hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="h-11 w-full rounded-xl border border-black/10 bg-white font-semibold hover:bg-black/5 active:scale-[0.99]"
          >
            Back to home
          </button>
        </form>

        <div className="mt-6 text-sm text-black/70">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-black underline underline-offset-4">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
