import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  Library,
  Map,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Plus,
  Music2,
} from "lucide-react";

export type SidebarItem = {
  label: string;
  icon: React.ReactNode;

  /**
   * Optional route path. If not provided, we'll infer it from `label`.
   * (So your current Layout items {label, icon} still work.)
   */
  to?: string;
};

export type SidebarProps = {
  items?: SidebarItem[];

  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;

  /** Controlled collapsed state (optional) */
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;

  /** Parent can persist width (optional) */
  onWidthChange?: (width: number) => void;
};

function inferRoute(label: string): string {
  const key = label.trim().toLowerCase();
  if (key === "home") return "/";
  if (key === "library") return "/library";
  if (key === "concert map" || key === "concertmap") return "/concert-map";
  if (key === "merchandise" || key === "merch") return "/merch";
  // fallback: "/<kebab-case>"
  return `/${key.replace(/\s+/g, "-")}`;
}

export function Sidebar({
  items,
  initialWidth = 280,
  minWidth = 88,
  maxWidth = 360,
  collapsed,
  onCollapsedChange,
  onWidthChange,
}: SidebarProps) {
  const location = useLocation();

  // Width is always internal; we notify parent via onWidthChange
  const [width, setWidth] = useState(initialWidth);

  // Support controlled OR uncontrolled collapsed state
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false);
  const isCollapsed = collapsed ?? uncontrolledCollapsed;

  const setCollapsed = (next: boolean) => {
    if (onCollapsedChange) onCollapsedChange(next);
    if (collapsed === undefined) setUncontrolledCollapsed(next);
  };

  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef<number>(0);
  const startWRef = useRef<number>(initialWidth);
  const lastExpandedWidthRef = useRef<number>(initialWidth);

  // Derived "compact" mode: collapsed OR too small to show text nicely
  const isCompact = useMemo(
    () => isCollapsed || width <= 120,
    [isCollapsed, width]
  );

  useEffect(() => {
    // Keep a memory of the last "expanded" width for nice toggle behavior
    if (!isCollapsed && width > minWidth + 30) {
      lastExpandedWidthRef.current = width;
    }
  }, [isCollapsed, width, minWidth]);

  // If parent controls "collapsed", snap width accordingly (nice UX)
  useEffect(() => {
    if (isCollapsed) {
      setWidth(minWidth);
      onWidthChange?.(minWidth);
    } else {
      const restored = Math.max(
        minWidth,
        Math.min(maxWidth, lastExpandedWidthRef.current || initialWidth)
      );
      setWidth(restored);
      onWidthChange?.(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed]);

  const clamp = (v: number) => Math.max(minWidth, Math.min(maxWidth, v));

  const updateWidth = (next: number) => {
    setWidth(next);
    onWidthChange?.(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // only left click / primary touch
    if ((e as any).button !== undefined && (e as any).button !== 0) return;

    setIsDragging(true);
    startXRef.current = e.clientX;
    startWRef.current = width;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - startXRef.current;
    const next = clamp(startWRef.current + dx);

    updateWidth(next);

    // auto-collapse if dragged very small, auto-expand if dragged larger
    if (next <= minWidth + 2) setCollapsed(true);
    else setCollapsed(false);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setCollapsed(next);

    if (next) {
      updateWidth(minWidth);
    } else {
      const restored = clamp(lastExpandedWidthRef.current || initialWidth);
      updateWidth(restored);
    }
  };

  // Fallback to your original hardcoded nav (so Sidebar still works standalone)
  const fallbackNav: SidebarItem[] = [
    {
      to: "/",
      label: "Home",
      icon: <Home className="text-black" size={22} strokeWidth={1.8} />,
    },
    {
      to: "/library",
      label: "Library",
      icon: <Library className="text-black" size={22} strokeWidth={1.8} />,
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

  const navItems: SidebarItem[] = (
    items && items.length > 0 ? items : fallbackNav
  ).map((it) => ({
    ...it,
    to: it.to ?? inferRoute(it.label),
  }));

  return (
    <div
      className="relative h-screen border-r border-black/10 bg-white"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          {/* Replaced grey square with black music note */}
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white">
            <Music2 className="h-5 w-5 text-black" />
          </div>

          {!isCompact && (
            <div className="leading-tight">
              <div className="text-[18px] font-semibold tracking-tight text-black">
                Tunes
              </div>
              {/* removed "minimal streaming" */}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white text-black hover:bg-black/5 active:scale-[0.98]"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;

            return (
              <li key={item.to}>
                <NavLink
                  to={item.to!}
                  className={[
                    "flex items-center gap-3 rounded-xl px-3 py-3",
                    "transition-colors",
                    active ? "bg-black/5" : "hover:bg-black/5",
                  ].join(" ")}
                >
                  {/* icon */}
                  <span className="grid h-[22px] w-[22px] place-items-center text-black">
                    {item.icon}
                  </span>

                  {/* label */}
                  {!isCompact && (
                    <span className="text-[18px] font-medium text-black">
                      {item.label}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Library section */}
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
            className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white text-black hover:bg-black/5 active:scale-[0.98]"
            aria-label="Add"
            title="Add"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="mt-3">
          <button
            type="button"
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
                <div className="text-base font-semibold text-black">
                  Create a playlist
                </div>
                <div className="text-sm text-black/50">
                  Add songs and episodes
                </div>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={[
          "absolute right-0 top-0 h-full w-[6px]",
          "cursor-ew-resize",
          isDragging ? "bg-black/10" : "hover:bg-black/5",
        ].join(" ")}
        aria-label="Resize sidebar"
        role="separator"
      />
    </div>
  );
}
