import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Music2, Play, Radio, Shuffle } from "lucide-react";

import { apiFeedback, apiGetArtistProfile, type ArtistConversionLinks, type ArtistProfile } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

type Track = {
  title: string;
  plays: string;
  length: string;
};

type Release = {
  title: string;
  subtitle: string;
};

function msToClock(ms?: number | null) {
  if (!ms || ms <= 0) return "--:--";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function conversionEntries(links?: ArtistConversionLinks) {
  const labels: Record<keyof ArtistConversionLinks, string> = {
    spotify: "Spotify",
    website: "Website",
    merch: "Merch",
    tickets: "Tickets",
    emailSignup: "Email",
    support: "Support",
  };
  return (Object.keys(labels) as Array<keyof ArtistConversionLinks>)
    .map((key) => ({ key, label: labels[key], url: String(links?.[key] || "").trim() }))
    .filter((item) => item.url);
}

export default function Artist() {
  const navigate = useNavigate();
  const { name } = useParams<{ name: string }>();
  const artistName = decodeURIComponent(name ?? "Artist");
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    apiGetArtistProfile(artistName)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch((err: unknown) => {
        if (alive) setError(getErrorMessage(err, "Could not load artist profile."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [artistName]);

  const monthlyListeners = profile?.found ? `${profile.tracks.length} Offtrack upload${profile.tracks.length === 1 ? "" : "s"}` : "56,641,342 monthly listeners";
  const conversionLinks = useMemo(() => conversionEntries(profile?.conversionLinks), [profile?.conversionLinks]);

  const tracks = useMemo<Track[]>(() => {
    if (profile?.tracks.length) {
      return profile.tracks.slice(0, 8).map((track) => ({
        title: track.title,
        plays: "Offtrack upload",
        length: msToClock(track.durationMs),
      }));
    }
    return [
      { title: "Skyfall", plays: "1,248,950,102", length: "4:46" },
      { title: "Set Fire to the Rain", plays: "2,217,921,513", length: "4:02" },
      { title: "Easy On Me", plays: "2,363,722,944", length: "3:44" },
      { title: "Someone Like You", plays: "2,505,287,559", length: "4:45" },
      { title: "Rolling in the Deep", plays: "2,301,812,895", length: "3:48" },
    ];
  }, [profile?.tracks]);

  const releases = useMemo<Release[]>(
    () =>
      profile?.tracks.length
        ? profile.tracks.slice(0, 4).map((track) => ({ title: track.title, subtitle: "Offtrack upload" }))
        : [
            { title: "30", subtitle: "2021 - Album" },
            { title: "21", subtitle: "2011 - Album" },
            { title: "25", subtitle: "2015 - Album" },
            { title: "19", subtitle: "2008 - Album" },
          ],
    [profile?.tracks]
  );

  const featuring = useMemo<Release[]>(
    () => [
      { title: `This Is ${artistName}`, subtitle: "Playlist" },
      { title: `${artistName} Radio`, subtitle: "Station" },
      { title: "Fresh Uploads", subtitle: "Discovery" },
      { title: "Artist Growth", subtitle: "Offtrack" },
    ],
    [artistName]
  );

  const publicBlocked = profile?.found && profile.publicProfile === false;

  return (
    <div className="min-h-[calc(100vh-var(--player-height))] w-full bg-[#FFFFFF] pb-44">
      <section className="mx-auto w-full max-w-[1303px] px-3 py-5 sm:px-7 sm:py-7">
        <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-2 rounded-[10px] bg-[#d0d0d0] px-3 py-2 font-bold">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-6">
          <p className="text-[16px] font-bold uppercase tracking-[0.08em] text-black/70">
            {profile?.found ? "Offtrack Artist" : "Verified Artist"}
          </p>
          <h1 className="mt-2 text-[42px] font-bold leading-none text-black sm:text-[56px]">{profile?.name || artistName}</h1>
          <p className="mt-3 text-[20px] font-bold leading-tight text-black/90">{loading ? "Loading artist profile" : monthlyListeners}</p>
          {error ? <p className="mt-3 rounded bg-white px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
          {publicBlocked ? <p className="mt-3 rounded bg-white px-3 py-2 text-sm font-bold text-black/60">This artist profile is currently private.</p> : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="inline-flex items-center gap-2 rounded-[10px] bg-black px-4 py-3 text-[18px] font-bold text-white">
              <Play className="h-5 w-5 fill-white text-white" />
              Play
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-[10px] bg-white px-4 py-3 text-[18px] font-bold text-black">
              <Shuffle className="h-5 w-5" />
              Shuffle
            </button>
            <button type="button" className="rounded-[10px] bg-white px-4 py-3 text-[18px] font-bold text-black">
              Follow
            </button>
          </div>

          {conversionLinks.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {conversionLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    const firstTrack = profile?.tracks[0];
                    if (firstTrack?.id) void apiFeedback(firstTrack.id, "artist_click", { sourcePage: "artist_profile", extra: { conversion: link.key } });
                  }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-white px-3 py-2 text-sm font-bold text-black"
                >
                  <ExternalLink className="h-4 w-4" />
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="text-[30px] font-bold leading-none text-black">Popular</h2>
            <div className="mt-4 space-y-2">
              {tracks.map((track, index) => (
                <div key={`${track.title}-${index}`} className="grid grid-cols-[34px_1fr_130px_55px] items-center gap-3 rounded-[10px] bg-white px-3 py-3">
                  <span className="text-[18px] font-bold text-black/60">{index + 1}</span>
                  <span className="truncate text-[18px] font-bold text-black">{track.title}</span>
                  <span className="text-right text-[15px] font-bold text-black/65">{track.plays}</span>
                  <span className="text-right text-[15px] font-bold text-black/65">{track.length}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
            <h2 className="text-[30px] font-bold leading-none text-black">About</h2>
            <div className="mt-4 rounded-[10px] bg-white p-4">
              <div className="grid h-[200px] w-full place-items-center rounded-[10px] bg-[#b9b9b9]">
                <Radio className="h-10 w-10 text-black/45" />
              </div>
              <p className="mt-4 text-[20px] font-bold leading-tight text-black">{monthlyListeners}</p>
              <p className="mt-2 text-[18px] font-bold leading-tight text-black/85">
                {profile?.found
                  ? "This profile is powered by Offtrack uploads and artist conversion settings."
                  : "Artist biography content goes here. Replace this block with the final copy from your data source."}
              </p>
            </div>
          </article>
        </div>

        <div className="mt-4 rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[30px] font-bold leading-none text-black">Featuring {artistName}</h2>
            <button className="text-[16px] font-bold uppercase tracking-[0.06em] text-black/70">Show all</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {featuring.map((item) => (
              <article key={item.title} className="rounded-[10px] bg-white p-3">
                <div className="grid aspect-square w-full place-items-center rounded-[10px] bg-[#b9b9b9]">
                  <Music2 className="h-8 w-8 text-black/45" />
                </div>
                <h3 className="mt-3 text-[18px] font-bold leading-tight text-black">{item.title}</h3>
                <p className="mt-1 text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">{item.subtitle}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[10px] bg-[#d0d0d0] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[30px] font-bold leading-none text-black">Discography</h2>
            <button className="text-[16px] font-bold uppercase tracking-[0.06em] text-black/70">Show all</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {releases.map((item) => (
              <article key={item.title} className="rounded-[10px] bg-white p-3">
                <div className="aspect-square w-full rounded-[10px] bg-[#b9b9b9]" />
                <h3 className="mt-3 text-[18px] font-bold leading-tight text-black">{item.title}</h3>
                <p className="mt-1 text-[14px] font-bold uppercase tracking-[0.08em] text-black/60">{item.subtitle}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
