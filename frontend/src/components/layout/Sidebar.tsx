import React, { useMemo, useState } from "react";
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

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const a = degToRad(angleDeg);
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

/**
 * Places a "pill" on a circle and rotates it tangentially.
 * - angleDeg: 0° points right, 90° points down (screen coords)
 * - tangent rotation is angleDeg + 90
 */
function ArcItem({
  cx,
  cy,
  r,
  angleDeg,
  children,
  className,
  active = false,
  onClick,
  title,
}: {
  cx: number;
  cy: number;
  r: number;
  angleDeg: number;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const { x, y } = polarToXY(cx, cy, r, angleDeg);
  const rot = angleDeg + 90;

  return (
    <div
      className={[
        "absolute",
        "origin-left",
        "rounded-full",
        "px-4 py-2",
        "text-white",
        "transition",
        active ? "bg-white/10" : "hover:bg-white/10",
        className ?? "",
      ].join(" ")}
      style={{
        left: x,
        top: y,
        transform: `rotate(${rot}deg)`,
      }}
      onClick={onClick}
      title={title}
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

  const navItems = useMemo(() => {
    return (items?.length ? items : []).map((it) => ({
      ...it,
      to: it.to,
    }));
  }, [items]);

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
   * ✅ Bigger circle so labels are visible + easier to place on arc
   * Tune these 3 knobs to match your screenshot:
   * - radius (bigger = more gentle curve)
   * - leftShift (more negative = circle moves left, thinner visible slice)
   * - rText (distance from center to text)
   */
  const radius = isCollapsed ? 520 : 680; // BIGGER than before
  const diameter = radius * 2;
  const leftShift = isCollapsed ? -radius + 40 : -radius + 70; // pushes circle off-screen
  const rText = isCollapsed ? radius - 140 : radius - 190; // where text sits on arc

  // angles to lay out items down the arc (increase spacing by adding more degrees)
  const angleBrand = 210;
  const angleLibraryHeader = 235;
  const anglePlaylistsStart = 255;
  const anglePlaylistsStep = 14;
  const anglePagesHeader = 300;
  const anglePagesStart = 315;
  const anglePagesStep = 10;

  const playlists = ["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"];

  return (
    <aside className="relative h-screen" aria-label="Sidebar">
      <div className="relative h-full w-full overflow-hidden">
        {/* ✅ Real big circle (semi-circle look) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 bg-black"
          style={{
            width: diameter,
            height: diameter,
            left: leftShift,
            borderRadius: 9999,
            boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
          }}
        />

        {/* ✅ Arc-coordinate layer (same position/size as circle) */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: leftShift,
            width: diameter,
            height: diameter,
          }}
        >
          {/* center of circle in this layer is (radius, radius) */}
          {!isCollapsed && (
            <ArcItem
              cx={radius}
              cy={radius}
              r={rText}
              angleDeg={angleBrand}
              className="bg-transparent hover:bg-transparent px-0 py-0 text-2xl font-semibold tracking-tight"
            >
              <span className="inline-flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10">
                  <Music2 className="h-5 w-5 text-white" />
                </span>
                Offtrack
              </span>
            </ArcItem>
          )}

          {/* Library header */}
          {!isCollapsed && (
            <ArcItem
              cx={radius}
              cy={radius}
              r={rText}
              angleDeg={angleLibraryHeader}
              className="bg-transparent hover:bg-transparent px-0 py-0 text-lg font-semibold text-white/70"
            >
              Your library
            </ArcItem>
          )}

          {/* Playlists */}
          {!isCollapsed &&
            playlists.map((name, idx) => (
              <ArcItem
                key={name}
                cx={radius}
                cy={radius}
                r={rText}
                angleDeg={anglePlaylistsStart + idx * anglePlaylistsStep}
                className="text-2xl font-medium tracking-tight"
                title={name}
              >
                {name}
              </ArcItem>
            ))}

          {/* New playlist */}
          {!isCollapsed && (
            <ArcItem
              cx={radius}
              cy={radius}
              r={rText}
              angleDeg={anglePlaylistsStart + playlists.length * anglePlaylistsStep + 14}
              className="text-2xl font-medium tracking-tight"
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
              cx={radius}
              cy={radius}
              r={rText - 40}
              angleDeg={anglePagesHeader}
              className="bg-transparent hover:bg-transparent px-0 py-0 text-xl font-semibold text-white/70"
            >
              Pages
            </ArcItem>
          )}

          {/* Pages list (curved) */}
          {!isCollapsed &&
            navItems.map((item, idx) => (
              <NavLink key={item.to} to={item.to} className="contents">
                {({ isActive }) => (
                  <ArcItem
                    cx={radius}
                    cy={radius}
                    r={rText - 70}
                    angleDeg={anglePagesStart + idx * anglePagesStep}
                    className="text-2xl font-medium tracking-tight"
                    active={isActive}
                    title={item.label}
                  >
                    {item.label}
                  </ArcItem>
                )}
              </NavLink>
            ))}

          {/* Collapsed: show dots along arc */}
          {isCollapsed && (
            <>
              <ArcItem
                cx={radius}
                cy={radius}
                r={rText - 40}
                angleDeg={anglePagesHeader}
                className="bg-transparent hover:bg-transparent px-0 py-0 text-base font-semibold text-white/70"
              >
                Pages
              </ArcItem>

              {navItems.slice(0, 6).map((it, i) => (
                <NavLink key={it.to} to={it.to} className="contents">
                  {({ isActive }) => (
                    <ArcItem
                      cx={radius}
                      cy={radius}
                      r={rText - 70}
                      angleDeg={anglePagesStart + i * 10}
                      className="bg-transparent hover:bg-transparent px-0 py-0 text-2xl"
                      active={isActive}
                      title={it.label}
                    >
                      •
                    </ArcItem>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </div>

        {/* Optional resize handle (expanded only) */}
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

        {/* Toggle button on edge */}
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
