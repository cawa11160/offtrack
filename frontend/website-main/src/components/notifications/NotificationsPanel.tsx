import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Bell, CheckCheck, Filter, MapPin, ShoppingBag, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotificationType = "music" | "event" | "merch" | "system";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timeLabel: string;
  dateGroup: string;
  read?: boolean;

  // optional deep link in future
  link?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items?: AppNotification[];
};

const demoNotifications: AppNotification[] = [
  {
    id: "n1",
    type: "music",
    title: "New release: “Midnight Hours”",
    body: "Luna Nova dropped a new single. First listen is on us.",
    timeLabel: "2h ago",
    dateGroup: "Today",
    read: false,
  },
  {
    id: "n2",
    type: "event",
    title: "Concert near you this week",
    body: "Synthwave Collective — Fri 8PM • Brooklyn Steel",
    timeLabel: "6h ago",
    dateGroup: "Today",
    read: false,
  },
  {
    id: "n3",
    type: "merch",
    title: "Merch drop: limited tee",
    body: "Aurora Borealis store added new items. Low stock.",
    timeLabel: "Yesterday",
    dateGroup: "Yesterday",
    read: true,
  },
  {
    id: "n4",
    type: "system",
    title: "Your weekly taste recap is ready",
    body: "See what you played most and what’s trending in your scene.",
    timeLabel: "3d ago",
    dateGroup: "Earlier",
    read: true,
  },
];

function typeIcon(type: NotificationType) {
  switch (type) {
    case "music":
      return <Music2 className="w-4 h-4" />;
    case "event":
      return <MapPin className="w-4 h-4" />;
    case "merch":
      return <ShoppingBag className="w-4 h-4" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
}

function typePill(type: NotificationType) {
  if (type === "music") return "Music";
  if (type === "event") return "Events";
  if (type === "merch") return "Merch";
  return "Updates";
}

export function NotificationsPanel({ open, onClose, items }: Props) {
  const navigate = useNavigate();

  const [filter, setFilter] = useState<"all" | NotificationType>("all");
  const [local, setLocal] = useState<AppNotification[]>(() => items ?? demoNotifications);

  const filtered = useMemo(() => {
    if (filter === "all") return local;
    return local.filter((n) => n.type === filter);
  }, [local, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    for (const n of filtered) {
      if (!map.has(n.dateGroup)) map.set(n.dateGroup, []);
      map.get(n.dateGroup)!.push(n);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const unreadCount = useMemo(() => local.filter((n) => !n.read).length, [local]);

  const markAllRead = () => {
    setLocal((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markOneRead = (id: string) => {
    setLocal((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  // 🔥 NEW: navigation logic
  const handleClick = (n: AppNotification) => {
    markOneRead(n.id);

    // if backend provided explicit link, prefer that
    if (n.link) {
      navigate(n.link);
      onClose();
      return;
    }

    switch (n.type) {
      case "music":
        navigate("/release/demo");   // replace with real release id later
        break;

      case "event":
        navigate("/concerts");
        break;

      case "merch":
        navigate("/merch");
        break;

      case "system":
        navigate("/profile");
        break;

      default:
        break;
    }

    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
        aria-label="Close notifications"
      />

      <div
        className={cn(
          "absolute right-0 top-0 h-full w-full sm:w-[460px]",
          "bg-background border-l border-border shadow-2xl",
          "flex flex-col"
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Notifications</h2>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-accent grid place-items-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setFilter("all")} className="text-sm">All</button>
            <button onClick={() => setFilter("music")} className="text-sm">Music</button>
            <button onClick={() => setFilter("event")} className="text-sm">Events</button>
            <button onClick={() => setFilter("merch")} className="text-sm">Merch</button>
          </div>

          <button onClick={markAllRead} className="text-sm flex items-center gap-1">
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {groups.map(([groupName, groupItems]) => (
            <div key={groupName} className="p-3">
              <div className="text-xs font-semibold mb-2">{groupName}</div>

              {groupItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-4 transition-colors mb-2",
                    n.read ? "bg-background" : "bg-primary/5",
                    "hover:bg-accent"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl grid place-items-center bg-accent">
                      {typeIcon(n.type)}
                    </div>

                    <div className="flex-1">
                      <div className="font-semibold">{n.title}</div>
                      <p className="text-sm text-muted-foreground">{n.body}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        {n.timeLabel}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
