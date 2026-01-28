import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

type SidebarItem = { to: string; label: string; icon?: React.ReactNode };

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

/**
 * Places content on a circle with center (cx, cy) and radius r.
 * angleDeg: 0° is to the right, 90° is down (screen coords),
 * but we use standard math with +y down by flipping sin usage accordingly.
 *
 * Tangent rotation: angleDeg + 90 makes text follow the circle.
 */
function CurvedLabel({
  cx,
  cy,
  r,
  angleDeg,
  children,
  className = "",
  align = "left",
  active = false,
  asLink,
  title,
  onClick,
}: {
  cx: number;
  cy: number;
  r: number;
  angleDeg: number;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
  active?: boolean;
  asLink?: { to: string };
  title?: string;
  onClick?: () => void;
}) {
  // screen coordinates: x = cx + r*cos, y = cy + r*sin
  const a = degToRad(angleDeg);
  const x = cx + r * Math.cos(a);
  const y = cy + r * Math.sin(a);

  // Tangent rotation
  const rot = angleDeg + 90;

  const alignClass =
    align === "center" ? "-translate-x-1/2" : align === "right" ? "-translate-x-full" : "";

  const base = [
    "absolute select-none whitespace-nowrap",
    alignClass,
    "origin-left",
    "transition",
    active ? "bg-white/10" : "hover:bg-white/10",
    "rounded-full",
    "px-4 py-2",
    className,
  ].join(" ");

  const style: React.CSSProperties = {
    left: x,
    top: y,
    transform: `rotate(${rot}deg)`,
    // NOTE: we rotate the pill; inside text stays aligned.
  };

  const inner = (
    <div className={base} style={style} title={title} onClick={onClick}>
      {children}
    </div>
  );

  if (asLink) {
    return (
      <NavLink
        to={asLink.to}
        className="contents"
        // prevents NavLink default styling; we style the inner pill
      >
        {inner}
      </NavLink>
    );
  }

  return inner;
}

