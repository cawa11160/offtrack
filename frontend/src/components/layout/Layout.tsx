import { ReactNode } from "react";
import PinkPlayerBar from "@/components/PinkPlayerBar";
import { MobileNav } from "./MobileNav";
import { useLocation } from "react-router-dom";
import { currentTrack } from "@/data/mockData";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const isProfilePage = location.pathname === "/profile";
  const [minStr = "0", secStr = "0"] = currentTrack.duration.split(":");
  const durationSeconds = Number(minStr) * 60 + Number(secStr);
  const pinkPlayerSong = {
    title: currentTrack.title,
    artist: currentTrack.artist,
    coverUrl: currentTrack.coverUrl,
    duration: Number.isFinite(durationSeconds) ? durationSeconds : 0,
  };

  return (
    <div className={isProfilePage ? "min-h-screen bg-[#FFFFFF]" : "min-h-screen bg-background"}>
      <div className={isProfilePage ? "min-h-screen bg-[#FFFFFF]" : "min-h-screen"}>
        <main
          className={
            isProfilePage
              ? "pb-[calc(var(--player-height)+60px)] bg-[#FFFFFF]"
              : "pb-[calc(var(--player-height)+60px)]"
          }
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav only on phones */}
      <div className="md:hidden">
        <MobileNav />
      </div>

      <PinkPlayerBar currentSong={pinkPlayerSong} />
    </div>
  );
};
