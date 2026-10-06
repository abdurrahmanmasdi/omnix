import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { CoexistenceSyncService } from './coexistence-sync.service';
import { metaGraphUrl, metaGraphVersion } from '../config/meta-graph';

@Injectable()
export class EmbeddedSignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly config: ConfigService,
    private readonly sync: CoexistenceSyncService,
  ) {}

  configuration() {
    const appId = this.config.get<string>('META_APP_ID') ?? null;
    const configId =
      this.config.get<string>('META_EMBEDDED_SIGNUP_CONFIG_ID') ?? null;
    return {
      available: !!(appId && configId),
      appId,
      configId,
      graphVersion: metaGraphVersion(this.config),
    };
  }

  async connect(organizationId: string, code: string) {
    const { available, appId } = this.configuration();
    if (!available)
      throw new ServiceUnavailableException(
        'Meta Embedded Signup v4 is not configured. Use the credential fallback.',
      );
    const base = metaGraphUrl(this.config);
    const appSecret = this.config.get<string>('META_APP_SECRET');
    let accessToken: string;
    let wabaId: string;
    let phoneNumberId: string;
    try {
      const exchanged = await axios.get(`${base}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, code },
        timeout: 8000,
      });
      accessToken = exchanged.data.access_token;
      if (typeof accessToken !== 'string' || !accessToken) throw new Error();
      // IDs from the browser session are never trusted. Resolve granted assets
      // using the exchanged business token; fail closed on ambiguous grants.
      const debug = await axios.get(`${base}/debug_token`, {
        params: { input_token: accessToken },
        headers: { Authorization: `Bearer ${appId}|${appSecret}` },
        timeout: 8000,
      });
      if (!debug.data.data?.is_valid || debug.data.data.app_id !== appId)
        throw new Error();
      const scopes = debug.data.data.granular_scopes as {
        scope: string;
        target_ids?: string[];
      }[];
      const ids = [
        ...new Set(
          (scopes ?? [])
            .filter((s) => s.scope === 'whatsapp_business_management')
            .flatMap((s) => s.target_ids ?? []),
        ),
      ];
      if (ids.length !== 1)
        throw new BadRequestException(
          'Signup must grant exactly one WhatsApp account. Reconnect using the fallback if Meta omits asset grants.',
        );
      wabaId = ids[0];
      const phones = await axios.get(`${base}/${wabaId}/phone_numbers`, {
        params: { fields: 'id,is_on_biz_app,platform_type' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000,
      });
      const assets = phones.data.data as {
        id: string;
        is_on_biz_app?: boolean;
        platform_type?: string;
      }[];
      const coexistence =
        assets?.filter(
          (p) => p.is_on_biz_app === true && p.platform_type === 'CLOUD_API',
        ) ?? [];
      if (coexistence.length !== 1 || phones.data.paging?.next)
        throw new BadRequestException(
          'Signup must grant one coexistence phone number.',
        );
      phoneNumberId = coexistence[0].id;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // Axios errors contain request credentials. Never log or rethrow them.
      throw new ServiceUnavailableException(
        'Meta signup could not be completed. Retry or use the credential fallback.',
      );
    }

    // Serializable persistence prevents concurrent repeat onboarding and
    // cross-clinic ownership collisions without a shared database migration.
    const channel = await tenantStorage.run(
      { isSystemBypass: true },
      async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await this.prisma.$transaction(
              async (tx) => {
                const owners = await tx.channel.findMany({
                  where: {
                    provider: 'WHATSAPP_CLOUD_API',
                    providerAccountId: phoneNumberId,
                  },
                  take: 2,
                });
                if (
                  owners.some((c) => c.organizationId !== organizationId) ||
                  owners.length > 1
                )
                  throw new ConflictException(
                    'This WhatsApp number is already connected.',
                  );
                const credential = await this.credentials.createInTransaction(
                  tx,
                  organizationId,
                  'WHATSAPP_CLOUD_API',
                  { accessToken, phoneNumberId, wabaId },
                );
                const existing = owners[0];
                const previous =
                  existing?.status === 'DISCONNECTED'
                    ? {}
                    : ((existing?.metadata as Prisma.JsonObject) ?? {});
                const metadata = {
                  ...previous,
                  coexistence: true,
                  wabaId,
                  onboardingAt:
                    previous.onboardingAt ?? new Date().toISOString(),
                  subscriptionState: 'PENDING',
                  historySyncState: previous.historySyncState ?? 'PENDING',
                  contactsSyncState: previous.contactsSyncState ?? 'PENDING',
                };
                if (existing) {
                  const updated = await tx.channel.update({
                    where: { id: existing.id },
                    data: {
                      credentialId: credential.id,
                      status: 'ACTIVE',
                      metadata,
                    },
                  });
                  if (existing.credentialId)
                    await tx.credential.updateMany({
                      where: { id: existing.credentialId, organizationId },
                      data: { status: 'ROTATED' },
                    });
                  return updated;
                } else {
                  return tx.channel.create({
                    data: {
                      organizationId,
                      provider: 'WHATSAPP_CLOUD_API',
                      providerAccountId: phoneNumberId,
                      credentialId: credential.id,
                      status: 'ACTIVE',
                      metadata,
                    },
                  });
                }
              },
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            );
          } catch (error) {
            if ((error as { code?: string }).code === 'P2034' && attempt < 2)
              continue;
            throw error;
          }
        }
      },
    );
    // Persist first: sync callbacks may arrive immediately.
    return this.sync.subscribeAndSync(
      channel.id,
      organizationId,
      accessToken,
      wabaId,
      phoneNumberId,
    );
  }
}
