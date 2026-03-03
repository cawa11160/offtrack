import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { CreditCard, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  apiAddPaymentMethod,
  apiDeletePaymentMethod,
  apiDownloadReceipt,
  apiListPaymentMethods,
  apiListReceipts,
  type BillingPaymentMethod,
  type BillingReceipt,
} from "@/lib/api";

export default function Account() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [methods, setMethods] = useState<BillingPaymentMethod[]>([]);
  const [receipts, setReceipts] = useState<BillingReceipt[]>([]);
  const [billingError, setBillingError] = useState("");
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [submittingMethod, setSubmittingMethod] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (!user) return;
    setLoadingBilling(true);
    setBillingError("");
    Promise.all([apiListPaymentMethods(), apiListReceipts(50)])
      .then(([m, r]) => {
        setMethods(m);
        setReceipts(r);
      })
      .catch((e: any) => setBillingError(e?.message || "Failed to load billing data"))
      .finally(() => setLoadingBilling(false));
  }, [user]);

  if (!user) return null;

  async function submitPaymentMethod() {
    setBillingError("");
    const clean = cardNumber.replace(/\s+/g, "");
    if (!clean || !expMonth || !expYear) {
      setBillingError("Card number, month, and year are required.");
      return;
    }
    setSubmittingMethod(true);
    try {
      await apiAddPaymentMethod({
        cardNumber: clean,
        expMonth: Number(expMonth),
        expYear: Number(expYear),
        holderName: holderName.trim(),
        setDefault: true,
      });
      const m = await apiListPaymentMethods();
      const r = await apiListReceipts(50);
      setMethods(m);
      setReceipts(r);
      setShowAddForm(false);
      setHolderName("");
      setCardNumber("");
      setExpMonth("");
      setExpYear("");
    } catch (e: any) {
      setBillingError(e?.message || "Failed to add payment method");
    } finally {
      setSubmittingMethod(false);
    }
  }

  async function deleteMethod(methodId: string) {
    setBillingError("");
    try {
      await apiDeletePaymentMethod(methodId);
      setMethods((prev) => prev.filter((m) => m.id !== methodId));
    } catch (e: any) {
      setBillingError(e?.message || "Failed to delete payment method");
    }
  }

  async function downloadReceipt(receiptId: string) {
    setBillingError("");
    try {
      const blob = await apiDownloadReceipt(receiptId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${receiptId}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setBillingError(e?.message || "Failed to download receipt");
    }
  }

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
            {loadingBilling ? "Loading billing data..." : methods.length ? `${methods.length} payment method(s) saved` : "No billing method connected."}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm((v) => !v);
                setShowReceipts(false);
              }}
              className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Add payment method
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReceipts((v) => !v);
                setShowAddForm(false);
              }}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm hover:bg-accent"
            >
              Download receipts
            </button>
          </div>

          {billingError ? <div className="mt-3 text-sm text-red-600">{billingError}</div> : null}

          {methods.length > 0 ? (
            <div className="mt-4 space-y-2">
              {methods.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium uppercase">{m.brand}</span> ending in {m.last4} ({String(m.expMonth).padStart(2, "0")}/{m.expYear})
                    {m.isDefault ? <span className="ml-2 text-xs text-green-700">Default</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteMethod(m.id)}
                    className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {showAddForm ? (
            <div className="mt-4 grid gap-3 rounded-xl border border-border p-3">
              <input
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="Card holder name"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="Card number"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  placeholder="Exp month (MM)"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  value={expYear}
                  onChange={(e) => setExpYear(e.target.value)}
                  placeholder="Exp year (YYYY)"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={submitPaymentMethod}
                disabled={submittingMethod}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {submittingMethod ? "Saving..." : "Save payment method"}
              </button>
            </div>
          ) : null}

          {showReceipts ? (
            <div className="mt-4 space-y-2 rounded-xl border border-border p-3">
              {receipts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No receipts available yet.</div>
              ) : (
                receipts.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div className="text-sm">
                      <div className="font-medium">{r.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.status.toUpperCase()} • {(r.amountCents / 100).toFixed(2)} {r.currency}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadReceipt(r.id)}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Download
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
