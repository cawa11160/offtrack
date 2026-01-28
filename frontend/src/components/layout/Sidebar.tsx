import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

type SidebarItem = { to: string; label: string; icon?: React.ReactNode };

type SidebarProps = {
  items?: SidebarItem[];

  initialWidth?: number;
  minWidth?: number; // collapsed width
  maxWidth?: number;

  width?: number;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  onWidthChange?: (next: number) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function Sidebar({
  items,
  initialWidth = 360,
  minWidth = 96,
  maxWidth = 420,

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

  return (
    <aside className="relative h-screen w-full" aria-label="Sidebar">
      {/* Big-circle geometry: we render a HUGE circle and keep only the left chunk visible */}
      <div className="relative h-full w-full overflow-hidden">
        {/* The giant circle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 bg-black"
          style={{
            // circle pushed left so the right edge forms the arc you see
            width: isCollapsed ? 740 : 980,
            height: isCollapsed ? 740 : 980,
            borderRadius: 9999,
            left: isCollapsed ? -630 : -820,
          }}
        />

        {/* Content column inside the curve (matches reference spacing) */}
        <div
          className={[
            "relative h-full text-white",
            isCollapsed ? "pl-6 pr-4 py-7" : "pl-16 pr-8 py-8",
          ].join(" ")}
        >
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="text-3xl font-semibold tracking-tight">Offtrack</div>
          </div>

          {/* Library */}
          <div className={["mt-12", isCollapsed ? "opacity-0 pointer-events-none" : ""].join(" ")}>
            <div className="text-white/70 text-lg font-semibold">Your library</div>

            <div className="mt-10 space-y-10 text-2xl font-medium tracking-tight">
              <div>Playlist name 1</div>
              <div>Playlist name 2</div>
              <div>Playlist name 3</div>
              <div>Playlist name 4</div>

              <button
                type="button"
                className="flex items-center gap-5 text-2xl font-medium hover:text-white/90 transition"
              >
                <span className="text-3xl leading-none">+</span>
                <span>New playlist</span>
              </button>
            </div>
          </div>

          {/* Pages (reference is text-only, stacked) */}
          <div
            className={[
              "absolute left-0",
              isCollapsed ? "bottom-14 pl-6" : "bottom-16 pl-16",
            ].join(" ")}
          >
            <div className={["text-white/70 font-semibold", isCollapsed ? "text-base" : "text-xl"].join(" ")}>
              Pages
            </div>

            <nav className="mt-6">
              <ul className={["space-y-7", isCollapsed ? "text-base" : "text-2xl"].join(" ")}>
                {navItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        [
                          "block w-fit",
                          "rounded-full",
                          "px-6 py-3",
                          "transition",
                          isActive ? "bg-white/10" : "hover:bg-white/10",
                          isCollapsed ? "px-0 py-0 rounded-none hover:bg-transparent" : "",
                        ].join(" ")
                      }
                      title={item.label}
                    >
                      {isCollapsed ? "•" : item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Optional resize strip (like before), only when expanded */}
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

        {/* Toggle circle on the arc edge (matches reference placement) */}
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
      </div>
    </aside>
  );
}
