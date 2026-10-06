import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { metaGraphUrl } from '../config/meta-graph';
import { updateChannelMetadata } from './channel-metadata';

export const COEXISTENCE_FIELDS = [
  'messages',
  'account_update',
  'history',
  'smb_app_state_sync',
  'smb_message_echoes',
];

@Injectable()
export class CoexistenceSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async subscribeAndSync(
    id: string,
    organizationId: string,
    accessToken: string,
    wabaId: string,
    phoneNumberId: string,
  ) {
    const base = metaGraphUrl(this.config);
    const headers = { Authorization: `Bearer ${accessToken}` };
    let subscriptionState = 'READY';
    try {
      // App-level fields are set in Meta's App Dashboard, not subscribed_apps.
      // Verify them before subscribing this Messaging account or requesting sync.
      const appId = this.config.get<string>('META_APP_ID');
      const subscriptions = await axios.get(`${base}/${appId}/subscriptions`, {
        headers: {
          Authorization: `Bearer ${appId}|${this.config.get<string>('META_APP_SECRET')}`,
        },
        timeout: 8000,
      });
      const topic = subscriptions.data.data?.find(
        (s: { object: string }) => s.object === 'whatsapp_business_account',
      );
      const fields = topic?.fields?.map((f: { name: string }) => f.name) ?? [];
      if (!COEXISTENCE_FIELDS.every((field) => fields.includes(field)))
        subscriptionState = 'SETUP_REQUIRED';
      else {
        const result = await axios.post(
          `${base}/${wabaId}/subscribed_apps`,
          {},
          { headers, timeout: 8000 },
        );
        if (result.data.success !== true) throw new Error();
      }
    } catch {
      subscriptionState = 'ERROR';
    }
    await updateChannelMetadata(this.prisma, id, organizationId, (current) => ({
      ...current,
      subscriptionState,
    }));
    if (subscriptionState === 'READY') {
      for (const [key, syncType] of [
        ['contactsSyncState', 'smb_app_state_sync'],
        ['historySyncState', 'history'],
      ] as const) {
        const channel = await updateChannelMetadata(
          this.prisma,
          id,
          organizationId,
          (current) => {
            if (current[key] !== 'PENDING') return current;
            if (
              key === 'historySyncState' &&
              !['REQUESTED', 'RECEIVED'].includes(
                String(current.contactsSyncState),
              )
            )
              return current;
            if (
              Date.now() - Date.parse(String(current.onboardingAt)) >
              86400000
            )
              return { ...current, [key]: 'EXPIRED' };
            return { ...current, [key]: 'REQUESTING' };
          },
        );
        // Claim is exclusive: the transaction must tell us whether this caller won.
        // See claim marker below; repeat signup never repeats a one-time request.
        const metadata = channel.metadata as Prisma.JsonObject;
        if (metadata[key] !== 'REQUESTING') continue;
        const claimed = await this.claimRequest(id, organizationId, key);
        if (!claimed) continue;
        try {
          const response = await axios.post(
            `${base}/${phoneNumberId}/smb_app_data`,
            { messaging_product: 'whatsapp', sync_type: syncType },
            { headers, timeout: 8000 },
          );
          if (!response.data.request_id) throw new Error();
          await updateChannelMetadata(
            this.prisma,
            id,
            organizationId,
            (current) => ({
              ...current,
              [key]: current[key] === 'SENDING' ? 'REQUESTED' : current[key],
              [`${key}RequestId`]: response.data.request_id,
            }),
          );
        } catch {
          // A timeout can be an accepted one-time request. Require founder review;
          // never blindly retry it, including on repeat onboarding.
          await updateChannelMetadata(
            this.prisma,
            id,
            organizationId,
            (current) => ({
              ...current,
              [key]: current[key] === 'SENDING' ? 'UNKNOWN' : current[key],
            }),
          );
          break;
        }
      }
    }
    const saved = await this.prisma.channel.findFirstOrThrow({
      where: { id, organizationId },
    });
    const metadata = saved.metadata as Prisma.JsonObject;
    return {
      id,
      subscriptionState,
      historySyncState: metadata.historySyncState,
      contactsSyncState: metadata.contactsSyncState,
    };
  }

  private async claimRequest(id: string, organizationId: string, key: string) {
    // Returning a local flag from the retried callback would survive a rollback.
    // Return the claim directly from the committed transaction instead.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const channel = await tx.channel.findFirstOrThrow({
              where: { id, organizationId },
            });
            const current = channel.metadata as Prisma.JsonObject;
            if (current[key] !== 'REQUESTING') return false;
            await tx.channel.update({
              where: { id },
              data: { metadata: { ...current, [key]: 'SENDING' } },
            });
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if ((error as { code?: string }).code === 'P2034' && attempt < 2)
          continue;
        throw error;
      }
    }
  }
}
