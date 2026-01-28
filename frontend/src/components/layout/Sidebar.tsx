import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Music2 } from "lucide-react";

type SidebarItem = { to: string; label: string; icon: React.ReactNode };

type SidebarProps = {
  items?: SidebarItem[];
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;

  width?: number;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  onWidthChange?: (next: number) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = degToRad(angleDeg);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * Places an element on a circle arc in SIDEBAR coordinate space,
 * then rotates it tangentially so it “follows” the curve.
 */
function ArcItem({
  cx,
  cy,
  r,
  angleDeg,
  children,
  className = "",
  active = false,
  title,
  onClick,
}: {
  cx: number;
  cy: number;
  r: number;
  angleDeg: number;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const { x, y } = polar(cx, cy, r, angleDeg);
  const rot = angleDeg + 90;

  return (
    <div
      className={[
        "absolute whitespace-nowrap select-none",
        "origin-left",
        "rounded-full px-4 py-2",
        "text-white transition",
        active ? "bg-white/10" : "hover:bg-white/10",
        className,
      ].join(" ")}
      style={{
        left: x,
        top: y,
        transform: `rotate(${rot}deg)`,
      }}
      title={title}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function Sidebar({
  items,
  initialWidth = 280,
  minWidth = 88,
  maxWidth = 360,

  width: controlledWidth,
  collapsed,
  onCollapsedChange,
  onWidthChange,
}: SidebarProps) {
  const navigate = useNavigate();

  const [uncontrolledWidth, setUncontrolledWidth] = useState<number>(initialWidth);
  const width = typeof controlledWidth === "number" ? controlledWidth : uncontrolledWidth;

  const isCollapsed = typeof collapsed === "boolean" ? collapsed : width <= minWidth;

  const navItems = useMemo(() => (items?.length ? items : []), [items]);

  // ✅ We need viewport height to place items along the arc reliably
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggle = () => {
    const nextCollapsed = !isCollapsed;

    if (typeof collapsed === "boolean" && onCollapsedChange) {
      onCollapsedChange(nextCollapsed);
    } else {
      const nextWidth = nextCollapsed ? minWidth : initialWidth;
      setUncontrolledWidth(nextWidth);
      onWidthChange?.(nextWidth);
    }
  };

  const setExpandedWidth = (next: number) => {
    const v = clamp(next, minWidth, maxWidth);
    setUncontrolledWidth(v);
    onWidthChange?.(v);
  };

  /**
   * ✅ Bigger circle + correct center placement
   *
   * Place circle center OUTSIDE the sidebar to the left,
   * so the visible right edge becomes the arc.
   *
   * TUNE:
   * - radius: bigger = less aggressive curve + more room
   * - cx: negative pushes center left
   * - rText: where the text sits on the arc
   */
  const radius = isCollapsed ? 650 : 820; // ✅ BIGGER
  const cy = vh / 2;

  // Center is outside left edge; inset controls how “thick” the arc slice appears
  const inset = isCollapsed ? 30 : 60;
  const cx = -radius + inset;

  const rText = isCollapsed ? radius - 170 : radius - 230;

  // Angles (0° right, 90° down)
  const angleBrand = 215;
  const angleLibHeader = 238;
  const anglePlaylistsStart = 258;
  const anglePlaylistsStep = 14;

  const anglePagesHeader = 302;
  const anglePagesStart = 318;
  const anglePagesStep = 10;

  const playlists = ["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"];

  return (
    <aside className="relative h-screen w-full" aria-label="Sidebar">
      <div className="relative h-full w-full">
        {/* ✅ Circle layer is clipped */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute bg-black"
            style={{
              width: radius * 2,
              height: radius * 2,
              left: cx - radius,
              top: cy - radius,
              borderRadius: 9999,
              boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
            }}
          />
        </div>

        {/* ✅ Labels layer is NOT clipped so text stays visible */}
        <div className="absolute inset-0 overflow-visible pointer-events-none">
          {/* Brand */}
          {!isCollapsed && (
            <ArcItem
              cx={cx}
              cy={cy}
              r={rText}
              angleDeg={angleBrand}
              className="pointer-events-auto bg-transparent hover:bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight"
            >
              <span className="inline-flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10">
                  <Music2 className="h-5 w-5 text-white" />
                </span>
                Offtrack
              </span>
            </ArcItem>
          )}

          {/* Your library header */}
          {!isCollapsed && (
            <ArcItem
              cx={cx}
              cy={cy}
              r={rText}
              angleDeg={angleLibHeader}
              className="pointer-events-none bg-transparent hover:bg-transparent px-0 py-0 text-lg font-semibold text-white/70"
            >
              Your library
            </ArcItem>
          )}

          {/* Playlists */}
          {!isCollapsed &&
            playlists.map((name, idx) => (
              <ArcItem
                key={name}
                cx={cx}
                cy={cy}
                r={rText}
                angleDeg={anglePlaylistsStart + idx * anglePlaylistsStep}
                className="pointer-events-auto text-2xl font-medium tracking-tight"
                title={name}
              >
                {name}
              </ArcItem>
            ))}

          {/* New playlist */}
          {!isCollapsed && (
            <ArcItem
              cx={cx}
              cy={cy}
              r={rText}
              angleDeg={anglePlaylistsStart + playlists.length * anglePlaylistsStep + 14}
              className="pointer-events-auto text-2xl font-medium tracking-tight"
              onClick={() => navigate("/playlists")}
              title="New playlist"
            >
              <span className="mr-3 text-3xl leading-none">+</span>
              New playlist
            </ArcItem>
          )}

          {/* Pages header */}
          {!isCollapsed && (
            <ArcItem
              cx={cx}
              cy={cy}
              r={rText - 50}
              angleDeg={anglePagesHeader}
              className="pointer-events-none bg-transparent hover:bg-transparent px-0 py-0 text-xl font-semibold text-white/70"
            >
              Pages
            </ArcItem>
          )}

          {/* Pages items */}
          {!isCollapsed &&
            navItems.map((item, idx) => (
              <NavLink key={item.to} to={item.to} className="contents">
                {({ isActive }) => (
                  <ArcItem
                    cx={cx}
                    cy={cy}
                    r={rText - 85}
                    angleDeg={anglePagesStart + idx * anglePagesStep}
                    className="pointer-events-auto text-2xl font-medium tracking-tight"
                    active={isActive}
                    title={item.label}
                  >
                    {item.label}
                  </ArcItem>
                )}
              </NavLink>
            ))}
        </div>

        {/* Resize strip (optional) */}
        {!isCollapsed && (
          <div
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = width;

              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                setExpandedWidth(startW + dx);
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };

              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            aria-hidden="true"
          />
        )}

        {/* Toggle circle */}
        <button
          type="button"
          onClick={toggle}
          className={[
            "absolute top-1/2 -translate-y-1/2 right-[-14px]",
            "h-10 w-10 rounded-full bg-black",
            "shadow-[0_18px_55px_rgba(0,0,0,0.35)]",
            "grid place-items-center",
            "hover:scale-[1.03] active:scale-[0.98] transition",
            "border border-white/10",
          ].join(" ")}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <ChevronRight
            className={["h-5 w-5 text-white", isCollapsed ? "" : "rotate-180"].join(" ")}
          />
        </button>
      </div>
    </aside>
  );
}
