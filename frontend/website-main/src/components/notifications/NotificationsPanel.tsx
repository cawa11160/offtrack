import { useMemo, useState } from "react";
import { X, Bell, CheckCheck, Filter, MapPin, ShoppingBag, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type NotificationType = "music" | "event" | "merch" | "system";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timeLabel: string; // "Today", "Yesterday", "2d ago"
  dateGroup: string; // "Today", "Yesterday", "Earlier"
  read?: boolean;
  ctaLabel?: string;
  onCta?: () => void;
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
    ctaLabel: "Play",
  },
  {
    id: "n2",
    type: "event",
    title: "Concert near you this week",
    body: "Synthwave Collective — Fri 8PM • Brooklyn Steel",
    timeLabel: "6h ago",
    dateGroup: "Today",
    read: false,
    ctaLabel: "View map",
  },
  {
    id: "n3",
    type: "merch",
    title: "Merch drop: limited tee",
    body: "Aurora Borealis store added new items. Low stock.",
    timeLabel: "Yesterday",
    dateGroup: "Yesterday",
    read: true,
    ctaLabel: "Shop",
  },
  {
    id: "n4",
    type: "system",
    title: "Your weekly taste recap is ready",
    body: "See what you played most and what’s trending in your scene.",
    timeLabel: "3d ago",
    dateGroup: "Earlier",
    read: true,
    ctaLabel: "Open recap",
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
  const label =
    type === "music" ? "Music" : type === "event" ? "Events" : type === "merch" ? "Merch" : "Updates";
  return label;
}

export function NotificationsPanel({ open, onClose, items }: Props) {
  const [filter, setFilter] = useState<"all" | NotificationType>("all");
  const [local, setLocal] = useState<AppNotification[]>(() => items ?? demoNotifications);

  const filtered = useMemo(() => {
    const data = local;
    if (filter === "all") return data;
    return data.filter((n) => n.type === filter);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* backdrop */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/35"
        aria-label="Close notifications"
      />

      {/* panel */}
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
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Notifications</h2>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              New releases, nearby shows, merch drops — all in one place.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-accent grid place-items-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground mr-1">
              <Filter className="w-4 h-4" />
              Filter
            </span>

            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-full border text-sm transition-colors",
                filter === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              All
            </button>

            <button
              type="button"
              onClick={() => setFilter("music")}
              className={cn(
                "px-3 py-1.5 rounded-full border text-sm transition-colors",
                filter === "music"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              Music
            </button>

            <button
              type="button"
              onClick={() => setFilter("event")}
              className={cn(
                "px-3 py-1.5 rounded-full border text-sm transition-colors",
                filter === "event"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              Events
            </button>

            <button
              type="button"
              onClick={() => setFilter("merch")}
              className={cn(
                "px-3 py-1.5 rounded-full border text-sm transition-colors",
                filter === "merch"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              Merch
            </button>
          </div>

          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm font-medium"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-accent grid place-items-center mb-4">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold">You’re all caught up</h3>
              <p className="text-muted-foreground mt-2">
                When there’s something new — releases, shows, or drops — it’ll show up here.
              </p>
            </div>
          ) : (
            <div className="p-3">
              {groups.map(([groupName, groupItems]) => (
                <div key={groupName} className="mb-4">
                  <div className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {groupName}
                  </div>

                  <div className="space-y-2">
                    {groupItems.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => markOneRead(n.id)}
                        className={cn(
                          "w-full text-left rounded-2xl border p-4 transition-colors",
                          n.read ? "bg-background border-border" : "bg-primary/5 border-primary/20",
                          "hover:bg-accent"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-xl grid place-items-center shrink-0",
                              n.read ? "bg-accent" : "bg-primary/10"
                            )}
                          >
                            {typeIcon(n.type)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border">
                                    {typePill(n.type)}
                                  </span>
                                  {!n.read && (
                                    <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                                  )}
                                </div>

                                <div className="mt-1 font-semibold truncate">{n.title}</div>
                              </div>

                              <span className="text-xs text-muted-foreground shrink-0">{n.timeLabel}</span>
                            </div>

                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{n.body}</p>

                            {n.ctaLabel && (
                              <div className="mt-3">
                                <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-medium">
                                  {n.ctaLabel}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          Tip: You can personalize this later (artists followed, saved venues, merch preferences).
        </div>
      </div>
    </div>
  );
}
