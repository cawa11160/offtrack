import { useEffect, useRef, useState } from "react";
import { Bell, Search, User, Settings, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type HeaderProps = {
  onMenuClick?: () => void;
  onNotificationsClick?: () => void;
  notificationsOpen?: boolean;
};

export const Header = ({
  onMenuClick,
  onNotificationsClick,
  notificationsOpen,
}: HeaderProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  // Close on outside click + ESC
  useEffect(() => {
    if (!settingsOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  const go = (path: string) => {
    setSettingsOpen(false);
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
      <div className="h-16 px-4 lg:px-8 flex items-center gap-3">
        {/* Left controls (optional) */}
        <div className="flex items-center gap-2">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              className="lg:hidden h-9 w-9 rounded-md hover:bg-accent grid place-items-center"
              aria-label="Open menu"
            >
              <span className="sr-only">Menu</span>
              {/* Intentionally empty (no icon). Add lucide Menu icon if you want. */}
            </button>
          )}
        </div>

        {/* Search */}
        <div className="flex-1">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search artists, albums, or songs..."
              className={cn(
                "w-full h-11 pl-11 pr-4 rounded-full bg-secondary/60",
                "border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              )}
            />
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            className={cn(
              "relative h-11 w-11 rounded-full border border-border bg-card",
              "grid place-items-center hover:bg-accent transition-colors"
            )}
            aria-label="Notifications"
            aria-expanded={notificationsOpen ? "true" : "false"}
          >
            <Bell className="w-5 h-5" />
            {!notificationsOpen && (
              <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary border-2 border-background" />
            )}
          </button>

          {/* Settings dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={cn(
                "h-11 w-11 rounded-full border border-border bg-card grid place-items-center",
                "hover:bg-accent transition-colors",
                settingsOpen && "bg-accent"
              )}
              aria-label="Settings menu"
              aria-expanded={settingsOpen ? "true" : "false"}
              aria-haspopup="menu"
            >
              <Settings className="w-5 h-5" />
            </button>

            {settingsOpen && (
              <div
                role="menu"
                className={cn(
                  "absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-card shadow-2xl",
                  "overflow-hidden"
                )}
              >
                <div className="px-4 py-3 text-sm text-muted-foreground border-b border-border">
                  Account
                </div>

                {/* Account */}
                <button
                  role="menuitem"
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm hover:bg-accent flex items-center justify-between"
                  onClick={() => go("/account")}
                >
                  Account
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* Profile */}
                <button
                  role="menuitem"
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm hover:bg-accent"
                  onClick={() => go("/profile")}
                >
                  Profile
                </button>

                {/* Support (choose one option) */}
                <button
                  role="menuitem"
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm hover:bg-accent flex items-center justify-between"
                  onClick={() => {
                    setSettingsOpen(false);

                    // Option A: internal support page (only if you add a route)
                    // navigate("/support");

                    // Option B: keep external placeholder
                    window.open("https://example.com/support", "_blank", "noopener,noreferrer");
                  }}
                >
                  Support
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </button>

                <div className="h-px bg-border" />

                {/* Settings */}
                <button
                  role="menuitem"
                  type="button"
                  className="w-full px-4 py-3 text-left text-sm hover:bg-accent"
                  onClick={() => go("/settings")}
                >
                  Settings
                </button>
              </div>
            )}
          </div>

          {/* Profile icon (goes to profile page) */}
          <button
            type="button"
            className="h-11 w-11 rounded-full border border-border bg-card grid place-items-center hover:bg-accent transition-colors"
            aria-label="Profile"
            title="Profile"
            onClick={() => navigate("/profile")}
          >
            <User className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
