const genres = ["Indie Rock", "Dream Pop", "Alternative"];
const links = [
  { label: "Instagram", value: "@offtrackartist" },
  { label: "TikTok", value: "@offtrackmusic" },
  { label: "Website", value: "offtrackmusic.com" },
];

const releases = [
  { title: "Midnight Echoes", type: "Single", date: "Mar 18, 2026" },
  { title: "Signals", type: "EP", date: "Nov 22, 2025" },
  { title: "Static Bloom", type: "Album", date: "May 03, 2025" },
];

export default function MusicianProfile() {
  return (
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-white pb-44">
      <section className="mx-auto w-full max-w-[1303px] px-3 py-5 sm:px-7 sm:py-7">
        <div className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-6">
          <p className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.08em] text-black/70">
            Artist Hub
          </p>
          <h1 className="mt-2 font-['Arimo',sans-serif] text-[40px] font-bold leading-none text-black sm:text-[54px]">
            Musician Profile
          </h1>
          <p className="mt-3 max-w-[760px] font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black/85">
            Keep your artist identity up to date so listeners can discover and connect with your story.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">Public Profile</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-[10px] bg-white p-4">
                <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">Artist name</p>
                <p className="mt-1 font-['Arimo',sans-serif] text-[24px] font-bold leading-tight text-black">Offtrack Sessions</p>
              </div>
              <div className="rounded-[10px] bg-white p-4">
                <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">Bio</p>
                <p className="mt-1 font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black/85">
                  Independent artist blending guitar-driven hooks with electronic textures and late-night city energy.
                </p>
              </div>
              <div className="rounded-[10px] bg-white p-4">
                <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">Genres</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {genres.map((genre) => (
                    <span
                      key={genre}
                      className="rounded-[8px] bg-[#d0d0d0] px-3 py-1 font-['Arimo',sans-serif] text-[15px] font-bold text-black"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">Links & Media</h2>
            <div className="mt-4 space-y-3">
              {links.map((link) => (
                <div key={link.label} className="rounded-[10px] bg-white p-4">
                  <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">{link.label}</p>
                  <p className="mt-1 font-['Arimo',sans-serif] text-[20px] font-bold leading-tight text-black">{link.value}</p>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className="mt-4 rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
          <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">Featured Releases</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {releases.map((release) => (
              <div key={release.title} className="rounded-[10px] bg-white p-4">
                <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">{release.type}</p>
                <p className="mt-1 font-['Arimo',sans-serif] text-[22px] font-bold leading-tight text-black">{release.title}</p>
                <p className="mt-2 font-['Arimo',sans-serif] text-[16px] font-bold leading-tight text-black/70">{release.date}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
