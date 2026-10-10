"use client";
import { useAuthStore } from "@/store/auth-store";
import { tenantQueryKey } from "@/lib/session-scope";
import {
  getAnalyticsControllerGetWeeklyAccessQueryKey,
  useAnalyticsControllerGetWeeklyAccess,
} from "@/lib/api/generated/analytics/analytics";
export function useReportAccess() {
  const user = useAuthStore((state) => state.user);
  return useAnalyticsControllerGetWeeklyAccess({
    query: {
      queryKey: tenantQueryKey(
        {
          userId: user?.id ?? "",
          organizationId: user?.organizationId ?? null,
        },
        getAnalyticsControllerGetWeeklyAccessQueryKey(),
      ),
      enabled: !!user?.organizationId,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
}
export function shiftWeek(date: string, weeks: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + weeks * 7 * 86400000)
    .toISOString()
    .slice(0, 10);
}
