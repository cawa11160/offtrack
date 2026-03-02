import { useNavigate } from "react-router-dom";
import { BarChart3, UserRound, Upload, Music2 } from "lucide-react";

const quickStats = [
  { label: "Monthly listeners", value: "128,430" },
  { label: "Followers", value: "24,118" },
  { label: "Saves this week", value: "+1,284" },
];

export default function ArtistLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-white pb-44">
      <section className="mx-auto w-full max-w-[1303px] px-3 py-5 sm:px-7 sm:py-7">
        <div className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.08em] text-black/70">
                Artist Hub
              </p>
              <h1 className="mt-2 font-['Arimo',sans-serif] text-[40px] font-bold leading-none text-black sm:text-[54px]">
                Musician Dashboard
              </h1>
              <p className="mt-3 max-w-[700px] font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black/85">
                Manage your profile, publish updates, and understand your audience from one place.
              </p>
            </div>
            <div className="grid h-[70px] w-[70px] place-items-center rounded-[10px] bg-white">
              <Music2 className="h-8 w-8 text-black" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {quickStats.map((item) => (
              <article key={item.label} className="rounded-[10px] bg-white p-4">
                <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">
                  {item.label}
                </p>
                <p className="mt-2 font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">{item.value}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate("/artist/profile")}
            className="rounded-[10px] bg-[#d0d0d0] p-5 text-left transition-colors hover:bg-[#c5c5c5]"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-white">
              <UserRound className="h-5 w-5 text-black" />
            </div>
            <h2 className="font-['Arimo',sans-serif] text-[28px] font-bold leading-none text-black">Musician Profile</h2>
            <p className="mt-3 font-['Arimo',sans-serif] text-[17px] font-bold leading-tight text-black/80">
              Edit your bio, genres, social links, and featured releases.
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate("/artist/analytics")}
            className="rounded-[10px] bg-[#d0d0d0] p-5 text-left transition-colors hover:bg-[#c5c5c5]"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-white">
              <BarChart3 className="h-5 w-5 text-black" />
            </div>
            <h2 className="font-['Arimo',sans-serif] text-[28px] font-bold leading-none text-black">Listener Analytics</h2>
            <p className="mt-3 font-['Arimo',sans-serif] text-[17px] font-bold leading-tight text-black/80">
              Track streams, audience growth, and top cities in real time.
            </p>
          </button>

          <article className="rounded-[10px] bg-[#d0d0d0] p-5">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-white">
              <Upload className="h-5 w-5 text-black" />
            </div>
            <h2 className="font-['Arimo',sans-serif] text-[28px] font-bold leading-none text-black">Next Release</h2>
            <p className="mt-3 font-['Arimo',sans-serif] text-[17px] font-bold leading-tight text-black/80">
              "Midnight Echoes" is scheduled for March 18. Upload artwork and final master to prepare launch.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
