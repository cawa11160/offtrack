import { useEffect, useRef, useState } from "react";
import { Search, User, Settings, Music2 } from "lucide-react";
import { Link } from "react-router-dom";
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
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 lg:px-8">
        {/* Logo + Offtrack */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-foreground no-underline"
        >
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-foreground/10">
            <Music2 className="h-5 w-5 text-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Offtrack</span>
        </Link>

        {/* Search — centered */}
        <div className="flex flex-1 justify-center">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Enter your search..."
              className={cn(
                "h-11 w-full rounded-full border border-border bg-muted/50 pl-11 pr-4",
                "placeholder:text-muted-foreground",
                "focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-foreground/10"
              )}
            />
          </div>
        </div>

        {/* User + Settings */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen((v) => !v)}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full border border-border bg-background",
                "hover:bg-muted transition-colors",
                profileMenuOpen && "bg-muted"
              )}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Profile menu"
            >
              <User className="h-5 w-5 text-foreground" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <button
                  className="w-full px-4 py-3 text-left text-sm hover:bg-muted"
                  onClick={() => go("/profile")}
                  role="menuitem"
                >
                  Profile
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background hover:bg-muted transition-colors"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5 text-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
};
