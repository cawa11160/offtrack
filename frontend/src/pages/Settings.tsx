import { useEffect, useState } from "react";
import { ArrowLeft, Music2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const accountItems = ["Account", "General", "My profile", "Billing"];
const soundItems = [
  "Sound system",
  "Volume",
  "Bass",
  "Bass cut-off",
  "Treble",
  "Treble cut-off",
  "Balance",
  "Equalizer",
];

const ADMIN_KEY_STORAGE = "offtrack_admin_api_key";
const ADMIN_UI_ENABLED = ["1", "true", "yes", "on"].includes(
  String((import.meta as any).env?.VITE_ENABLE_ADMIN_SECURITY ?? "false").toLowerCase()
);

function hasAdminKeyStored(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window.localStorage.getItem(ADMIN_KEY_STORAGE) || "").trim());
}

export default function Settings() {
  const navigate = useNavigate();
  const [appearance, setAppearance] = useState<"dark" | "light">("light");
  const [display, setDisplay] = useState<"compact" | "normal" | "wide">("normal");
  const [showAdminButton, setShowAdminButton] = useState<boolean>(() => ADMIN_UI_ENABLED || hasAdminKeyStored());

  useEffect(() => {
    const refresh = () => setShowAdminButton(ADMIN_UI_ENABLED || hasAdminKeyStored());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("admin-key-change", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("admin-key-change", refresh as EventListener);
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#FFFFFF] pb-28">
      <section className="mx-auto w-full max-w-[1420px] px-4 pt-8 sm:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-[10px] text-black transition-colors hover:bg-black/5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-7 w-7" />
          </button>
          <div className="grid h-12 w-12 place-items-center rounded-[10px] border border-black bg-white">
            <Music2 className="h-7 w-7 text-black" />
          </div>
        </div>

        <h1 className="mt-8 font-['Arimo',sans-serif] text-[42px] font-bold leading-none text-black">Settings</h1>
        {showAdminButton ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => navigate("/admin/security")}
              className="rounded-[10px] border border-black/20 bg-white px-4 py-2 font-['Arimo',sans-serif] text-[16px] font-bold text-black hover:bg-black/5"
            >
              Open Admin Security
            </button>
          </div>
        ) : null}

        <div className="mt-4 min-h-[640px] rounded-[10px] bg-[#d9d9d9]">
          <div className="grid min-h-[640px] grid-cols-[270px_1fr]">
            <aside className="border-r border-black/35 px-5 py-4">
              <div className="font-['Arimo',sans-serif] text-[29px] font-bold leading-[1.08] text-black">
                {accountItems.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>

              <div className="mt-10 font-['Arimo',sans-serif] text-[29px] font-bold leading-[1.08] text-black">
                {soundItems.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </aside>

            <main className="px-8 py-4">
              <h2 className="font-['Arimo',sans-serif] text-[45px] font-bold leading-none text-black">General</h2>

              <div className="mt-4 space-y-6 font-['Arimo',sans-serif] text-black">
                <div>
                  <p className="text-[29px] font-bold leading-none">Appearance</p>
                  <div className="mt-2 flex items-center gap-7 text-[25px] font-bold leading-none">
                    <button
                      type="button"
                      onClick={() => setAppearance("dark")}
                      className={appearance === "dark" ? "underline underline-offset-4" : ""}
                    >
                      Dark mode
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppearance("light")}
                      className={appearance === "light" ? "underline underline-offset-4" : ""}
                    >
                      Light mode
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-[29px] font-bold leading-none">Notifications</p>
                  <div className="mt-2 text-[25px] font-bold leading-[1.15]">
                    <p>New music release</p>
                    <p>Friends’ activities</p>
                  </div>
                </div>

                <div>
                  <p className="text-[29px] font-bold leading-none">Display</p>
                  <div className="mt-2 flex items-center gap-12 text-[25px] font-bold leading-none">
                    <button
                      type="button"
                      onClick={() => setDisplay("compact")}
                      className={display === "compact" ? "underline underline-offset-4" : ""}
                    >
                      Compact
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplay("normal")}
                      className={display === "normal" ? "underline underline-offset-4" : ""}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplay("wide")}
                      className={display === "wide" ? "underline underline-offset-4" : ""}
                    >
                      Wide
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-[29px] font-bold leading-none">Language</p>
                  <p className="mt-2 text-[25px] font-bold leading-none">English (Aus)</p>
                </div>
              </div>
            </main>
          </div>
        </div>
      </section>
    </div>
  );
}
