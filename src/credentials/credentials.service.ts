import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialProvider, CredentialStatus } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type SecretPayload = Record<string, string>;

import { AuditService } from '../audit/audit.service';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async create(
    organizationId: string,
    provider: CredentialProvider,
    payload: SecretPayload,
  ) {
    const cred = await this.prisma.credential.create({
      data: {
        organizationId,
        provider,
        encryptedPayload: this.encrypt(payload),
      },
      select: { id: true, provider: true, status: true, createdAt: true },
    });
    await this.audit.record({
      organizationId,
      action: 'credential.create',
      targetId: cred.id,
      actor: 'system',
      metadata: { provider },
    });
    return cred;
  }

  async readActive(organizationId: string, id: string): Promise<SecretPayload> {
    const credential = await this.prisma.credential.findFirst({
      where: { id, organizationId, status: CredentialStatus.ACTIVE },
    });
    if (!credential) throw new NotFoundException('Active credential not found');

    const MIGRATE_PREFIX = 'PLAINTEXT_MIGRATE:';
    if (credential.encryptedPayload.startsWith(MIGRATE_PREFIX)) {
      // Legacy credential backfilled by the SQL migration — the token was
      // stored as plaintext with a prefix because SQL cannot replicate
      // Node.js AES-256-GCM encryption. Re-encrypt on first read.
      const rawToken = credential.encryptedPayload.slice(MIGRATE_PREFIX.length);
      const payload: SecretPayload = { accessToken: rawToken };
      const encrypted = this.encrypt(payload);
      await this.prisma.credential.update({
        where: { id },
        data: { encryptedPayload: encrypted },
      });
      await this.audit.record({
        organizationId,
        action: 'credential.migrated',
        targetId: id,
        actor: 'system',
        metadata: {
          reason: 'Legacy plaintext token re-encrypted on first read',
        },
      });
      return payload;
    }

    return this.decrypt(credential.encryptedPayload);
  }

  async rotate(organizationId: string, id: string, payload: SecretPayload) {
    const current = await this.prisma.credential.findFirst({
      where: { id, organizationId, status: CredentialStatus.ACTIVE },
    });
    if (!current) throw new NotFoundException('Active credential not found');

    const newCredId = require('crypto').randomUUID();

    const [_, newCred] = await this.prisma.$transaction([
      this.prisma.credential.update({
        where: { id },
        data: { status: CredentialStatus.ROTATED },
      }),
      this.prisma.credential.create({
        data: {
          id: newCredId,
          organizationId,
          provider: current.provider,
          encryptedPayload: this.encrypt(payload),
        },
      }),
      // T23: Make credential rotation update every live reference atomically
      this.prisma.channel.updateMany({
        where: { credentialId: id, organizationId },
        data: { credentialId: newCredId },
      }),
    ]);
    await this.audit.record({
      organizationId,
      action: 'credential.rotate',
      targetId: current.id,
      actor: 'system',
      metadata: { newCredentialId: newCred.id },
    });
  }

  async revoke(
    organizationId: string,
    id: string,
    reason = 'Disconnected by operator',
  ) {
    await this.prisma.credential.updateMany({
      where: { id, organizationId },
      data: { status: CredentialStatus.REVOKED, lastError: reason },
    });
    await this.audit.record({
      organizationId,
      action: 'credential.revoke',
      targetId: id,
      actor: 'system',
      metadata: { reason },
    });
  }

  async recordVerification(
    organizationId: string,
    id: string,
    valid: boolean,
    error?: string,
  ) {
    await this.prisma.credential.updateMany({
      where: { id, organizationId },
      data: valid
        ? {
            status: CredentialStatus.ACTIVE,
            lastVerifiedAt: new Date(),
            lastError: null,
          }
        : {
            status: CredentialStatus.ERROR,
            lastError: error || 'Provider verification failed',
          },
    });
  }

  // OPERATOR RECOVERY: Allow an admin or operator to forcefully reset a credential or clear its error state
  async operatorRecovery(
    organizationId: string,
    id: string,
    action: 'CLEAR_ERROR' | 'FORCE_ROTATE',
    newPayload?: SecretPayload,
  ) {
    const credential = await this.prisma.credential.findFirst({
      where: { id, organizationId },
    });
    if (!credential) throw new NotFoundException('Credential not found');

    if (action === 'CLEAR_ERROR') {
      await this.prisma.credential.update({
        where: { id },
        data: { status: CredentialStatus.ACTIVE, lastError: null },
      });
      await this.audit.record({
        organizationId,
        action: 'credential.operator_recovery',
        targetId: id,
        actor: 'operator',
        metadata: { action: 'CLEAR_ERROR' },
      });
    } else if (action === 'FORCE_ROTATE' && newPayload) {
      await this.rotate(organizationId, id, newPayload);
      await this.audit.record({
        organizationId,
        action: 'credential.operator_recovery',
        targetId: id,
        actor: 'operator',
        metadata: { action: 'FORCE_ROTATE' },
      });
    }
  }

  private key(): Buffer {
    const encoded = this.config.get<string>('INTEGRATION_CREDENTIAL_KEY');
    const key = encoded ? Buffer.from(encoded, 'base64') : undefined;
    if (!key || key.length !== 32)
      throw new InternalServerErrorException(
        'INTEGRATION_CREDENTIAL_KEY must be a 32-byte base64 key',
      );
    return key;
  }

  private encrypt(payload: SecretPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ciphertext.toString('base64')}`;
  }

  private decrypt(value: string): SecretPayload {
    const [iv, tag, ciphertext] = value
      .split('.')
      .map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8',
      ),
    ) as SecretPayload;
  }
}
