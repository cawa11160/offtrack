const topCities = [
  { city: "New York", listeners: "18,420", growth: "+8.2%" },
  { city: "Los Angeles", listeners: "12,104", growth: "+5.6%" },
  { city: "Chicago", listeners: "9,278", growth: "+4.1%" },
  { city: "Seattle", listeners: "7,503", growth: "+6.8%" },
];

const topTracks = [
  { title: "Midnight Echoes", streams: "93,228", saves: "18,402" },
  { title: "Neon Lullaby", streams: "67,455", saves: "12,381" },
  { title: "Signals", streams: "51,991", saves: "9,744" },
];

export default function ListenerAnalytics() {
  return (
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-white pb-44">
      <section className="mx-auto w-full max-w-[1303px] px-3 py-5 sm:px-7 sm:py-7">
        <div className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-6">
          <p className="font-['Arimo',sans-serif] text-[16px] font-bold uppercase tracking-[0.08em] text-black/70">
            Artist Hub
          </p>
          <h1 className="mt-2 font-['Arimo',sans-serif] text-[40px] font-bold leading-none text-black sm:text-[54px]">
            Listener Analytics
          </h1>
          <p className="mt-3 max-w-[760px] font-['Arimo',sans-serif] text-[18px] font-bold leading-tight text-black/85">
            A quick view of audience momentum, streaming trends, and engagement performance.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[10px] bg-white p-4">
              <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">Total streams (30 days)</p>
              <p className="mt-2 font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">521,884</p>
            </div>
            <div className="rounded-[10px] bg-white p-4">
              <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">Monthly listeners</p>
              <p className="mt-2 font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">128,430</p>
            </div>
            <div className="rounded-[10px] bg-white p-4">
              <p className="font-['Arimo',sans-serif] text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">Save rate</p>
              <p className="mt-2 font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">21.5%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">Top Cities</h2>
            <div className="mt-4 space-y-2">
              {topCities.map((city) => (
                <div
                  key={city.city}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] bg-white px-4 py-3"
                >
                  <p className="font-['Arimo',sans-serif] text-[18px] font-bold text-black">{city.city}</p>
                  <p className="font-['Arimo',sans-serif] text-[17px] font-bold text-black/75">{city.listeners}</p>
                  <p className="font-['Arimo',sans-serif] text-[16px] font-bold text-black/65">{city.growth}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="font-['Arimo',sans-serif] text-[30px] font-bold leading-none text-black">Top Tracks</h2>
            <div className="mt-4 space-y-2">
              {topTracks.map((track) => (
                <div key={track.title} className="rounded-[10px] bg-white px-4 py-3">
                  <p className="font-['Arimo',sans-serif] text-[20px] font-bold leading-tight text-black">{track.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="font-['Arimo',sans-serif] text-[16px] font-bold text-black/70">Streams: {track.streams}</p>
                    <p className="font-['Arimo',sans-serif] text-[16px] font-bold text-black/70">Saves: {track.saves}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
