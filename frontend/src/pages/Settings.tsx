import { useState } from "react";
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

export default function Settings() {
  const navigate = useNavigate();
  const [appearance, setAppearance] = useState<"dark" | "light">("light");
  const [display, setDisplay] = useState<"compact" | "normal" | "wide">("normal");

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
