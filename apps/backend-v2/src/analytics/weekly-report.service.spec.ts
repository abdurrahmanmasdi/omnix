import { WeeklyReportService, bounded } from './weekly-report.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
const asOf = new Date('2026-10-10T12:00:00Z');
const at = (time: string) => new Date(`2026-10-05T${time}:00Z`);
const conv = (
  id: string,
  org = 'clinic-a',
  deletedAt: Date | null = null,
  leadDeleted = false,
) => ({
  id,
  organizationId: org,
  deletedAt,
  leadId: id + '-lead',
  lead: { organizationId: org, deletedAt: leadDeleted ? asOf : null },
});
const conversations = [
  conv('A'),
  conv('B'),
  conv('C'),
  conv('foreign', 'clinic-b'),
  conv('deleted', 'clinic-a', asOf),
  conv('deleted-lead', 'clinic-a', null, true),
  { ...conv('leadless'), leadId: null, lead: null },
];
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((part: any) => matches(row, part));
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    const actual = row[key];
    if (value === null || typeof value !== 'object') return actual === value;
    if ('is' in value) return actual && matches(actual, value.is);
    if ('in' in value) return value.in.includes(actual);
    if ('gte' in value) return actual >= value.gte && actual < value.lt;
    if ('path' in value) return actual?.[value.path[0]] === value.equals;
    return false;
  });
}
const msg = (
  id: string,
  conversationId: string,
  time: string,
  type = 'LEAD_TEXT',
  metadata: any = null,
) => ({
  id,
  conversationId,
  createdAt: at(time),
  type,
  handledBy: type.startsWith('USER') ? 'HUMAN' : 'AI',
  metadata,
  deletedAt: null,
  content: 'price implant',
  conversation: conversations.find((c) => c.id === conversationId),
});
const inbound = [
  msg('a', 'A', '09:00'),
  msg('a2', 'A', '09:02'),
  msg('b', 'B', '09:10'),
  msg('c', 'C', '09:20'),
  msg('f', 'foreign', '09:00'),
  msg('d', 'deleted', '09:00'),
  msg('dl', 'deleted-lead', '09:00'),
  msg('history', 'A', '09:01', 'LEAD_TEXT', { origin: 'WHATSAPP_HISTORY' }),
  msg('readonly', 'A', '09:01', 'LEAD_TEXT', { readOnly: true }),
  { ...msg('soft', 'A', '09:01'), deletedAt: asOf },
  { ...msg('end', 'A', '09:00'), createdAt: asOf },
];
const out = (
  id: string,
  cid: string,
  time: string,
  purpose = 'reply',
  status = 'ACCEPTED',
  type = 'AI_TEXT',
) => ({
  organizationId: cid === 'foreign' ? 'clinic-b' : 'clinic-a',
  conversationId: cid,
  acceptedAt: at(time),
  purpose,
  status,
  conversation: conversations.find((c) => c.id === cid),
  message: msg(id, cid, time, type),
});
const attempts = [
  out('ai', 'A', '09:05'),
  out('bubble', 'A', '09:06'),
  out('staff', 'B', '09:12', 'staff', 'ACCEPTED', 'USER_TEXT'),
  out('f', 'foreign', '09:05'),
  out('draft', 'C', '09:21', 'reply', 'ACCEPTED', 'AI_DRAFT'),
  ...['UNKNOWN', 'FAILED', 'CANCELLED'].map((status) =>
    out(status, 'C', '09:21', 'reply', status),
  ),
  out('follow', 'C', '09:21', 'follow-up'),
  out('consent', 'C', '09:21', 'consent-request'),
];
const notifications = [0, 1, 2].map(() => ({
  organizationId: 'clinic-a',
  code: 'LEAD_HANDED_OFF',
  createdAt: at('09:05'),
  referenceType: 'LEAD',
  referenceId: 'A-lead',
}));
notifications.push(
  ...['foreign-lead', 'deleted-lead', 'missing'].map((referenceId) => ({
    organizationId: 'clinic-a',
    code: 'LEAD_HANDED_OFF',
    createdAt: at('09:05'),
    referenceType: 'LEAD',
    referenceId,
  })),
  {
    organizationId: 'clinic-a',
    code: 'LEAD_HANDED_OFF',
    createdAt: at('09:05'),
    referenceType: 'CONVERSATION',
    referenceId: 'A',
  },
);
function storage() {
  const find = (rows: any[]) =>
    jest.fn(async ({ where, take }: any) =>
      rows.filter((row) => matches(row, where)).slice(0, take),
    );
  const tx = {
    lead: {
      count: jest.fn(
        async ({ where }: any) =>
          conversations.filter((c) =>
            matches(
              {
                organizationId: c.organizationId,
                deletedAt: c.lead?.deletedAt,
                createdAt: at('09:00'),
              },
              where,
            ),
          ).length,
      ),
    },
    message: {
      findMany: find([
        ...inbound,
        msg('phone', 'C', '09:22', 'USER_TEXT', { origin: 'WHATSAPP_PHONE' }),
      ]),
    },
    outboundAttempt: { findMany: find(attempts) },
    notification: { findMany: find(notifications) },
    conversation: { findMany: find(conversations) },
  };
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return {
    tx,
    prisma,
    service: new WeeklyReportService(prisma as unknown as PrismaService),
  };
}
describe('weekly report storage path', () => {
  it('reconciles two clinics, exclusions, handoff dedupe, privacy and repeatable-read query shapes', async () => {
    const { service, prisma, tx } = storage();
    const report = await service.getReport(
      'clinic-a',
      { weekStart: '2026-10-05' },
      asOf,
    );
    expect(report.activeConversations).toBe(3);
    expect(report.patientMessages).toBe(4);
    expect(report.replyInterval).toMatchObject({
      opportunities: 3,
      replied: 2,
      pending: 1,
      medianSeconds: 210,
      p90Seconds: 300,
      ai: { replied: 1, medianSeconds: 300 },
      staff: { replied: 1, medianSeconds: 120 },
    });
    expect(report.activity).toMatchObject({
      aiReplies: 2,
      staffDashboardReplies: 1,
      staffPhoneMessages: 1,
      denominator: 4,
    });
    expect(report.handedToTeamConversations).toBe(1);
    expect(report.coverage.unresolvedHandoffReferences).toBe(3);
    expect(report.consultations).toEqual({
      value: null,
      availability: 'not_tracked',
      reason: 'consultation_records_unavailable',
    });
    expect(report.generatedAt).toBe(report.asOf);
    expect(JSON.stringify(report)).not.toMatch(
      /clinic-a|foreign|A-lead|price implant|content|phoneNumber|referenceId/,
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    for (const call of tx.message.findMany.mock.calls) {
      const args = call[0];
      expect(args.where.conversation.is).toMatchObject({
        organizationId: 'clinic-a',
        deletedAt: null,
        OR: [
          { leadId: null },
          { lead: { is: { organizationId: 'clinic-a', deletedAt: null } } },
        ],
      });
      expect(args.where.deletedAt).toBeNull();
      expect(args.take).toBe(20001);
      expect(args.select).not.toHaveProperty('mediaUrl');
    }
    expect(tx.outboundAttempt.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'clinic-a',
      conversation: { is: { organizationId: 'clinic-a' } },
      message: {
        is: {
          deletedAt: null,
          conversation: { is: { organizationId: 'clinic-a' } },
        },
      },
    });
    expect(tx.notification.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'clinic-a',
      code: 'LEAD_HANDED_OFF',
    });
    expect(
      tx.conversation.findMany.mock.calls[0][0].where.AND[0],
    ).toMatchObject({ organizationId: 'clinic-a', deletedAt: null });
    expect(tx.lead.count.mock.calls[0][0].where).toMatchObject({
      organizationId: 'clinic-a',
      deletedAt: null,
    });
  });
  it('fails missing tenant and invalid query before reading storage', async () => {
    const { service, prisma } = storage();
    await expect(service.getReport('', {}, asOf)).rejects.toThrow();
    await expect(
      service.getReport('clinic-a', { weekStart: '2026-10-06' }, asOf),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([20000, 10000, 5000])('limits fail loudly at %i', (limit) => {
    expect(bounded(Array(limit), limit)).toHaveLength(limit);
    try {
      bounded(Array(limit + 1), limit);
      throw new Error('no rejection');
    } catch (error: any) {
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toEqual({ code: 'WEEKLY_REPORT_TOO_LARGE' });
    }
  });
  it('propagates a bounded query failure instead of partial totals', async () => {
    const { service, tx } = storage();
    tx.message.findMany.mockResolvedValueOnce(Array(20001));
    await expect(service.getReport('clinic-a', {}, asOf)).rejects.toMatchObject(
      { status: 422 },
    );
    expect(tx.outboundAttempt.findMany).not.toHaveBeenCalled();
  });
});
