import {
  ConflictException,
  OnModuleInit,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { tenantStorage } from '../core/tenant/tenant.context';
import { ConfigService } from '@nestjs/config';
import { Prisma, CredentialProvider, CredentialStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  credentialKey,
  decryptCredential,
  encryptCredential,
  type SecretPayload,
} from './credential-cipher';

import { AuditService } from '../audit/audit.service';

const VERIFIABLE_STATUSES: CredentialStatus[] = [
  CredentialStatus.ACTIVE,
  CredentialStatus.ERROR,
];

@Injectable()
export class CredentialsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      this.key();
      const legacyCount = await this.prisma.credential.count({
        where: { encryptedPayload: { startsWith: 'PLAINTEXT_MIGRATE:' } },
      });
      if (legacyCount !== 0) {
        throw new Error(
          'CREDENTIAL_REPAIR_REQUIRED: run npm run db:deploy before starting',
        );
      }
    });
  }

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

  async createInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    provider: CredentialProvider,
    payload: SecretPayload,
  ) {
    const credential = await tx.credential.create({
      data: {
        organizationId,
        provider,
        encryptedPayload: this.encrypt(payload),
        lastVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        action: 'credential.create',
        targetId: credential.id,
        actor: 'system',
        metadata: { provider },
      },
    });
    return credential;
  }

  async readActive(organizationId: string, id: string): Promise<SecretPayload> {
    const credential = await this.prisma.credential.findFirst({
      where: { id, organizationId, status: CredentialStatus.ACTIVE },
    });
    if (!credential) throw new NotFoundException('Active credential not found');

    if (credential.encryptedPayload.startsWith('PLAINTEXT_MIGRATE:')) {
      throw new InternalServerErrorException('CREDENTIAL_REPAIR_REQUIRED');
    }

    return this.decrypt(credential.encryptedPayload);
  }

  async rotate(organizationId: string, id: string, payload: SecretPayload) {
    const current = await this.prisma.credential.findFirst({
      where: { id, organizationId, status: CredentialStatus.ACTIVE },
    });
    if (!current) throw new NotFoundException('Active credential not found');

    const newCredId = randomUUID();

    const [, newCred] = await this.prisma.$transaction([
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
    // Verification only moves ACTIVE ⇄ ERROR; ROTATED and REVOKED are final.
    await this.prisma.credential.updateMany({
      where: { id, organizationId, status: { in: VERIFIABLE_STATUSES } },
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
      if (credential.status !== CredentialStatus.ERROR) {
        throw new ConflictException(
          'Only a credential in ERROR can be cleared',
        );
      }
      await this.prisma.credential.updateMany({
        where: { id, organizationId, status: CredentialStatus.ERROR },
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
    try {
      return credentialKey(
        this.config.get<string>('INTEGRATION_CREDENTIAL_KEY'),
      );
    } catch {
      throw new InternalServerErrorException(
        'INTEGRATION_CREDENTIAL_KEY must be a 32-byte base64 key',
      );
    }
  }

  private encrypt(payload: SecretPayload): string {
    return encryptCredential(payload, this.key());
  }

  private decrypt(value: string): SecretPayload {
    return decryptCredential(value, this.key());
  }
}
