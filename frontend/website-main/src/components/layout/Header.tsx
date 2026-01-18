import { useEffect, useRef, useState } from "react";
import { Bell, Search, User, Settings } from "lucide-react";
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!profileMenuOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileMenuOpen(false);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

  const go = (path: string) => {
    setProfileMenuOpen(false);
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
      <div className="h-16 px-4 lg:px-8 flex items-center gap-3">

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
        <div className="flex items-center gap-3">

          {/* Notifications */}
          <button
            type="button"
            onClick={onNotificationsClick}
            className={cn(
              "relative h-11 w-11 rounded-full border border-border bg-card",
              "grid place-items-center hover:bg-accent transition-colors"
            )}
          >
            <Bell className="w-5 h-5" />
          </button>

          {/* Settings icon (direct navigation only) */}
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className={cn(
              "h-11 w-11 rounded-full border border-border bg-card grid place-items-center",
              "hover:bg-accent transition-colors"
            )}
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Profile with dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen((v) => !v)}
              className={cn(
                "h-11 w-11 rounded-full border border-border bg-card grid place-items-center",
                "hover:bg-accent transition-colors",
                profileMenuOpen && "bg-accent"
              )}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Profile menu"
            >
              <User className="w-5 h-5" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

                {/* ONLY PROFILE ITEM NOW */}
                <button
                  className="w-full px-4 py-3 text-left text-sm hover:bg-accent"
                  onClick={() => go("/profile")}
                  role="menuitem"
                >
                  Profile
                </button>

                {/* Optional logout if you want later */}
                {/*
                <div className="h-px bg-border" />
                <button
                  className="w-full px-4 py-3 text-left text-sm hover:bg-accent text-destructive"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    // logout()
                  }}
                  role="menuitem"
                >
                  Log out
                </button>
                */}
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
