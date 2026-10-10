import type { WeeklyReportDto } from "@/lib/api/model";
export function weeklyFixture(weekStart = "2026-09-28"): WeeklyReportDto {
  const start = Date.parse(weekStart + "T00:00:00+03:00");
  return {
    version: 1,
    period: {
      weekStart,
      weekEnd: new Date(start + 7 * 86400000 + 3 * 3600000)
        .toISOString()
        .slice(0, 10),
      startUtc: new Date(start).toISOString(),
      endUtc: new Date(start + 7 * 86400000).toISOString(),
      cutoffUtc:
        weekStart === "2026-10-05"
          ? "2026-10-10T12:00:00.000Z"
          : new Date(start + 7 * 86400000).toISOString(),
      timezone: "Europe/Istanbul",
      inProgress: weekStart === "2026-10-05",
    },
    generatedAt: "2026-10-10T12:00:00.000Z",
    asOf: "2026-10-10T12:00:00.000Z",
    newLeads: 0,
    activeConversations: 0,
    patientMessages: 0,
    activity: {
      aiReplies: 0,
      staffDashboardReplies: 0,
      staffPhoneMessages: 0,
      denominator: 0,
      aiPercent: null,
      staffPercent: null,
    },
    replyInterval: {
      opportunities: 0,
      replied: 0,
      pending: 0,
      medianSeconds: null,
      p90Seconds: null,
      ai: { replied: 0, medianSeconds: null },
      staff: { replied: 0, medianSeconds: null },
    },
    handedToTeamConversations: 0,
    consultations: {
      value: null,
      availability: "not_tracked",
      reason: "consultation_records_unavailable",
    },
    topics: [],
    coverage: {
      legacyOriginMessages: 0,
      unresolvedHandoffReferences: 0,
      topicClassifiedConversations: 0,
      topicUnclassifiedConversations: 0,
      excludedPhoneMessages: 0,
    },
    methodology: [
      "surviving_records",
      "all_recorded_activity",
      "legacy_origin",
      "provider_acceptance",
      "reply_interval",
      "phone_excluded",
      "handoff_retention",
      "approximate_topics",
      "consultations_unavailable",
    ],
  };
}
