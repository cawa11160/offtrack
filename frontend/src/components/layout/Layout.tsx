import { CSSProperties, ReactNode, useMemo, useState } from "react";
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
  const isProfilePage = location.pathname === "/profile" || location.pathname.startsWith("/profile/");
  const isAuthRoute = ["/login", "/signin", "/signup", "/sign-up", "/register", "/account"].includes(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarVisualWidth = sidebarCollapsed ? ARC_SIDEBAR_COLLAPSED_WIDTH : ARC_SIDEBAR_EXPANDED_VISUAL_WIDTH;
  const contentLeftInset = ARC_SIDEBAR_LEFT_OFFSET + sidebarVisualWidth + 12;
  const pinkPlayerSong = useMemo(() => {
    const [minStr = "0", secStr = "0"] = currentTrack.duration.split(":");
    const durationSeconds = Number(minStr) * 60 + Number(secStr);
    return {
      title: currentTrack.title,
      artist: currentTrack.artist,
      coverUrl: currentTrack.coverUrl,
      duration: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    };
  }, []);

  return (
    <div className={isProfilePage ? "min-h-screen bg-[#FFFFFF]" : "min-h-screen bg-background"}>
      {!isAuthRoute ? (
        <div className="hidden md:block">
          <ArcSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
        </div>
      ) : null}
      <div className={isProfilePage ? "min-h-screen bg-[#FFFFFF]" : "min-h-screen"}>
        <main
          className={
            isProfilePage
              ? "bg-[#FFFFFF] pb-[calc(var(--player-height)+92px)] md:pb-[calc(var(--player-height)+60px)] md:pl-[var(--content-left-inset)]"
              : "pb-[calc(var(--player-height)+92px)] md:pb-[calc(var(--player-height)+60px)] md:pl-[var(--content-left-inset)]"
          }
          style={{
            "--content-left-inset": isAuthRoute ? "0px" : `${contentLeftInset}px`,
            transition: "padding-left 220ms ease",
          } as CSSProperties & Record<string, string>}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav only on phones */}
      {!isAuthRoute ? (
        <div className="md:hidden">
          <MobileNav />
        </div>
      ) : null}

      {!isAuthRoute ? <PinkPlayerBar currentSong={pinkPlayerSong} leftInset={contentLeftInset} /> : null}
    </div>
  );
};
