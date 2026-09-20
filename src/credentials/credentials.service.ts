import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialProvider, CredentialStatus } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type SecretPayload = Record<string, string>;

@Injectable()
export class CredentialsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async create(organizationId: string, provider: CredentialProvider, payload: SecretPayload) {
    return this.prisma.credential.create({
      data: { organizationId, provider, encryptedPayload: this.encrypt(payload) },
      select: { id: true, provider: true, status: true, createdAt: true },
    });
  }

  async readActive(organizationId: string, id: string): Promise<SecretPayload> {
    const credential = await this.prisma.credential.findFirst({
      where: { id, organizationId, status: CredentialStatus.ACTIVE },
    });
    if (!credential) throw new NotFoundException('Active credential not found');
    return this.decrypt(credential.encryptedPayload);
  }

  async rotate(organizationId: string, id: string, payload: SecretPayload) {
    const current = await this.prisma.credential.findFirst({ where: { id, organizationId, status: CredentialStatus.ACTIVE } });
    if (!current) throw new NotFoundException('Active credential not found');
    await this.prisma.$transaction([
      this.prisma.credential.update({ where: { id }, data: { status: CredentialStatus.ROTATED } }),
      this.prisma.credential.create({ data: { organizationId, provider: current.provider, encryptedPayload: this.encrypt(payload) } }),
    ]);
  }

  async revoke(organizationId: string, id: string, reason = 'Disconnected by operator') {
    await this.prisma.credential.updateMany({ where: { id, organizationId }, data: { status: CredentialStatus.REVOKED, lastError: reason } });
  }

  async recordVerification(organizationId: string, id: string, valid: boolean, error?: string) {
    await this.prisma.credential.updateMany({
      where: { id, organizationId },
      data: valid ? { status: CredentialStatus.ACTIVE, lastVerifiedAt: new Date(), lastError: null } : { status: CredentialStatus.ERROR, lastError: error || 'Provider verification failed' },
    });
  }

  // OPERATOR RECOVERY: Allow an admin or operator to forcefully reset a credential or clear its error state
  async operatorRecovery(organizationId: string, id: string, action: 'CLEAR_ERROR' | 'FORCE_ROTATE', newPayload?: SecretPayload) {
    const credential = await this.prisma.credential.findFirst({ where: { id, organizationId } });
    if (!credential) throw new NotFoundException('Credential not found');

    if (action === 'CLEAR_ERROR') {
      await this.prisma.credential.update({
        where: { id },
        data: { status: CredentialStatus.ACTIVE, lastError: null },
      });
    } else if (action === 'FORCE_ROTATE' && newPayload) {
      await this.rotate(organizationId, id, newPayload);
    }
  }

  private key(): Buffer {
    const encoded = this.config.get<string>('INTEGRATION_CREDENTIAL_KEY');
    const key = encoded ? Buffer.from(encoded, 'base64') : undefined;
    if (!key || key.length !== 32) throw new InternalServerErrorException('INTEGRATION_CREDENTIAL_KEY must be a 32-byte base64 key');
    return key;
  }

  private encrypt(payload: SecretPayload): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ciphertext.toString('base64')}`;
  }

  private decrypt(value: string): SecretPayload {
    const [iv, tag, ciphertext] = value.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as SecretPayload;
  }
}
