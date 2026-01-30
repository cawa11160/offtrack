import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { CreditCard, Mail, ShieldCheck } from "lucide-react";

export default function Account() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your account details.
          </p>
        </div>
        <Link
          to="/settings"
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
        >
          Go to Settings
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div className="font-medium">Email</div>
          </div>
          <div className="mt-3 text-sm">{user?.email ?? "Not logged in"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {user ? "" : "Log in to see your account."}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div className="font-medium">Plan</div>
          </div>
          <div className="mt-3 text-sm">Free (Demo)</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Upgrade flows can be added later.
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div className="font-medium">Billing</div>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            No billing method connected (presentation only).
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Add payment method
            </button>
            <button
              type="button"
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
            >
              Download receipts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
