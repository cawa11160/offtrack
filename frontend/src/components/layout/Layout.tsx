import { ReactNode, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { PlayerBar } from "./PlayerBar";
import { MobileNav } from "./MobileNav";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { Sparkles, Home, Library, Map, ShoppingBag, Search } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sidebar width + collapsed
  const [sidebarWidth, setSidebarWidth] = useState<number>(300);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { label: "Home", to: "/", icon: <Home className="h-5 w-5 text-white" /> },
      { label: "Search", to: "/search", icon: <Search className="h-5 w-5 text-white" /> },
      { label: "Concerts", to: "/concerts", icon: <Map className="h-5 w-5 text-white" /> },
      { label: "Library", to: "/liked", icon: <Library className="h-5 w-5 text-white" /> },
      { label: "Merch", to: "/merch", icon: <ShoppingBag className="h-5 w-5 text-white" /> },
      {
        label: "Recommendations",
        to: "/recommendations",
        icon: <Sparkles className="h-5 w-5 text-white" />,
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="hidden md:flex min-h-screen">
        {/* Sidebar */}
        <div className="shrink-0" style={{ width: sidebarCollapsed ? 96 : sidebarWidth }}>
          <Sidebar
            items={navItems}
            initialWidth={300}
            width={sidebarWidth}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            onWidthChange={(w) => setSidebarWidth(w)}
            minWidth={96}
            maxWidth={380}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
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
