import { BarChart3, UploadCloud, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type ProfileHubNavProps = {
  active: "profile" | "uploads" | "dashboard";
};

const hubItems = [
  {
    id: "profile",
    label: "Profile",
    description: "Identity and listening graph",
    to: "/profile",
    icon: UserRound,
  },
  {
    id: "uploads",
    label: "Uploads",
    description: "Songs and publishing",
    to: "/profile/uploads",
    icon: UploadCloud,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Listener and track analytics",
    to: "/profile/dashboard",
    icon: BarChart3,
  },
] as const;

export function ProfileHubNav({ active }: ProfileHubNavProps) {
  const { user } = useAuth();
  const isArtist = user?.account_type === "artist";

  return (
    <nav className="grid gap-2 sm:grid-cols-3" aria-label="Profile hub">
      {hubItems.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        const helper = item.id === "profile" ? item.description : isArtist ? item.description : "Artist account feature";

        return (
          <NavLink
            key={item.id}
            to={item.to}
            className={cn(
              "min-w-0 rounded-md border px-3 py-3 transition hover:bg-black/5",
              isActive ? "border-black bg-black text-white hover:bg-black" : "border-black/10 bg-white text-black"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-md",
                  isActive ? "bg-white text-black" : "bg-[#f8f7f2] text-black"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{item.label}</span>
                <span className={cn("block truncate text-xs font-semibold", isActive ? "text-white/70" : "text-black/50")}>
                  {helper}
                </span>
              </span>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
