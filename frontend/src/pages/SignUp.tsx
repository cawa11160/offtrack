import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";

export default function SignUp() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // presentation-only
    console.log("SIGNUP", { name, email, password });

    // optional: pretend sign up succeeded
    navigate("/");
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

        <h1 className="text-3xl font-semibold tracking-tight">Sign up</h1>
        <p className="mt-2 text-sm text-black/60">
          Create an account (demo only — no database).
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              placeholder="Your name"
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-4 outline-none focus:ring-2 focus:ring-black/10"
              required
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
            />
          </div>

          <button
            type="submit"
            className="mt-2 h-11 w-full rounded-xl bg-black text-white hover:opacity-90 active:scale-[0.99]"
          >
            Create account
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="h-11 w-full rounded-xl border border-black/10 bg-white hover:bg-black/5 active:scale-[0.99]"
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

        <div className="mt-10 text-xs text-black/40">
          Demo only — credentials aren’t stored.
        </div>
      </div>
    </div>
  );
}
