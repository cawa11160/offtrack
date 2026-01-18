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

  // Track the sidebar width (draggable)
  const [sidebarWidth, setSidebarWidth] = useState<number>(280);

  // Track collapsed state (chevron button)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Notifications drawer
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { label: "Home", to: "/", icon: <Home className="h-5 w-5 text-black" /> },
      {
        label: "Search",
        to: "/search",
        icon: <Search className="h-5 w-5 text-black" />,
      },
      { label: "Concerts", to: "/concerts", icon: <Map className="h-5 w-5 text-black" /> },
      { label: "Library", to: "/liked", icon: <Library className="h-5 w-5 text-black" /> },
      { label: "Merch", to: "/merch", icon: <ShoppingBag className="h-5 w-5 text-black" /> },
      { label: "Recommendations", to: "/recommendations", icon: <Sparkles className="h-5 w-5 text-black" /> },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop / tablet layout (keep sidebar from md and up) */}
      <div className="hidden md:flex min-h-screen">
        {/* Sidebar */}
        <div className="shrink-0" style={{ width: sidebarCollapsed ? 88 : sidebarWidth }}>
          <Sidebar
            items={navItems}
            initialWidth={280}
            width={sidebarWidth}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            onWidthChange={(w) => setSidebarWidth(w)}
            minWidth={88}
            maxWidth={360}
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
            {children}
          </main>
        </div>
      </div>

      {/* Mobile layout (phones only) */}
      <div className="md:hidden">
        <Header
          onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          onNotificationsClick={() => setNotificationsOpen(true)}
          notificationsOpen={notificationsOpen}
        />
        <main className="pb-[calc(var(--player-height)+60px)]">{children}</main>
      </div>

      {/* Mobile bottom nav only on phones */}
      <div className="md:hidden">
        <MobileNav />
      </div>

      <PlayerBar />

      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
};
