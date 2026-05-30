import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { apiListUploads, apiRecommend, apiUrl, type RecItem } from "@/lib/api";
import { usePlaybackMilestones } from "@/lib/playbackTracking";

type Song = {
  title: string;
  artist: string;
  coverUrl: string;
  duration: number;
};

type PlayableSong = Song & {
  id: string;
  sourceUrl: string;
  sourceKind: "upload" | "preview";
  recommendationRequestId?: string;
  recommendationRank?: number;
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
  const libraryPromiseRef = useRef<Promise<PlayableSong[]> | null>(null);
  const lastProgressAtRef = useRef(0);
  const [audioLibrary, setAudioLibrary] = useState<PlayableSong[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [duration, setDuration] = useState(currentSong.duration || 0);
  const playback = usePlaybackMilestones("pink_player");
  const activeSong = audioLibrary[activeIndex] ?? audioLibrary[0];
  const displaySong: Song = activeSong ?? currentSong;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const loadAudioLibrary = useCallback((): Promise<PlayableSong[]> => {
    if (audioLibrary.length) return Promise.resolve(audioLibrary);
    if (libraryPromiseRef.current) return libraryPromiseRef.current;

    setLibraryLoading(true);
    libraryPromiseRef.current = (async () => {
      const next: PlayableSong[] = [];

      const uploads = await apiListUploads(20).catch(() => []);
      for (const u of uploads) {
        if (!u.audioUrl) continue;
        next.push({
          id: u.id,
          title: (u.title || "Uploaded Track").trim(),
          artist: (u.artist || "Unknown Artist").trim(),
          coverUrl: (u.imageUrl || currentSong.coverUrl || "").trim(),
          duration: 0,
          sourceUrl: apiUrl(u.audioUrl),
          sourceKind: "upload",
        });
      }

      const recData = await apiRecommend([], 24, "all", []).catch(() => ({ recommendations: [] as RecItem[] }));
      for (const r of recData.recommendations || []) {
        const src = (r.audioUrl ? apiUrl(r.audioUrl) : "") || (r.previewUrl || "");
        if (!src) continue;
        next.push({
          id: r.id,
          title: (r.title || "Unknown Track").trim(),
          artist: (r.artist || "Unknown Artist").trim(),
          coverUrl: (r.imageUrl || currentSong.coverUrl || "").trim(),
          duration: (r.durationMs && Number.isFinite(r.durationMs) ? Math.max(0, Math.floor(r.durationMs / 1000)) : 0),
          sourceUrl: src,
          sourceKind: r.audioUrl ? "upload" : "preview",
          recommendationRequestId: r.recommendationRequestId,
          recommendationRank: r.recommendationRank,
        });
      }

      const deduped = Array.from(
        new Map(next.map((t) => [`${t.title.toLowerCase()}|${t.artist.toLowerCase()}|${t.sourceUrl}`, t])).values()
      );
      setAudioLibrary(deduped);
      setActiveIndex(0);
      setDuration(deduped[0]?.duration || currentSong.duration || 0);
      return deduped;
    })().finally(() => {
      libraryPromiseRef.current = null;
      setLibraryLoading(false);
    });

    return libraryPromiseRef.current;
  }, [audioLibrary, currentSong.coverUrl, currentSong.duration]);

  const getNextIndex = useCallback((fromIndex: number) => {
    if (audioLibrary.length <= 1) return fromIndex;
    if (isShuffle) {
      let idx = fromIndex;
      while (idx === fromIndex) {
        idx = Math.floor(Math.random() * audioLibrary.length);
      }
      return idx;
    }
    return (fromIndex + 1) % audioLibrary.length;
  }, [audioLibrary.length, isShuffle]);

  const getPrevIndex = useCallback((fromIndex: number) => {
    if (audioLibrary.length <= 1) return fromIndex;
    return (fromIndex - 1 + audioLibrary.length) % audioLibrary.length;
  }, [audioLibrary.length]);

  const playTrack = useCallback(async (index: number, library: PlayableSong[] = audioLibrary) => {
    const audio = audioRef.current;
    const song = library[index];
    if (!audio || !song?.sourceUrl) return;
    if (activeSong?.id && activeSong.id !== song.id) {
      playback.skip();
    }
    setActiveIndex(index);
    setCurrentTime(0);
    setDuration(song.duration || 0);
    audio.src = song.sourceUrl;
    audio.currentTime = 0;
    audio.load();
    try {
      await audio.play();
      setIsPlaying(true);
      playback.start(
        {
          id: song.id,
          title: song.title,
          artist: song.artist,
          sourceKind: song.sourceKind,
          recommendationRequestId: song.recommendationRequestId,
          recommendationRank: song.recommendationRank,
        },
        song.duration ? song.duration * 1000 : undefined
      );
    } catch {
      setIsPlaying(false);
    }
  }, [activeSong?.id, audioLibrary, playback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      const now = performance.now();
      if (now - lastProgressAtRef.current < 250 && !audio.ended) return;
      lastProgressAtRef.current = now;
      setCurrentTime(audio.currentTime || 0);
      playback.progress(audio.currentTime || 0, Number.isFinite(audio.duration) ? audio.duration : undefined);
    };
    const onMeta = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(nextDuration || activeSong?.duration || 0);
    };
    const onEnded = () => {
      playback.progress(audio.currentTime || 0, Number.isFinite(audio.duration) ? audio.duration : undefined);
      playback.complete();
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play().then(() => {
          if (activeSong) {
            playback.resetForTrack(activeSong, activeSong.duration ? activeSong.duration * 1000 : undefined);
            playback.start(
              {
                id: activeSong.id,
                title: activeSong.title,
                artist: activeSong.artist,
                sourceKind: activeSong.sourceKind,
                recommendationRequestId: activeSong.recommendationRequestId,
                recommendationRank: activeSong.recommendationRank,
              },
              activeSong.duration ? activeSong.duration * 1000 : undefined
            );
          }
        }).catch(() => setIsPlaying(false));
        return;
      }
      if (audioLibrary.length > 0) {
        void playTrack(getNextIndex(activeIndex));
      } else {
        setIsPlaying(false);
      }
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
  }, [activeIndex, activeSong, audioLibrary.length, getNextIndex, isRepeat, playback, playTrack]);

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
    if (audioLibrary.length === 0) {
      const loaded = await loadAudioLibrary();
      if (!loaded.length) return;
      await playTrack(0, loaded);
      return;
    }

    if (audio.src && !audio.ended && activeSong) {
      try {
        await audio.play();
        setIsPlaying(true);
        playback.start(
          {
            id: activeSong.id,
            title: activeSong.title,
            artist: activeSong.artist,
            sourceKind: activeSong.sourceKind,
            recommendationRequestId: activeSong.recommendationRequestId,
            recommendationRank: activeSong.recommendationRank,
          },
          activeSong.duration ? activeSong.duration * 1000 : undefined
        );
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    await playTrack(activeIndex);
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
      className="fixed bottom-4 left-2 right-3 z-40 md:left-[var(--player-left-inset)]"
      style={{
        "--player-left-inset": `${Math.max(8, leftInset)}px`,
      } as CSSProperties & Record<string, string>}
    >
      <audio ref={audioRef} preload="metadata" />
      <div className="h-24 overflow-hidden rounded-l-full rounded-r-[10px] border-2 border-[#ff8a8a] bg-[#ff8a8a] px-5 shadow-xl">
        <div className="flex h-full items-center justify-between">
          <div className="hidden w-1/4 min-w-[180px] items-center gap-3 lg:flex">
            <img src={displaySong.coverUrl} alt="Album Art" className="h-16 w-16 rounded-lg object-cover shadow-md" />
            <div className="flex flex-col">
              <h3 className="text-xl font-black uppercase leading-tight tracking-tight text-black">{displaySong.title}</h3>
              <p className="text-base font-semibold leading-tight text-black/90">
                {displaySong.artist}
                {activeSong ? (
                  <span className="ml-2 text-xs uppercase tracking-wide text-black/60">
                    {activeSong.sourceKind === "upload" ? "full" : "preview"}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="mx-2 flex max-w-3xl flex-1 flex-col items-center lg:mx-6">
            <div className="mb-2 flex items-center gap-4 sm:gap-6">
              <button onClick={() => setIsShuffle((v) => !v)} className={isShuffle ? "text-black" : "text-black/60"}>
                <Shuffle size={24} strokeWidth={2.5} />
              </button>
              <button className="text-black" onClick={() => void playTrack(getPrevIndex(activeIndex))} disabled={audioLibrary.length === 0}>
                <SkipBack size={28} fill="black" strokeWidth={0} />
              </button>
              <button onClick={() => void togglePlay()} className="text-black disabled:opacity-50" disabled={libraryLoading}>
                {isPlaying ? <Pause size={32} fill="black" strokeWidth={0} /> : <Play size={32} fill="black" strokeWidth={0} />}
              </button>
              <button className="text-black" onClick={() => void playTrack(getNextIndex(activeIndex))} disabled={audioLibrary.length === 0}>
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
            {!activeSong ? (
              <p className="mt-1 text-xs font-bold text-black/60">
                {libraryLoading ? "Loading playable tracks..." : "Press play to load songs."}
              </p>
            ) : null}
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