export function Sidebar({
  items,
  initialWidth = 360,
  minWidth = 96,
  maxWidth = 440,

  width: controlledWidth,
  collapsed,
  onCollapsedChange,
  onWidthChange,
}: SidebarProps) {
  const [uncontrolledWidth, setUncontrolledWidth] = useState<number>(initialWidth);
  const width = typeof controlledWidth === "number" ? controlledWidth : uncontrolledWidth;

  const isCollapsed = typeof collapsed === "boolean" ? collapsed : width <= minWidth;

  const navItems = useMemo(() => (items?.length ? items : []), [items]);

  const toggle = () => {
    const next = !isCollapsed;
    if (typeof collapsed === "boolean" && onCollapsedChange) {
      onCollapsedChange(next);
      return;
    }
    const nextW = next ? minWidth : initialWidth;
    setUncontrolledWidth(nextW);
    onWidthChange?.(nextW);
  };

  const setExpandedWidth = (next: number) => {
    const v = clamp(next, minWidth, maxWidth);
    setUncontrolledWidth(v);
    onWidthChange?.(v);
  };

  /**
   * Circle geometry:
   * We draw a big circle and place labels at angles on the visible arc.
   *
   * You can tune:
   * - circleRadius
   * - circleLeft (push further left to get a thinner arc)
   */
  const circleRadius = isCollapsed ? 520 : 620;
  const circleDiameter = circleRadius * 2;

  // Push the circle left so only a “semi-circle” is visible
  const circleLeft = isCollapsed ? -circleRadius + 36 : -circleRadius + 60;

  // Circle center in the sidebar coordinate space
  const cx = circleLeft + circleRadius;
  const cy = 0.5 * 1000; // we'll use a relative container height; actual uses 100vh below

  // We need cy in pixels. We'll compute using CSS: container is 100vh.
  // We'll instead position using percentages by measuring with CSS?
  // Simple approach: use a wrapper with height: 100vh and compute cy in JS via CSS variables is overkill.
  // So: place labels using top based on actual viewport height via CSS calc:
  // We do that by letting cy = "50vh" in CSS is not possible in JS geometry.
  //
  // Practical solution: use a positioning wrapper that sets a CSS var and uses translate.
  // We'll do a different approach: do the math in a "vh-like" space by assuming 1000px,
  // but keep the circle centered via translateY(-50%) so the arc stays centered.
  //
  // ✅ Easiest reliable: render a relative wrapper and absolutely position the circle at 50% with translateY.
  // Then compute label positions relative to that circle wrapper, not viewport.

  // Library list for the arc
  const playlists = ["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"];

  return (
    <aside className="relative h-screen w-full overflow-hidden" aria-label="Sidebar">
      {/* This wrapper defines our coordinate space */}
      <div className="relative h-full w-full">
        {/* Big circle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 bg-black"
          style={{
            width: circleDiameter,
            height: circleDiameter,
            borderRadius: 9999,
            left: circleLeft,
          }}
        />

        {/* Labels placed on the circle - we place them within another wrapper that shares the same circle positioning */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: circleLeft,
            width: circleDiameter,
            height: circleDiameter,
          }}
        >
          {/* Brand (slightly inside the arc) */}
          {!isCollapsed && (
            <CurvedLabel
              cx={circleRadius}
              cy={circleRadius}
              r={circleRadius - 90}
              angleDeg={210}
              className="text-2xl font-semibold tracking-tight bg-transparent hover:bg-transparent px-0 py-0"
              align="left"
            >
              Offtrack
            </CurvedLabel>
          )}

          {/* “Your library” header */}
          {!isCollapsed && (
            <CurvedLabel
              cx={circleRadius}
              cy={circleRadius}
              r={circleRadius - 120}
              angleDeg={235}
              className="text-lg font-semibold text-white/70 bg-transparent hover:bg-transparent px-0 py-0"
              align="left"
            >
              Your library
            </CurvedLabel>
          )}

          {/* Playlists along curve */}
          {!isCollapsed &&
            playlists.map((p, idx) => (
              <CurvedLabel
                key={p}
                cx={circleRadius}
                cy={circleRadius}
                r={circleRadius - 160}
                // spread them downward along the arc
                angleDeg={255 + idx * 14}
                className="text-2xl font-medium tracking-tight"
                align="left"
              >
                {p}
              </CurvedLabel>
            ))}

          {/* + New playlist */}
          {!isCollapsed && (
            <CurvedLabel
              cx={circleRadius}
              cy={circleRadius}
              r={circleRadius - 160}
              angleDeg={255 + playlists.length * 14 + 14}
              className="text-2xl font-medium tracking-tight"
              align="left"
              onClick={() => {
                // hook up later if needed
              }}
            >
              <span className="mr-3 text-3xl leading-none">+</span>
              New playlist
            </CurvedLabel>
          )}

          {/* Pages header */}
          {!isCollapsed && (
            <CurvedLabel
              cx={circleRadius}
              cy={circleRadius}
              r={circleRadius - 200}
              angleDeg={300}
              className="text-xl font-semibold text-white/70 bg-transparent hover:bg-transparent px-0 py-0"
              align="left"
            >
              Pages
            </CurvedLabel>
          )}

          {/* Pages links stacked along arc */}
          {!isCollapsed &&
            navItems.map((item, idx) => (
              <NavLink key={item.to} to={item.to} className="contents">
                {({ isActive }) => (
                  <CurvedLabel
                    cx={circleRadius}
                    cy={circleRadius}
                    r={circleRadius - 240}
                    angleDeg={315 + idx * 10}
                    className={[
                      "text-2xl font-medium tracking-tight",
                      isActive ? "bg-white/10" : "",
                    ].join(" ")}
                    align="left"
                    active={isActive}
                    asLink={{ to: item.to }}
                    title={item.label}
                  >
                    {item.label}
                  </CurvedLabel>
                )}
              </NavLink>
            ))}

          {/* Collapsed state: just show “Pages” dots on the arc */}
          {isCollapsed && (
            <>
              <CurvedLabel
                cx={circleRadius}
                cy={circleRadius}
                r={circleRadius - 210}
                angleDeg={300}
                className="text-white/70 text-base font-semibold bg-transparent hover:bg-transparent px-0 py-0"
                align="left"
              >
                Pages
              </CurvedLabel>

              {navItems.slice(0, 6).map((it, i) => (
                <CurvedLabel
                  key={it.to}
                  cx={circleRadius}
                  cy={circleRadius}
                  r={circleRadius - 250}
                  angleDeg={320 + i * 10}
                  className="text-white/80 text-xl bg-transparent hover:bg-transparent px-0 py-0"
                  align="left"
                  asLink={{ to: it.to }}
                  title={it.label}
                >
                  •
                </CurvedLabel>
              ))}
            </>
          )}
        </div>

        {/* Toggle circle on arc edge */}
        <button
          type="button"
          onClick={toggle}
          className={[
            "absolute top-1/2 -translate-y-1/2",
            "right-[-14px]",
            "h-10 w-10 rounded-full bg-black",
            "grid place-items-center",
            "shadow-[0_18px_55px_rgba(0,0,0,0.35)]",
            "border border-white/10",
            "hover:scale-[1.02] active:scale-[0.98] transition",
          ].join(" ")}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5 text-white" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-white" />
          )}
        </button>

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
      </div>
    </aside>
  );
}
