import { ReactNode, useState } from "react";
import PinkPlayerBar from "@/components/PinkPlayerBar";
import { MobileNav } from "./MobileNav";
import { useLocation } from "react-router-dom";
import { currentTrack } from "@/data/mockData";
import {
  ArcSidebar,
  ARC_SIDEBAR_COLLAPSED_WIDTH,
  ARC_SIDEBAR_EXPANDED_VISUAL_WIDTH,
  ARC_SIDEBAR_LEFT_OFFSET,
} from "@/components/ArcSidebar";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const isProfilePage = location.pathname === "/profile";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarVisualWidth = sidebarCollapsed ? ARC_SIDEBAR_COLLAPSED_WIDTH : ARC_SIDEBAR_EXPANDED_VISUAL_WIDTH;
  const contentLeftInset = ARC_SIDEBAR_LEFT_OFFSET + sidebarVisualWidth + 12;
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
      <ArcSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
      <div className={isProfilePage ? "min-h-screen bg-[#FFFFFF]" : "min-h-screen"}>
        <main
          className={
            isProfilePage
              ? "pb-[calc(var(--player-height)+60px)] bg-[#FFFFFF]"
              : "pb-[calc(var(--player-height)+60px)]"
          }
          style={{
            paddingLeft: `${contentLeftInset}px`,
            transition: "padding-left 220ms ease",
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav only on phones */}
      <div className="md:hidden">
        <MobileNav />
      </div>

      <PinkPlayerBar currentSong={pinkPlayerSong} leftInset={contentLeftInset} />
    </div>
  );
};
