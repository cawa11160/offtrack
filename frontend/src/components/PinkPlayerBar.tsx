import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

type Song = {
  title: string;
  artist: string;
  coverUrl: string;
  duration: number;
};

type PlayableSong = Song & {
  audioUrl: string;
};

type PinkPlayerBarProps = {
  currentSong: Song;
  leftInset?: number;
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

export default function PinkPlayerBar({ currentSong, leftInset = 0 }: PinkPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioLibrary = useMemo<PlayableSong[]>(
    () => [
      {
        ...currentSong,
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      },
      {
        title: "Electric Dreams",
        artist: "Voltage",
        coverUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
        duration: 0,
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      },
      {
        title: "Urban Poetry",
        artist: "Street Echo",
        coverUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400&h=400&fit=crop",
        duration: 0,
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      },
      {
        title: "Neon Nights",
        artist: "Synthwave Collective",
        coverUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop",
        duration: 0,
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      },
      {
        title: "Silent Storm",
        artist: "Aurora Borealis",
        coverUrl: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop",
        duration: 0,
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
      },
    ],
    [currentSong]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [duration, setDuration] = useState(currentSong.duration || 0);
  const activeSong = audioLibrary[activeIndex] ?? audioLibrary[0] ?? { ...currentSong, audioUrl: "" };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getNextIndex = (fromIndex: number) => {
    if (audioLibrary.length <= 1) return fromIndex;
    if (isShuffle) {
      let idx = fromIndex;
      while (idx === fromIndex) {
        idx = Math.floor(Math.random() * audioLibrary.length);
      }
      return idx;
    }
    return (fromIndex + 1) % audioLibrary.length;
  };

  const getPrevIndex = (fromIndex: number) => {
    if (audioLibrary.length <= 1) return fromIndex;
    return (fromIndex - 1 + audioLibrary.length) % audioLibrary.length;
  };

  const playTrack = async (index: number) => {
    const audio = audioRef.current;
    const song = audioLibrary[index];
    if (!audio || !song?.audioUrl) return;
    setActiveIndex(index);
    setCurrentTime(0);
    setDuration(song.duration || 0);
    audio.src = song.audioUrl;
    audio.currentTime = 0;
    audio.load();
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onMeta = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(nextDuration || activeSong.duration || 0);
    };
    const onEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
        return;
      }
      void playTrack(getNextIndex(activeIndex));
    };
    const onError = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [activeIndex, activeSong.duration, isRepeat]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
  }, [volume]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    // User asked for a different song every time Play is pressed.
    const next = getNextIndex(activeIndex);
    await playTrack(next);
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(duration || 0, value));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  return (
    <div
      className="fixed bottom-4 z-40"
      style={{
        left: `${Math.max(8, leftInset)}px`,
        right: "12px",
      }}
    >
      <audio ref={audioRef} preload="metadata" />
      <div className="h-24 overflow-hidden rounded-l-full rounded-r-[10px] border-2 border-[#ff8a8a] bg-[#ff8a8a] px-5 shadow-xl">
        <div className="flex h-full items-center justify-between">
          <div className="hidden w-1/4 min-w-[180px] items-center gap-3 lg:flex">
            <img src={activeSong.coverUrl} alt="Album Art" className="h-16 w-16 rounded-lg object-cover shadow-md" />
            <div className="flex flex-col">
              <h3 className="text-xl font-black uppercase leading-tight tracking-tight text-black">{activeSong.title}</h3>
              <p className="text-base font-semibold leading-tight text-black/90">{activeSong.artist}</p>
            </div>
          </div>

          <div className="mx-2 flex max-w-3xl flex-1 flex-col items-center lg:mx-6">
            <div className="mb-2 flex items-center gap-4 sm:gap-6">
              <button onClick={() => setIsShuffle((v) => !v)} className={isShuffle ? "text-black" : "text-black/60"}>
                <Shuffle size={24} strokeWidth={2.5} />
              </button>
              <button className="text-black" onClick={() => void playTrack(getPrevIndex(activeIndex))}>
                <SkipBack size={28} fill="black" strokeWidth={0} />
              </button>
              <button onClick={() => void togglePlay()} className="text-black">
                {isPlaying ? <Pause size={32} fill="black" strokeWidth={0} /> : <Play size={32} fill="black" strokeWidth={0} />}
              </button>
              <button className="text-black" onClick={() => void playTrack(getNextIndex(activeIndex))}>
                <SkipForward size={28} fill="black" strokeWidth={0} />
              </button>
              <button onClick={() => setIsRepeat((v) => !v)} className={isRepeat ? "text-black" : "text-black/60"}>
                <Repeat size={24} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex w-full items-center gap-3">
              <span className="min-w-[35px] text-base font-bold text-black">{formatTime(currentTime)}</span>
              <CustomSlider value={currentTime} max={Math.max(duration, 1)} onChange={onSeek} />
              <span className="min-w-[35px] text-base font-bold text-black">{formatTime(duration || 0)}</span>
            </div>
          </div>

          <div className="hidden w-1/4 min-w-[130px] items-center justify-end gap-3 md:flex">
            <button onClick={() => setVolume((v) => (v === 0 ? 80 : 0))}>
              {volume === 0 ? <VolumeX size={24} className="text-black" /> : <Volume2 size={24} className="text-black" strokeWidth={2.5} />}
            </button>
            <div className="w-20">
              <CustomSlider value={volume} max={100} onChange={setVolume} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
