import { ReactNode, useState } from "react";
import { CircularSidebar } from "@/components/layout/CircularSidebar";
import { Header } from "./Header";
import { PlayerBar } from "./PlayerBar";
import { MobileNav } from "./MobileNav";
import { NotificationsDrawer } from "./NotificationsDrawer";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="hidden md:flex min-h-screen">
        <CircularSidebar />

        {/* Main content — offset by circular sidebar width */}
        <div className="flex-1 min-w-0 pl-0 ml-[140px] md:ml-[160px]">
          <Header
            onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            onNotificationsClick={() => setNotificationsOpen(true)}
            notificationsOpen={notificationsOpen}
          />

          <main className="pb-[calc(var(--player-height)+60px)] md:pb-player">
            <div className="mx-auto w-full max-w-[1200px] px-6 lg:px-10 py-6">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <Header
          onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          onNotificationsClick={() => setNotificationsOpen(true)}
          notificationsOpen={notificationsOpen}
        />
        <main className="pb-[calc(var(--player-height)+60px)]">
          <div className="mx-auto w-full max-w-[1200px] px-4 py-5">{children}</div>
        </main>
      </div>

      <div className="md:hidden">
        <MobileNav />
      </div>

      <PlayerBar />

      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
};
