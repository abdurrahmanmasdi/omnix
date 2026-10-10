import { median, p90 } from './weekly-period';
import { topicCounts } from './weekly-topics';
export type ReportMessage = {
  id: string;
  conversationId: string;
  createdAt: Date;
  type: string;
  handledBy: string;
  metadata: unknown;
};
export type ReportInbound = ReportMessage & { content: string };
export type ReportAttempt = {
  conversationId: string;
  acceptedAt: Date | null;
  purpose: string;
  status: string;
  message: ReportMessage;
};
export function origin(message: ReportMessage): string | undefined {
  const metadata = message.metadata as { origin?: string } | null;
  return typeof metadata?.origin === 'string' ? metadata.origin : undefined;
}
export function live(message: ReportMessage): boolean {
  return (
    origin(message) !== 'WHATSAPP_HISTORY' &&
    (message.metadata as { readOnly?: boolean } | null)?.readOnly !== true
  );
}
export function acceptedSender(attempt: ReportAttempt): 'ai' | 'staff' | null {
  if (
    attempt.status !== 'ACCEPTED' ||
    !attempt.acceptedAt ||
    !live(attempt.message) ||
    origin(attempt.message) === 'WHATSAPP_PHONE'
  )
    return null;
  if (
    attempt.purpose === 'reply' &&
    ['AI_TEXT', 'AI_MEDIA'].includes(attempt.message.type)
  )
    return 'ai';
  if (
    attempt.purpose === 'staff' &&
    attempt.message.handledBy === 'HUMAN' &&
    ['USER_TEXT', 'USER_MEDIA'].includes(attempt.message.type)
  )
    return 'staff';
  return null;
}
export function aggregateMessages(
  inboundRows: ReportInbound[],
  attemptRows: ReportAttempt[],
  phoneRows: ReportMessage[],
  start: Date,
  cutoff: Date,
) {
  const within = (date: Date) => date >= start && date < cutoff;
  const inbound = [
    ...new Map(
      inboundRows
        .filter((row) => live(row) && within(row.createdAt))
        .map((row) => [row.id, row]),
    ).values(),
  ];
  const attempts = [
    ...new Map(
      attemptRows
        .filter((row) => acceptedSender(row) && within(row.acceptedAt!))
        .map((row) => [row.message.id, row]),
    ).values(),
  ];
  const phones = [
    ...new Map(
      phoneRows
        .filter(
          (row) =>
            live(row) &&
            origin(row) === 'WHATSAPP_PHONE' &&
            within(row.createdAt),
        )
        .map((row) => [row.id, row]),
    ).values(),
  ];
  const anchors = new Map<string, ReportInbound>();
  for (const row of inbound) {
    const previous = anchors.get(row.conversationId);
    if (
      !previous ||
      row.createdAt < previous.createdAt ||
      (row.createdAt.getTime() === previous.createdAt.getTime() &&
        row.id < previous.id)
    )
      anchors.set(row.conversationId, row);
  }
  const replies = new Map<string, ReportAttempt>();
  for (const row of attempts) {
    const anchor = anchors.get(row.conversationId);
    if (
      !anchor ||
      row.message.conversationId !== row.conversationId ||
      row.message.createdAt < anchor.createdAt ||
      row.acceptedAt! < anchor.createdAt
    )
      continue;
    const previous = replies.get(row.conversationId);
    if (
      !previous ||
      row.acceptedAt! < previous.acceptedAt! ||
      (row.acceptedAt!.getTime() === previous.acceptedAt!.getTime() &&
        row.message.id < previous.message.id)
    )
      replies.set(row.conversationId, row);
  }
  const ai: number[] = [],
    staff: number[] = [];
  for (const [id, reply] of replies)
    (acceptedSender(reply) === 'ai' ? ai : staff).push(
      (reply.acceptedAt!.getTime() - anchors.get(id)!.createdAt.getTime()) /
        1000,
    );
  const all = [...ai, ...staff];
  const aiReplies = attempts.filter(
    (row) => acceptedSender(row) === 'ai',
  ).length;
  const staffDashboardReplies = attempts.length - aiReplies;
  const denominator = aiReplies + staffDashboardReplies + phones.length;
  const topics = topicCounts(inbound);
  return {
    activeConversations: anchors.size,
    patientMessages: inbound.length,
    activity: {
      aiReplies,
      staffDashboardReplies,
      staffPhoneMessages: phones.length,
      denominator,
      aiPercent: denominator ? (aiReplies / denominator) * 100 : null,
      staffPercent: denominator
        ? ((staffDashboardReplies + phones.length) / denominator) * 100
        : null,
    },
    replyInterval: {
      opportunities: anchors.size,
      replied: all.length,
      pending: anchors.size - all.length,
      medianSeconds: median(all),
      p90Seconds: p90(all),
      ai: { replied: ai.length, medianSeconds: median(ai) },
      staff: { replied: staff.length, medianSeconds: median(staff) },
    },
    topics: topics.topics,
    coverage: {
      legacyOriginMessages: [
        ...inbound,
        ...attempts.map((row) => row.message),
        ...phones,
      ].filter((row) => !origin(row)).length,
      excludedPhoneMessages: phones.length,
      topicClassifiedConversations: topics.topicClassifiedConversations,
      topicUnclassifiedConversations: topics.topicUnclassifiedConversations,
    },
  };
}
