import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, CheckCheck, Loader2, MapPin, Music2, Radio, Shield, Sparkles, X } from "lucide-react";

import {
  apiListNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  type NotificationItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type NotificationsDrawerProps = {
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
};

function iconFor(type: string) {
  switch ((type || "").toLowerCase()) {
    case "listener":
      return Radio;
    case "conversion":
      return Sparkles;
    case "discovery":
      return Music2;
    case "security":
      return Shield;
    case "event":
    case "concert":
      return MapPin;
    default:
      return Bell;
  }
}

function relativeTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationsDrawer({ open, onClose, onUnreadChange }: NotificationsDrawerProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unreadCount = items.filter((item) => item.unread).length;

  useEffect(() => {
    onUnreadChange?.(unreadCount);
  }, [onUnreadChange, unreadCount]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    setError("");
    apiListNotifications(50)
      .then((data) => {
        if (!mounted) return;
        setItems(data.notifications);
        onUnreadChange?.(data.unreadCount);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Could not load notifications");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [onUnreadChange, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function markAllRead() {
    const previous = items;
    setItems((current) => current.map((item) => ({ ...item, unread: false, readAt: item.readAt || new Date().toISOString() })));
    onUnreadChange?.(0);
    try {
      await apiMarkAllNotificationsRead();
    } catch {
      setItems(previous);
    }
  }

  async function openNotification(item: NotificationItem) {
    const target = item.link || "/profile";
    if (item.unread) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, unread: false, readAt: row.readAt || new Date().toISOString() } : row))
      );
      apiMarkNotificationRead(item.id).catch(() => undefined);
    }
    onClose();
    navigate(target);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close notifications" />

      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full flex-col border-l border-border bg-background shadow-2xl sm:w-[420px]"
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">Notifications</h2>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{unreadCount} new</span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">Listener, discovery, and account updates.</p>
          </div>

          <button type="button" className="grid h-9 w-9 place-items-center rounded-md hover:bg-accent" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={() => void markAllRead()}
            disabled={!unreadCount}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>

          <span className="text-xs text-muted-foreground">
            Showing {items.length} update{items.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading notifications
            </div>
          ) : null}

          {error ? <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

          <div className="space-y-2 p-3">
            {items.map((item) => {
              const Icon = iconFor(item.type);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openNotification(item)}
                  className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("grid h-10 w-10 flex-shrink-0 place-items-center rounded-md", item.unread ? "bg-primary/15" : "bg-secondary")}>
                      <Icon className={cn("h-5 w-5", item.unread ? "text-primary" : "text-muted-foreground")} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold leading-tight">
                            {item.title}
                            {item.unread ? <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" /> : null}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                        </div>
                        <span className="flex-shrink-0 text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold">
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {!loading && !items.length ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-secondary">
                  <Bell className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-xl font-semibold">All caught up</h3>
                <p className="mt-2 text-muted-foreground">Listener and discovery updates will show up here.</p>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
