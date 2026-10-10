import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { METHODOLOGY, WeeklyReportDto } from './dto/weekly-report.dto';
import { weeklyPeriod } from './weekly-period';
import { aggregateMessages } from './weekly-aggregate';

export function bounded<T>(rows: T[], limit: number): T[] {
  if (rows.length > limit)
    throw new UnprocessableEntityException({ code: 'WEEKLY_REPORT_TOO_LARGE' });
  return rows;
}
const messageSelect = {
  id: true,
  conversationId: true,
  createdAt: true,
  type: true,
  handledBy: true,
  metadata: true,
} as const;
@Injectable()
export class WeeklyReportService {
  constructor(private readonly prisma: PrismaService) {}
  async getReport(
    organizationId: string,
    query: Record<string, unknown>,
    asOf = new Date(),
  ): Promise<WeeklyReportDto> {
    if (!organizationId)
      throw new BadRequestException('Missing organization context');
    const { start, cutoff, period } = weeklyPeriod(query, asOf);
    const interval = { gte: start, lt: cutoff };
    const conversationWhere: Prisma.ConversationWhereInput = {
      organizationId,
      deletedAt: null,
      OR: [
        { leadId: null },
        { lead: { is: { organizationId, deletedAt: null } } },
      ],
    };
    const messageWhere: Prisma.MessageWhereInput = {
      deletedAt: null,
      conversation: { is: conversationWhere },
    };
    return this.prisma.$transaction(
      async (tx) => {
        // Read-only Prisma operations in one repeatable-read snapshot; no writes or row locks.
        const newLeads = await tx.lead.count({
          where: { organizationId, deletedAt: null, createdAt: interval },
        });
        const inbound = bounded(
          await tx.message.findMany({
            where: {
              ...messageWhere,
              createdAt: interval,
              type: { in: ['LEAD_TEXT', 'LEAD_MEDIA'] },
            },
            select: { ...messageSelect, content: true },
            take: 20_001,
          }),
          20_000,
        );
        const attempts = bounded(
          await tx.outboundAttempt.findMany({
            where: {
              organizationId,
              status: 'ACCEPTED',
              purpose: { in: ['reply', 'staff'] },
              acceptedAt: interval,
              conversation: { is: conversationWhere },
              message: {
                is: {
                  ...messageWhere,
                  type: {
                    in: ['AI_TEXT', 'AI_MEDIA', 'USER_TEXT', 'USER_MEDIA'],
                  },
                },
              },
            },
            select: {
              conversationId: true,
              acceptedAt: true,
              purpose: true,
              status: true,
              message: { select: messageSelect },
            },
            take: 20_001,
          }),
          20_000,
        );
        const phones = bounded(
          await tx.message.findMany({
            where: {
              ...messageWhere,
              createdAt: interval,
              handledBy: 'HUMAN',
              type: { in: ['USER_TEXT', 'USER_MEDIA'] },
              metadata: { path: ['origin'], equals: 'WHATSAPP_PHONE' },
            },
            select: messageSelect,
            take: 20_001,
          }),
          20_000,
        );
        const notifications = bounded(
          await tx.notification.findMany({
            where: {
              organizationId,
              code: 'LEAD_HANDED_OFF',
              createdAt: interval,
            },
            select: { referenceId: true, referenceType: true },
            take: 10_001,
          }),
          10_000,
        );
        const leadRefs = notifications
          .filter((row) => row.referenceType === 'LEAD' && row.referenceId)
          .map((row) => row.referenceId!);
        const conversationRefs = notifications
          .filter(
            (row) => row.referenceType === 'CONVERSATION' && row.referenceId,
          )
          .map((row) => row.referenceId!);
        const activeRefs = [
          ...new Set(inbound.map((row) => row.conversationId)),
        ];
        const resolved = bounded(
          await tx.conversation.findMany({
            where: {
              AND: [
                conversationWhere,
                {
                  OR: [
                    {
                      id: {
                        in: [...new Set([...conversationRefs, ...activeRefs])],
                      },
                    },
                    { leadId: { in: [...new Set(leadRefs)] } },
                  ],
                },
              ],
            },
            select: { id: true, leadId: true },
            take: 5_001,
          }),
          5_000,
        );
        const ids = new Set(resolved.map((row) => row.id));
        const leads = new Map(
          resolved
            .filter((row) => row.leadId)
            .map((row) => [row.leadId!, row.id]),
        );
        const handoffs = new Set<string>();
        let unresolvedHandoffReferences = 0;
        for (const row of notifications) {
          const id =
            row.referenceType === 'LEAD'
              ? leads.get(row.referenceId!)
              : row.referenceType === 'CONVERSATION' &&
                  ids.has(row.referenceId!)
                ? row.referenceId!
                : undefined;
          if (id) handoffs.add(id);
          else unresolvedHandoffReferences++;
        }
        const metrics = aggregateMessages(
          inbound.filter((row) => ids.has(row.conversationId)),
          attempts,
          phones,
          start,
          cutoff,
        );
        return {
          version: 1,
          period,
          generatedAt: asOf.toISOString(),
          asOf: asOf.toISOString(),
          newLeads,
          ...metrics,
          handedToTeamConversations: handoffs.size,
          consultations: {
            value: null,
            availability: 'not_tracked',
            reason: 'consultation_records_unavailable',
          },
          coverage: { ...metrics.coverage, unresolvedHandoffReferences },
          methodology: [...METHODOLOGY],
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
