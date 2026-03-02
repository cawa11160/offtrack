import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Home,
  Map,
  Music,
  PencilLine,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

type ArcSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

type NavItem = {
  id: string;
  name: string;
  icon: React.ReactNode;
  type: "page" | "label" | "playlist" | "action";
};

const pageItems: NavItem[] = [
  { id: "__pages__", name: "Pages", icon: <span />, type: "label" },
  { id: "home", name: "Home", icon: <Home className="h-4 w-4" />, type: "page" },
  { id: "recommendations", name: "Recommendations", icon: <Compass className="h-4 w-4" />, type: "page" },
  { id: "browse", name: "Browse", icon: <Search className="h-4 w-4" />, type: "page" },
  { id: "map", name: "Map", icon: <Map className="h-4 w-4" />, type: "page" },
  { id: "lyric-ai", name: "Lyric AI", icon: <PencilLine className="h-4 w-4" />, type: "page" },
  { id: "merch", name: "Merch", icon: <ShoppingBag className="h-4 w-4" />, type: "page" },
  { id: "profile", name: "Profile", icon: <User className="h-4 w-4" />, type: "page" },
  { id: "settings", name: "Settings", icon: <Settings className="h-4 w-4" />, type: "page" },
];

const defaultPlaylists = ["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"];

export const ARC_SIDEBAR_EXPANDED_WIDTH = 240;
export const ARC_SIDEBAR_COLLAPSED_WIDTH = 64;
export const ARC_SIDEBAR_LEFT_OFFSET = 80;
// The curved SVG protrudes beyond `ARC_SIDEBAR_EXPANDED_WIDTH`, so main content/player
// should reserve this full visual width to avoid overlap.
export const ARC_SIDEBAR_EXPANDED_VISUAL_WIDTH = 268;

