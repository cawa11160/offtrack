import { useEffect, useState } from "react";
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

type Song = {
  title: string;
  artist: string;
  coverUrl: string;
  duration: number;
};

type PinkPlayerBarProps = {
  currentSong: Song;
};

function CustomSlider({
  value,
  max,
  onChange,
  className = "",
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <div className={`relative flex w-full items-center ${className}`}>
      <input
        type="range"
        min="0"
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-[3px] w-full cursor-pointer appearance-none rounded-full bg-black outline-none"
      />
    </div>
  );
}

export default function PinkPlayerBar({ currentSong }: PinkPlayerBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    let interval: number | undefined;
    if (isPlaying && currentTime < currentSong.duration) {
      interval = window.setInterval(() => {
        setCurrentTime((prev) => Math.min(prev + 1, currentSong.duration));
      }, 1000);
    } else if (currentTime >= currentSong.duration) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentSong.duration, currentTime]);

  return (
    <div className="fixed bottom-8 left-1/2 z-40 w-[95%] max-w-6xl -translate-x-1/2">
      <div className="h-28 overflow-hidden rounded-l-full rounded-r-[10px] border-4 border-[#ff8a8a] bg-[#ff8a8a] px-8 shadow-xl">
        <div className="flex h-full items-center justify-between">
          <div className="hidden w-1/4 min-w-[200px] items-center gap-4 lg:flex">
            <img src={currentSong.coverUrl} alt="Album Art" className="h-20 w-20 rounded-lg object-cover shadow-md" />
            <div className="flex flex-col">
              <h3 className="text-2xl font-black uppercase leading-tight tracking-tight text-black">{currentSong.title}</h3>
              <p className="text-xl font-semibold leading-tight text-black/90">{currentSong.artist}</p>
            </div>
          </div>

          <div className="mx-2 flex max-w-xl flex-1 flex-col items-center lg:mx-8">
            <div className="mb-3 flex items-center gap-6 sm:gap-8">
              <button onClick={() => setIsShuffle((v) => !v)} className={isShuffle ? "text-black" : "text-black/60"}>
                <Shuffle size={28} strokeWidth={2.5} />
              </button>
              <button className="text-black">
                <SkipBack size={32} fill="black" strokeWidth={0} />
              </button>
              <button onClick={() => setIsPlaying((v) => !v)} className="text-black">
                {isPlaying ? <Pause size={36} fill="black" strokeWidth={0} /> : <Play size={36} fill="black" strokeWidth={0} />}
              </button>
              <button className="text-black">
                <SkipForward size={32} fill="black" strokeWidth={0} />
              </button>
              <button onClick={() => setIsRepeat((v) => !v)} className={isRepeat ? "text-black" : "text-black/60"}>
                <Repeat size={28} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex w-full items-center gap-3">
              <span className="min-w-[35px] text-sm font-bold text-black">{formatTime(currentTime)}</span>
              <CustomSlider value={currentTime} max={currentSong.duration} onChange={setCurrentTime} />
              <span className="min-w-[35px] text-sm font-bold text-black">{formatTime(currentSong.duration)}</span>
            </div>
          </div>

          <div className="hidden w-1/4 min-w-[150px] items-center justify-end gap-4 md:flex">
            <button onClick={() => setVolume((v) => (v === 0 ? 80 : 0))}>
              {volume === 0 ? <VolumeX size={28} className="text-black" /> : <Volume2 size={28} className="text-black" strokeWidth={2.5} />}
            </button>
            <div className="w-24">
              <CustomSlider value={volume} max={100} onChange={setVolume} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

