import { updateChannelMetadata } from '../channels/channel-metadata';
import { Injectable } from '@nestjs/common';
import { Channel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events/events.gateway';
import type {
  WhatsAppChangeValue,
  WhatsAppMessage,
} from './interfaces/whatsapp.interface';

@Injectable()
export class CoexistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async history(channel: Channel, value: WhatsAppChangeValue) {
    // Media asset follow-ups also use field=history with value.messages.
    // Keep a consent-safe placeholder; never download or enqueue AI work.
    for (const message of value.messages ?? []) {
      if (message.to || message.from)
        await this.store(channel, message.to ?? message.from, message, false);
    }
    for (const chunk of value.history ?? []) {
      for (const thread of chunk.threads ?? []) {
        if (!/^\d+$/.test(thread.id)) continue; // Exclude groups and unsupported identities.
        for (const message of thread.messages ?? []) {
          await this.store(channel, thread.id, message, false);
        }
      }
      if (chunk.errors?.length || chunk.metadata) {
        await updateChannelMetadata(
          this.prisma,
          channel.id,
          channel.organizationId,
          (current) => {
            if (chunk.errors?.some((e) => e.code === 2593109))
              return { ...current, historySyncState: 'DECLINED' };
            if (chunk.errors?.length)
              return { ...current, historySyncState: 'ERROR' };
            const progress = Math.max(
              Number(current.historyProgress) || 0,
              chunk.metadata?.progress ?? 0,
            );
            return {
              ...current,
              historyProgress: progress,
              historySyncState: progress >= 100 ? 'COMPLETE' : 'IN_PROGRESS',
            };
          },
        );
      }
    }
  }

  private async store(
    channel: Channel,
    contact: string,
    message: WhatsAppMessage,
    echo: boolean,
  ) {
    const date = new Date(Number(message.timestamp) * 1000);
    const metadata = channel.metadata as Prisma.JsonObject | null;
    const onboardingAt =
      typeof metadata?.onboardingAt === 'string'
        ? Date.parse(metadata.onboardingAt)
        : Date.now();
    if (
      !message.id ||
      !Number.isFinite(date.getTime()) ||
      date.getTime() > Date.now() + 60000
    )
      return;
    if (
      !echo &&
      (date.getTime() < onboardingAt - 180 * 86400000 ||
        date.getTime() > onboardingAt)
    )
      return;
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            if (
              await tx.message.findUnique({
                where: { metaMessageId: message.id },
              })
            )
              return null;
            let conversation = await tx.conversation.findFirst({
              where: {
                organizationId: channel.organizationId,
                externalContactId: contact,
                deletedAt: null,
              },
            });
            if (
              conversation?.channelId &&
              conversation.channelId !== channel.id
            )
              return null;
            if (!conversation) {
              // Historical/staff-initiated chats are not automatically qualified leads.
              conversation = await tx.conversation.create({
                data: {
                  organizationId: channel.organizationId,
                  channelId: channel.id,
                  externalContactId: contact,
                  aiPaused: true,
                },
              });
            }
            const outgoing = echo || message.from !== contact;
            const stored = await tx.message.create({
              data: {
                conversationId: conversation.id,
                metaMessageId: message.id,
                createdAt: date,
                content:
                  message.text?.body ?? `[${message.type} not downloaded]`,
                type: outgoing ? 'USER_TEXT' : 'LEAD_TEXT',
                handledBy: 'HUMAN',
                status: outgoing ? 'SENT' : 'PROCESSED',
                metadata: {
                  origin: echo ? 'WHATSAPP_PHONE' : 'WHATSAPP_HISTORY',
                  readOnly: !echo,
                },
              },
            });
            return { stored, conversation };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (result)
          await this.events.broadcastNewMessage(
            channel.organizationId,
            result.stored,
          );
        return;
      } catch (error) {
        if (
          ['P2034', 'P2002'].includes(
            (error as { code?: string }).code ?? '',
          ) &&
          attempt < 2
        )
          continue;
        throw error;
      }
    }
  }
}
