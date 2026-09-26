"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import {
  useNotificationsControllerGetNotifications,
  useNotificationsControllerGetUnreadCount,
  useNotificationsControllerMarkOneAsRead,
  useNotificationsControllerMarkAllAsRead,
  getNotificationsControllerGetNotificationsQueryKey,
  getNotificationsControllerGetUnreadCountQueryKey,
} from "@/lib/api/generated/notifications/notifications";
import type { NotificationsControllerGetNotifications200Item } from "@/lib/api/model";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  CheckCheck,
  Users,
  MessageSquare,
  Layers,
  FileText,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────
function getNotificationIcon(type?: string) {
  switch (type?.toUpperCase()) {
    case "LEAD":
      return <Users className="h-4 w-4 text-blue-500" />;
    case "CONVERSATION":
      return <MessageSquare className="h-4 w-4 text-emerald-500" />;
    case "PIPELINE":
      return <Layers className="h-4 w-4 text-indigo-500" />;
    case "DOCUMENT":
      return <FileText className="h-4 w-4 text-orange-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-slate-400" />;
  }
}

function getNotificationRoute(
  n: NotificationsControllerGetNotifications200Item,
): string | null {
  if (!n.referenceType || !n.referenceId) return null;
  switch (n.referenceType.toLowerCase()) {
    case "lead":
      return `/dashboard/leads?highlight=${n.referenceId}`;
    case "conversation":
      return `/dashboard/conversations/${n.referenceId}`;
    case "pipeline-stage":
      return `/dashboard/settings/pipeline-stages`;
    default:
      return null;
  }
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ──────────────────────────────────────────
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // ─── Orval-generated hooks ────────────────────────────
  const { data: notifications = [] } =
    useNotificationsControllerGetNotifications(
      { limit: 20 },
      { query: { refetchInterval: 60_000, staleTime: 30_000 } },
    );

  const { data: unreadCount = 0 } = useNotificationsControllerGetUnreadCount({
    query: { refetchInterval: 30_000, staleTime: 15_000 },
  });

  const markOneMutation = useNotificationsControllerMarkOneAsRead();
  const markAllMutation = useNotificationsControllerMarkAllAsRead();

  // ─── WebSocket Real-Time Listener ─────────────────────
  useEffect(() => {
    if (!socket) return;

    const handler = (payload: {
      title: string;
      body: string;
      type?: string;
    }) => {
      // Optimistically increment unread count
      queryClient.setQueryData<number>(
        getNotificationsControllerGetUnreadCountQueryKey(),
        (old) => (old ?? 0) + 1,
      );

      // Invalidate the list to fetch the new item
      queryClient.invalidateQueries({
        queryKey: getNotificationsControllerGetNotificationsQueryKey(),
      });

      if (payload.type === "LEAD_HANDED_OFF") {
        toast.error(payload.title, {
          description: payload.body,
          duration: 10000,
        });
        // Attempt audio ping
        try {
          const audio = new Audio("/sounds/ping.mp3");
          audio.volume = 0.5;
          audio.play().catch(() => {
            /* silent failure if not interacted */
          });
        } catch {}
      } else {
        // Fire a system-wide toast
        toast.info(payload.title, {
          description: payload.body,
          duration: 6000,
        });
      }
    };

    socket.on("new_notification", handler);
    return () => {
      socket.off("new_notification", handler);
    };
  }, [socket, queryClient]);

  // ─── Click → Mark Read + Route ────────────────────────
  const handleClickNotification = useCallback(
    (notification: NotificationsControllerGetNotifications200Item) => {
      if (!notification.isRead && notification.id) {
        markOneMutation.mutate(
          { id: notification.id },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: getNotificationsControllerGetNotificationsQueryKey(),
              });
              queryClient.invalidateQueries({
                queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
              });
            },
          },
        );
      }
      const route = getNotificationRoute(notification);
      if (route) router.push(route);
    },
    [markOneMutation, router, queryClient],
  );

  const handleMarkAllRead = useCallback(() => {
    markAllMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getNotificationsControllerGetNotificationsQueryKey(),
        });
        queryClient.setQueryData(
          getNotificationsControllerGetUnreadCountQueryKey(),
          0,
        );
      },
    });
  }, [markAllMutation, queryClient]);

  const count = typeof unreadCount === "number" ? unreadCount : 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-xl hover:bg-[#01081A] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px] text-brand-ice/60" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-lg shadow-red-500/20 animate-in zoom-in duration-200">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[400px] p-0 shadow-2xl border-white/10 rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#051126]/50">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
            {count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/10 text-red-400 px-1.5 text-[10px] font-bold">
                {count}
              </span>
            )}
          </div>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-bold text-brand-ice/60 hover:text-slate-900 h-8 px-3"
              onClick={handleMarkAllRead}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-2xl bg-[#01081A] flex items-center justify-center mb-3">
                <Bell className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-brand-ice/60">All quiet</p>
              <p className="text-xs text-slate-400 mt-1">
                You have no notifications yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-5 py-3.5 flex items-start gap-3.5 hover:bg-[#051126]/80 transition-colors group ${
                    !n.isRead ? "bg-blue-50/30" : ""
                  }`}
                >
                  <div
                    className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                      !n.isRead
                        ? "bg-transparent shadow-none border border-white/5"
                        : "bg-[#051126]"
                    }`}
                  >
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${!n.isRead ? "font-bold text-slate-900" : "font-medium text-brand-ice/80"}`}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] font-medium text-slate-400 mt-1.5">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-1">
                    {!n.isRead && (
                      <div className="h-2 w-2 rounded-full bg-blue-500 shadow-none shadow-blue-200" />
                    )}
                    <ExternalLink className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-3 flex items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-bold text-brand-ice/60 hover:text-blue-600 h-8"
                onClick={() => router.push("/dashboard/notifications")}
              >
                View all notifications
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
