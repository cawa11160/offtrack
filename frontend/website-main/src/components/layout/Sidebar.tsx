import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Library,
  Map,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Plus,
  Music2,
  ListMusic,
  Search,
} from "lucide-react";

type SidebarItem = { to: string; label: string; icon: React.ReactNode };

type SidebarProps = {
  items?: SidebarItem[];
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;

  // NEW: allow Layout to control collapse/width (optional)
  width?: number;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  onWidthChange?: (next: number) => void;
};

function inferRoute(label: string): string {
  const key = label.trim().toLowerCase();
  if (key === "home") return "/";
  if (key === "search") return "/search";
  if (key === "library") return "/library";
  if (key === "playlists") return "/playlists";
  if (key === "concert map" || key === "concertmap") return "/concert-map";
  if (key === "merchandise" || key === "merch") return "/merch";
  return `/${key.replace(/\s+/g, "-")}`;
}

export function Sidebar({
  items,
  initialWidth = 240,
  minWidth = 86,
  maxWidth = 360,

  width: controlledWidth,
  collapsed,
  onCollapsedChange,
  onWidthChange,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // If Layout passes width, keep an internal mirror so the resize handle works smoothly.
  const [uncontrolledWidth, setUncontrolledWidth] = useState<number>(initialWidth);
  const width = typeof controlledWidth === "number" ? controlledWidth : uncontrolledWidth;

  const [isResizing, setIsResizing] = useState<boolean>(false);

  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(initialWidth);

  const isCompact = collapsed ?? width <= 100;

  const fallbackNav: SidebarItem[] = [
    {
      to: "/",
      label: "Home",
      icon: <Home className="text-black" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/search",
      label: "Search",
      icon: <Search className="text-black" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/library",
      label: "Library",
      icon: <Library className="text-black" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/playlists",
      label: "Playlists",
      icon: <ListMusic className="text-black" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/concert-map",
      label: "Concert Map",
      icon: <Map className="text-black" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/merch",
      label: "Merchandise",
      icon: <ShoppingBag className="text-black" size={22} strokeWidth={1.8} />,
    },
  ];

  const navItems = useMemo(() => {
    if (items && items.length) {
      return items.map((it) => ({
        ...it,
        to: it.to ?? inferRoute(it.label),
      }));
    }
    return fallbackNav;
  }, [items]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isResizing) return;
      const dx = e.clientX - startXRef.current;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + dx));
      setUncontrolledWidth(next);
      onWidthChange?.(next);
    }
    function onUp() {
      setIsResizing(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, minWidth, maxWidth, onWidthChange]);

  const startResize = (e: React.MouseEvent) => {
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  };

  const toggleCompact = () => {
    // If parent is controlling collapse, delegate
    if (typeof collapsed === "boolean" && onCollapsedChange) {
      onCollapsedChange(!collapsed);
      return;
    }

    // Otherwise fallback to local width-based compact mode
    const next = width <= 100 ? initialWidth : minWidth;
    setUncontrolledWidth(next);
    onWidthChange?.(next);
  };

  return (
    <div
      className="relative h-screen border-r border-black/10 bg-white"
      style={{ width: "100%" }} // parent wrapper controls actual width
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        {!isCompact ? (
          <div className="text-xl font-semibold text-black">OffTrack</div>
        ) : (
          <div className="h-6" />
        )}

        <button
          type="button"
          onClick={toggleCompact}
          className="grid h-9 w-9 place-items-center rounded-xl border border-black/10 bg-white text-black hover:bg-black/5"
          aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCompact ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Main Nav */}
      <nav className="px-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-2xl px-3 py-2",
                    "text-black hover:bg-black/5",
                    isActive ? "bg-black/5" : "",
                  ].join(" ")
                }
              >
                <div className="shrink-0">{item.icon}</div>
                {!isCompact && <div className="text-base">{item.label}</div>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Library Section */}
      <div className="mt-6 px-4">
        <div className="flex items-center justify-between">
          {!isCompact ? (
            <div className="text-xs font-semibold tracking-[0.18em] text-black/40">
              YOUR LIBRARY
            </div>
          ) : (
            <div className="h-4" />
          )}

          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white text-black hover:bg-black/5 active:scale-[0.98]"
            aria-label="Create playlist"
            title="Create playlist"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className={[
              "flex w-full items-center gap-3 rounded-2xl border border-black/10",
              "bg-white px-4 py-4 text-left hover:bg-black/5 active:scale-[0.995]",
            ].join(" ")}
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-black/5">
              <Music2 size={18} className="text-black" />
            </div>

            {!isCompact && (
              <div>
                <div className="text-base font-semibold text-black">Create a playlist</div>
                <div className="text-sm text-black/50">Add songs and episodes</div>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent"
        aria-hidden="true"
      />
    </div>
  );
}
