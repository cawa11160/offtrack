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

  return (
    <aside className="relative h-screen" aria-label="Sidebar">
      {/* Wrapper width is controlled by Layout; this fills it */}
      <div className="relative h-full w-full">
        {/* Semi-circle body */}
        <div
          className={[
            "relative h-full w-full overflow-hidden",
            "bg-black text-white",
            // makes the semi-circle “slice”
            "rounded-r-[999px]",
            "shadow-[0_18px_60px_rgba(0,0,0,0.25)]",
          ].join(" ")}
        >
          {/* Content padding */}
          <div className={["h-full", isCollapsed ? "px-3 py-4" : "px-7 py-6"].join(" ")}>
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
                <Music2 className="h-5 w-5 text-white" />
              </div>

              {!isCollapsed && (
                <div className="min-w-0">
                  <div className="text-xl font-semibold leading-none">Offtrack</div>
                  <div className="mt-1 text-xs text-white/60">Your library</div>
                </div>
              )}
            </div>

            {/* Library list */}
            <div className={["mt-10", isCollapsed ? "space-y-3" : "space-y-5"].join(" ")}>
              {!isCollapsed && (
                <div className="text-white/70">
                  <div className="text-sm font-semibold">Your library</div>
                </div>
              )}

              <div className={["space-y-2", isCollapsed ? "text-xs" : "text-base"].join(" ")}>
                {["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"].map(
                  (name) => (
                    <button
                      key={name}
                      type="button"
                      className={[
                        "w-full text-left",
                        "rounded-2xl px-3 py-2",
                        "hover:bg-white/10",
                        "transition",
                      ].join(" ")}
                    >
                      {isCollapsed ? "•" : name}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => navigate("/playlists")}
                  className={[
                    "w-full text-left",
                    "rounded-2xl px-3 py-2",
                    "hover:bg-white/10 transition",
                    "flex items-center gap-2",
                  ].join(" ")}
                >
                  {isCollapsed ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      <span>New playlist</span>
                    </>
                  )}
                </button>
              </div>

              {/* Pages */}
              <div className="pt-6">
                {!isCollapsed && (
                  <div className="text-sm font-semibold text-white/80 mb-2">Pages</div>
                )}

                <nav aria-label="Primary navigation">
                  <ul className="space-y-1">
                    {navItems.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          className={({ isActive }) =>
                            [
                              "flex items-center gap-3 rounded-2xl px-3 py-2",
                              "text-white/90 hover:bg-white/10 transition",
                              isActive ? "bg-white/10" : "",
                              isCollapsed ? "justify-center" : "",
                            ].join(" ")
                          }
                          title={item.label}
                        >
                          <span className="shrink-0">{item.icon}</span>
                          {!isCollapsed && <span className="text-base">{item.label}</span>}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>

            {/* Optional: allow “drag width” only when expanded */}
            {!isCollapsed && (
              <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
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
        </div>

        {/* Little black circle toggle on the outside edge */}
        <button
          type="button"
          onClick={toggle}
          className={[
            "absolute top-1/2 -translate-y-1/2",
            // keep the circle slightly outside the sidebar edge
            "right-[-14px]",
            "h-7 w-7 rounded-full bg-black",
            "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
            "grid place-items-center",
            "hover:scale-[1.03] active:scale-[0.98] transition",
            "border border-white/10",
          ].join(" ")}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          <ChevronRight className={["h-4 w-4 text-white", isCollapsed ? "" : "rotate-180"].join(" ")} />
        </button>
      </div>
    </aside>
  );
}
