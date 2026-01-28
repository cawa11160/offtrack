import { NavLink, useNavigate } from "react-router-dom";
import { Plus, Home, Sparkles, Compass, Map, ShoppingBag, User, Settings } from "lucide-react";

type NavItem = { to: string; label: string; icon: React.ReactNode };

const LIBRARY_PLAYLISTS = ["Playlist name 1", "Playlist name 2", "Playlist name 3", "Playlist name 4"];

const PAGES: NavItem[] = [
  { to: "/", label: "Home", icon: <Home className="h-4 w-4" /> },
  { to: "/recommendations", label: "Recommendations", icon: <Sparkles className="h-4 w-4" /> },
  { to: "/search", label: "Browse", icon: <Compass className="h-4 w-4" /> },
  { to: "/concerts", label: "Map", icon: <Map className="h-4 w-4" /> },
  { to: "/merch", label: "Merch", icon: <ShoppingBag className="h-4 w-4" /> },
  { to: "/profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { to: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

const CIRCLE_SIZE = 560;

export function CircularSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[140px] shrink-0 overflow-hidden md:w-[160px]">
      {/* Semi-circle: right half of circle visible, left half clipped */}
      <div className="absolute inset-y-0 left-0 w-full overflow-hidden">
        <div
          className="absolute rounded-full bg-black"
          style={{
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            left: -CIRCLE_SIZE / 2,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        />
      </div>

      {/* Content overlaying the arc */}
      <div className="relative flex h-full flex-col justify-start overflow-y-auto pt-16 pb-8 pl-4 pr-2">
        {/* Your library */}
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Your library</p>
        </div>
        <ul className="space-y-0.5">
          {LIBRARY_PLAYLISTS.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/10"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>

        {/* + New playlist — small black circle protruding from arc */}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/playlists")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black ring-2 ring-white/20 transition hover:bg-white/15"
            aria-label="New playlist"
          >
            <Plus className="h-4 w-4 text-white" />
          </button>
          <span className="text-sm text-white">+ New playlist</span>
        </div>

        {/* Pages */}
        <div className="mt-8">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-white/70">Pages</p>
          <nav>
            <ul className="space-y-0.5">
              {PAGES.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
                        isActive ? "bg-white/15 text-white" : "text-white hover:bg-white/10"
                      }`
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </aside>
  );
}
