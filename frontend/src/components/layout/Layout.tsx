import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import PinkPlayerBar from "@/components/PinkPlayerBar";
import { MobileNav } from "./MobileNav";
import { useLocation } from "react-router-dom";
import { currentTrack } from "@/data/mockData";
import { useAuth } from "@/lib/auth";
import { apiListNotifications } from "@/lib/api";
import { NotificationsDrawer } from "./NotificationsDrawer";
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
  const { user } = useAuth();
  const isProfilePage = location.pathname === "/profile" || location.pathname.startsWith("/profile/");
  const isAuthRoute = ["/login", "/signin", "/signup", "/sign-up", "/register", "/account"].includes(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
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

  useEffect(() => {
    if (isAuthRoute || !user) return;
    let mounted = true;
    apiListNotifications(1)
      .then((data) => {
        if (mounted) setUnreadNotifications(data.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [isAuthRoute, user]);

  return (
    <div className={isProfilePage ? "min-h-screen bg-[#FFFFFF]" : "min-h-screen bg-background"}>
      {!isAuthRoute ? (
        <div className="hidden md:block">
          <ArcSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
        </div>
      ) : null}
      {!isAuthRoute && user ? (
        <>
          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className="fixed right-4 top-4 z-[85] grid h-10 w-10 place-items-center rounded-md border border-black/10 bg-white text-black shadow-sm transition hover:bg-black/5 md:right-5"
            aria-label="Open notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-black px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            ) : null}
          </button>
          <NotificationsDrawer
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            onUnreadChange={setUnreadNotifications}
          />
        </>
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
