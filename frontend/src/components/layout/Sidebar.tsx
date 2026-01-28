import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Music2 } from "lucide-react";

type SidebarItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
};

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

  const [uncontrolledWidth, setUncontrolledWidth] = useState(initialWidth);
  const sidebarWidth =
    typeof controlledWidth === "number" ? controlledWidth : uncontrolledWidth;

  const isCollapsed =
    typeof collapsed === "boolean" ? collapsed : sidebarWidth <= minWidth;

  const navItems = useMemo(() => items ?? [], [items]);

  const toggle = () => {
    const next = !isCollapsed;

    if (typeof collapsed === "boolean" && onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      const nextWidth = next ? minWidth : initialWidth;
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
    <aside className="relative h-screen bg-black text-white">
      {/* Sidebar body */}
      <div className="flex h-full flex-col px-4 py-6">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">
            <Music2 className="h-5 w-5" />
          </div>

          {!isCollapsed && (
            <div>
              <div className="text-lg font-semibold leading-none">Offtrack</div>
              <div className="text-xs text-white/60">Your library</div>
            </div>
          )}
        </div>

        {/* Library */}
        <div className="mt-10">
          {!isCollapsed && (
            <div className="mb-2 px-2 text-sm font-semibold text-white/70">
              Your library
            </div>
          )}

          <div className="space-y-1">
            {["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"].map(
              (name) => (
                <button
                  key={name}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 transition"
                >
                  {isCollapsed ? "•" : name}
                </button>
              )
            )}

            <button
              onClick={() => navigate("/playlists")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10 transition"
            >
              <Plus className="h-4 w-4" />
              {!isCollapsed && <span>New playlist</span>}
            </button>
          </div>
        </div>

        {/* Pages */}
        <div className="mt-10 flex-1">
          {!isCollapsed && (
            <div className="mb-2 px-2 text-sm font-semibold text-white/70">
              Pages
            </div>
          )}

          <nav>
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                        isActive ? "bg-white/10" : "hover:bg-white/10",
                        isCollapsed ? "justify-center" : "",
                      ].join(" ")
                    }
                    title={item.label}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Resize handle */}
      {!isCollapsed && (
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = sidebarWidth;

            const onMove = (ev: MouseEvent) => {
              setExpandedWidth(startW + (ev.clientX - startX));
            };

            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };

            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="absolute right-[-14px] top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black border border-white/10 grid place-items-center shadow-lg hover:scale-105 transition"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronRight
          className={`h-4 w-4 text-white transition ${
            isCollapsed ? "" : "rotate-180"
          }`}
        />
      </button>
    </aside>
  );
}
