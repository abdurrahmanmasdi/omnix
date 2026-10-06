import type { NotificationsControllerGetNotifications200Item } from "@/lib/api/model";
import type { NotificationInvalidationPayload } from "@/lib/contracts/socket-events.generated";

export function notificationRoute(
  n: NotificationsControllerGetNotifications200Item,
): string | null {
  if (!n.referenceType || !n.referenceId) return null;
  const id = encodeURIComponent(n.referenceId);
  switch (n.referenceType.toUpperCase()) {
    case "LEAD":
      return n.type === "LEAD_HANDED_OFF"
        ? `/dashboard/conversations?lead=${id}`
        : `/dashboard/leads?highlight=${id}`;
    case "CONVERSATION":
      return `/dashboard/conversations?conversation=${id}`;
    case "PIPELINE-STAGE":
      return "/dashboard/settings/pipeline-stages";
    default:
      return null;
  }
}
// The gateway intentionally sends no patient details or handoff kind.
export function resolveNotification(
  payload: NotificationInvalidationPayload,
  rows: NotificationsControllerGetNotifications200Item[],
) {
  return payload.type === "UPDATE"
    ? rows.find((row) => row.id === payload.id)
    : undefined;
}