export function ArcSidebar({ collapsed, onToggle }: ArcSidebarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [height, setHeight] = useState<number>(() =>
    typeof window === "undefined" ? 900 : window.innerHeight || 900
  );
  const [activeId, setActiveId] = useState("home");
  const [playlists, setPlaylists] = useState(defaultPlaylists);

  const navItems: NavItem[] = useMemo(
    () => [
      ...pageItems,
      { id: "__playlists__", name: "Playlists", icon: <span />, type: "label" },
      ...playlists.map((name, idx) => ({
        id: `playlist-${idx + 1}`,
        name,
        icon: <Music className="h-4 w-4" />,
        type: "playlist" as const,
      })),
      { id: "__add__", name: "New playlist", icon: <Plus className="h-4 w-4" />, type: "action" },
    ],
    [playlists]
  );

  useEffect(() => {
    const updateHeight = () => {
      setHeight(window.innerHeight);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  useEffect(() => {
    if (location.pathname === "/playlists") {
      const params = new URLSearchParams(location.search);
      const selectedPlaylist = params.get("playlist");
      setActiveId(selectedPlaylist ?? "playlist-1");
      return;
    }

    const routeToId: Record<string, string> = {
      "/": "home",
      "/recommendations": "recommendations",
      "/search": "browse",
      "/concerts": "map",
      "/lyric-ai": "lyric-ai",
      "/merch": "merch",
      "/profile": "profile",
      "/settings": "settings",
    };
    setActiveId(routeToId[location.pathname] ?? "");
  }, [location.pathname, location.search]);

  const geometry = useMemo(() => {
    const protrusion = 140;
    const halfH = height / 2;
    const cx = (protrusion * protrusion - halfH * halfH) / (2 * protrusion);
    const r = Math.sqrt(cx * cx + halfH * halfH);
    const thetaTop = Math.atan2(halfH, -cx);
    const span = 2 * thetaTop;
    const largeArc = span > Math.PI ? 1 : 0;
    const padding = 0.14;
    // Keep nav entries away from the very top/bottom so they don't clash with header/player.
    const usableSpan = span * (1 - 2 * padding) * 0.68;
    const startAngle = thetaTop - (span - usableSpan) / 2;
    return { protrusion, cx, r, largeArc, halfH, usableSpan, startAngle };
  }, [height]);

  const getPosition = (index: number, total: number) => {
    const { cx, r, halfH, startAngle, usableSpan } = geometry;
    const t = total === 1 ? 0.5 : index / (total - 1);
    const theta = startAngle - t * usableSpan;
    const arcX = cx + r * Math.cos(theta);
    const y = halfH - r * Math.sin(theta);
    return { arcX, y };
  };

  if (collapsed) {
    return (
      <>
        <div
          aria-hidden="true"
          className="fixed left-0 top-0 z-10 h-screen bg-black"
          style={{ width: ARC_SIDEBAR_LEFT_OFFSET }}
        />
        <aside
          ref={containerRef}
          className="fixed top-0 z-20 h-screen w-16 bg-black"
          style={{ left: ARC_SIDEBAR_LEFT_OFFSET }}
          aria-label="Collapsed sidebar"
        >
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white text-black"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </aside>
      </>
    );
  }

  const arcOffset = 100;
  const width = ARC_SIDEBAR_EXPANDED_WIDTH;
  const { protrusion, r, largeArc } = geometry;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed left-0 top-0 z-10 h-screen bg-black"
        style={{ width: ARC_SIDEBAR_LEFT_OFFSET }}
      />
      <aside
        ref={containerRef}
        className="fixed top-0 z-20 h-screen overflow-visible"
        style={{ width, left: ARC_SIDEBAR_LEFT_OFFSET }}
        aria-label="Navigation sidebar"
      >
      <svg
        className="pointer-events-none absolute top-0"
        style={{ left: arcOffset, width: protrusion + 20, height, overflow: "visible" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={`M 0 0 A ${r} ${r} 0 ${largeArc} 1 0 ${height} L 0 0 Z`} fill="black" />
        <path d={`M 0 0 A ${r} ${r} 0 ${largeArc} 1 0 ${height}`} fill="none" stroke="black" strokeWidth="2" />
      </svg>

      <div className="absolute left-0 top-0 bg-black" style={{ width: arcOffset, height }}>
        <div
          className="absolute left-0 top-1/2 h-[72px] w-[72px] -translate-y-1/2 rounded-full bg-white"
          style={{ transform: "translate(-65%, -50%)" }}
        />
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="absolute left-[72px] top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow"
        aria-label="Collapse sidebar"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {navItems.map((item, index) => {
        const { arcX, y } = getPosition(index, navItems.length);
        const inset = 12;
        const rightEdge = Math.max(112, arcX + arcOffset - inset);
        const isActive = (item.type === "page" || item.type === "playlist") && activeId === item.id;

        if (item.type === "label") {
          return (
            <div
              key={item.id}
              className="pointer-events-none absolute select-none"
              style={{
                right: `${width - rightEdge}px`,
                top: `${y}px`,
                transform: "translateY(-50%)",
              }}
            >
              <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
                {item.name}
              </span>
            </div>
          );
        }

        if (item.type === "action") {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setPlaylists((prev) => [...prev, `Playlist name ${prev.length + 1}`])}
              className="group absolute text-right"
              style={{
                right: `${width - rightEdge}px`,
                top: `${y}px`,
                transform: "translateY(-50%)",
              }}
            >
              <span className="flex items-center justify-end gap-2.5 whitespace-nowrap text-[14px] font-bold text-white transition-all duration-300 group-hover:text-white/80">
                <span className="transition-transform duration-300 group-hover:rotate-90">{item.icon}</span>
                <span>{item.name}</span>
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.type === "playlist") {
                setActiveId(item.id);
                navigate(`/playlists?playlist=${encodeURIComponent(item.id)}`);
                return;
              }

              const routeById: Record<string, string> = {
                home: "/",
                recommendations: "/recommendations",
                browse: "/search",
                map: "/concerts",
                "lyric-ai": "/lyric-ai",
                merch: "/merch",
                profile: "/profile",
                settings: "/settings",
              };
              const targetRoute = routeById[item.id];
              setActiveId(item.id);
              if (targetRoute) {
                navigate(targetRoute);
              }
            }}
            className="group absolute text-right"
            style={{
              right: `${width - rightEdge}px`,
              top: `${y}px`,
              transform: "translateY(-50%)",
            }}
          >
            <span
              className={`flex items-center justify-end gap-2.5 whitespace-nowrap text-[14px] font-bold transition-all duration-300 ${
                isActive ? "text-white" : "text-white group-hover:text-white/80"
              }`}
            >
              <span className={`transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}>
                {item.icon}
              </span>
              <span className="relative">
                {item.name}
                <span
                  className={`absolute -bottom-0.5 right-0 h-px bg-white transition-all duration-300 ${
                    isActive ? "w-full opacity-50" : "w-0 group-hover:w-full group-hover:opacity-30"
                  }`}
                />
              </span>
            </span>
          </button>
        );
      })}
      </aside>
    </>
  );
}
