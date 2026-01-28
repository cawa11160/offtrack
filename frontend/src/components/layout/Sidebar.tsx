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
      icon: <Home className="text-white" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/search",
      label: "Search",
      icon: <Search className="text-white" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/library",
      label: "Library",
      icon: <Library className="text-white" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/playlists",
      label: "Playlists",
      icon: <ListMusic className="text-white" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/concert-map",
      label: "Concert Map",
      icon: <Map className="text-white" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/merch",
      label: "Merchandise",
      icon: <ShoppingBag className="text-white" size={22} strokeWidth={1.8} />,
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

  // Menu items for the curved path
  const menuItems = [
    "Your library",
    "Playlist name 1",
    "Playlist name 2", 
    "Playlist name 3",
    "Playlist name 4",
    "+ New playlist",
    "Pages",
    "Home",
    "Recommendations",
    "Browse",
    "Map",
    "Merch",
    "Profile",
    "Settings"
  ];

  return (
    <div
      className="relative h-screen bg-transparent overflow-hidden"
      style={{ width: "100%" }}
    >
      {/* Semi-circle shape with black background */}
      <div 
        className="absolute left-0 top-0 h-full bg-black"
        style={{
          width: '260px',
          clipPath: 'ellipse(130% 50% at 0% 50%)',
        }}
      >
        {/* Curved text path */}
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 260 900"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <path
              id="curve"
              d="M 20,450 Q 120,450 180,150 Q 200,50 220,0"
              fill="none"
              stroke="none"
            />
            <path
              id="curve2"
              d="M 20,450 Q 120,450 180,750 Q 200,850 220,900"
              fill="none"
              stroke="none"
            />
          </defs>
          
          {/* Upper curved text */}
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve" startOffset="5%">
              <tspan dy="-10">Your library</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="14" fontWeight="400">
            <textPath href="#curve" startOffset="15%">
              <tspan dy="-5">Playlist name 1</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="14" fontWeight="400">
            <textPath href="#curve" startOffset="25%">
              <tspan dy="0">Playlist name 2</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="14" fontWeight="400">
            <textPath href="#curve" startOffset="35%">
              <tspan dy="5">Playlist name 3</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="14" fontWeight="400">
            <textPath href="#curve" startOffset="45%">
              <tspan dy="10">Playlist name 4</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="14" fontWeight="400">
            <textPath href="#curve" startOffset="55%">
              <tspan dy="15">+ New playlist</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans text-lg" fontSize="18" fontWeight="600">
            <textPath href="#curve" startOffset="68%">
              <tspan dy="20">Pages</tspan>
            </textPath>
          </text>
          
          {/* Lower curved text */}
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="68%">
              <tspan dy="20">Home</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="55%">
              <tspan dy="15">Recommendations</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="45%">
              <tspan dy="10">Browse</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="35%">
              <tspan dy="5">Map</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="25%">
              <tspan dy="0">Merch</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="15%">
              <tspan dy="-5">Profile</tspan>
            </textPath>
          </text>
          
          <text className="fill-white font-sans" fontSize="16" fontWeight="500">
            <textPath href="#curve2" startOffset="5%">
              <tspan dy="-10">Settings</tspan>
            </textPath>
          </text>
        </svg>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-black/20"
        aria-hidden="true"
      />
    </div>
  );
}