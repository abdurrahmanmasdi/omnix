"use client";
import { useLocale } from "next-intl";
import { useNotificationText } from "@/i18n/backend";
import { useCopy } from "@/i18n/copy";

import { useEffect, useCallback, useRef } from "react";
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
  getNotificationsControllerGetNotificationsQueryOptions,
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
import type { NotificationInvalidationPayload } from "@/lib/contracts/socket-events.generated";
import {
  notificationRoute,
  resolveNotification,
} from "@/features/inbox/notifications";
import { useInboxText } from "@/features/inbox/i18n";
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

function timeAgo(dateStr: string | undefined, locale: string): string {
  if (!dateStr) return "";
  const minutes = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 60000,
  );
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return formatter.format(-minutes, "minute");
  if (minutes < 1440)
    return formatter.format(-Math.floor(minutes / 60), "hour");
  return formatter.format(-Math.floor(minutes / 1440), "day");
}

// ─── Component ──────────────────────────────────────────
export function NotificationBell() {
  const copy = useCopy();
  const locale = useLocale();
  const notificationText = useNotificationText();

  const router = useRouter();
  const { t } = useInboxText();
  const seenNotifications = useRef(new Set<string>());
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

    const seen = seenNotifications.current;
    const handler = async (payload: NotificationInvalidationPayload) => {
      if (seen.has(payload.id)) return;
      seen.add(payload.id);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getNotificationsControllerGetNotificationsQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getNotificationsControllerGetUnreadCountQueryKey(),
        }),
      ]);
      try {
        const rows = await queryClient.fetchQuery(
          getNotificationsControllerGetNotificationsQueryOptions(
            { limit: 100 },
            { query: { staleTime: 0 } },
          ),
        );
        const notification = resolveNotification(payload, rows);
        if (!notification) return;
        const route = notificationRoute(notification);
        const options = {
          description: notificationText(notification, "body"),
          duration: 10000,
          ...(route
            ? {
                action: { label: t("open"), onClick: () => router.push(route) },
              }
            : {}),
        };
        if (notification.type === "LEAD_HANDED_OFF")
          toast.warning(
            notificationText(notification, "title") || t("handed_off"),
            options,
          );
        else
          toast.info(
            notificationText(notification, "title") || t("notifications"),
            options,
          );
      } catch {
        // Failed or forbidden detail reads must never expose socket-supplied patient data.
        toast.info(t("notifications"));
      }
    };

    socket.on("new_notification", handler);
    return () => {
      socket.off("new_notification", handler);
    };
  }, [socket, queryClient, router, t, notificationText]);

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
      const route = notificationRoute(notification);
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
          aria-label={t("notifications")}
        >
          <Bell className="h-[18px] w-[18px] text-brand-ice/60" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow-lg shadow-red-500/20 animate-in zoom-in duration-200">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(400px,calc(100vw-24px))] p-0 shadow-2xl border-white/10 rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#051126]/50">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-bold text-slate-900">
              {copy("Notifications")}
            </h3>
            {count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/10 text-red-400 px-1.5 text-xs font-bold">
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
              <CheckCheck className="me-1.5 h-3.5 w-3.5" />
              {copy("Mark all read")}
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
              <p className="text-sm font-medium text-brand-ice/60">
                {copy("All quiet")}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {copy("You have no notifications yet.")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-start px-5 py-3.5 flex items-start gap-3.5 hover:bg-[#051126]/80 transition-colors group ${
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
                      {notificationText(n, "title")}
                    </p>
                    {n.body && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {notificationText(n, "body")}
                      </p>
                    )}
                    <p className="text-xs font-medium text-slate-400 mt-1.5">
                      {timeAgo(n.createdAt, locale)}
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
                onClick={() => router.push("/dashboard/conversations")}
              >
                {copy("Open Inbox")}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
