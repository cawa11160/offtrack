import { useEffect, useMemo } from "react";
import { X, Bell, Sparkles, Music2, MapPin, ArrowRight, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationType = "release" | "playlist" | "event" | "system";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  time: string;
  unread?: boolean;
  ctaLabel?: string;
  onCta?: () => void;
};

type NotificationsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

function iconFor(type: NotificationType) {
  switch (type) {
    case "release":
      return Music2;
    case "playlist":
      return Sparkles;
    case "event":
      return MapPin;
    default:
      return Bell;
  }
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const items: NotificationItem[] = useMemo(
    () => [
      {
        id: "n1",
        type: "release",
        title: "New single from Luna Nova",
        description: "“Midnight Drive (Deluxe)” just dropped.",
        time: "2h ago",
        unread: true,
        ctaLabel: "Open",
      },
      {
        id: "n2",
        type: "event",
        title: "Concert near you",
        description: "Synthwave Collective • Friday • 8:00 PM",
        time: "Today",
        unread: true,
        ctaLabel: "View map",
      },
      {
        id: "n3",
        type: "playlist",
        title: "Made For You refreshed",
        description: "Your “Late Night Finds” playlist has new picks.",
        time: "Yesterday",
        unread: false,
        ctaLabel: "Listen",
      },
      {
        id: "n4",
        type: "system",
        title: "Tip",
        description: "Drag the carousel to browse releases faster.",
        time: "2d ago",
        unread: false,
      },
    ],
    []
  );

  const unreadCount = items.filter((i) => i.unread).length;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close notifications"
      />

      {/* Drawer */}
      <aside
        className={cn(
          "absolute right-0 top-0 h-full w-full sm:w-[420px]",
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
              <h2 className="text-lg font-semibold truncate">Notifications</h2>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Updates from artists, playlists, and events.</p>
          </div>

          {/* Only close button now */}
          <button
            type="button"
            className="h-9 w-9 rounded-md hover:bg-accent grid place-items-center"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              // placeholder "mark all read" - wire to state/store later
              onClose();
            }}
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>

          <span className="text-xs text-muted-foreground">
            Showing {items.length} update{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-2">
            {items.map((n) => {
              const Icon = iconFor(n.type);

              return (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-2xl border border-border bg-card p-4",
                    "transition-colors hover:bg-accent/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-xl grid place-items-center flex-shrink-0",
                        n.unread ? "bg-primary/15" : "bg-secondary"
                      )}
                    >
                      <Icon className={cn("w-5 h-5", n.unread ? "text-primary" : "text-muted-foreground")} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight truncate">
                            {n.title}
                            {n.unread && (
                              <span className="ml-2 inline-block align-middle h-2 w-2 rounded-full bg-primary" />
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">{n.description}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{n.time}</span>
                      </div>

                      {n.ctaLabel && (
                        <div className="mt-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-sm font-semibold"
                            onClick={() => {
                              n.onCta?.();
                              onClose();
                            }}
                          >
                            {n.ctaLabel}
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {items.length === 0 && (
            <div className="h-full grid place-items-center p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary grid place-items-center">
                  <Bell className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mt-4">All caught up</h3>
                <p className="text-muted-foreground mt-2">
                  When there’s something new, it’ll show up here.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
