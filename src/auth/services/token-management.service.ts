import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthTokenType } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TokenManagementService {
  constructor(private readonly prisma: PrismaService) {}

  generateOpaqueToken(): string {
    return randomBytes(48).toString('hex');
  }

  async issueToken(
    userId: string,
    type: AuthTokenType,
    expiresInMs: number,
  ): Promise<string> {
    const rawToken = this.generateOpaqueToken();
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.authToken.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        type,
        expires_at: new Date(Date.now() + expiresInMs),
      },
    });

    return rawToken;
  }

  async validateAndRevokeToken(
    userId: string,
    rawToken: string,
    type: AuthTokenType,
  ): Promise<true> {
    const tokenHash = this.hashToken(rawToken);
    const storedToken = await this.prisma.authToken.findFirst({
      where: {
        user_id: userId,
        token_hash: tokenHash,
        type,
      },
    });

    if (!storedToken || storedToken.expires_at <= new Date()) {
      if (storedToken) {
        await this.prisma.authToken.delete({ where: { id: storedToken.id } });
      }
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.prisma.authToken.delete({ where: { id: storedToken.id } });
    return true;
  }

  async consumeToken(rawToken: string, type: AuthTokenType): Promise<string> {
    const tokenHash = this.hashToken(rawToken);
    const storedToken = await this.prisma.authToken.findUnique({
      where: { token_hash: tokenHash },
      select: {
        id: true,
        user_id: true,
        type: true,
        expires_at: true,
      },
    });

    if (!storedToken || storedToken.type !== type) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (storedToken.expires_at <= new Date()) {
      await this.prisma.authToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.prisma.authToken.delete({ where: { id: storedToken.id } });
    return storedToken.user_id;
  }

  async revokeTokenIfExists(
    rawToken: string,
    type: AuthTokenType,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.authToken.deleteMany({
      where: {
        token_hash: tokenHash,
        type,
      },
    });
  }

  async revokeAllUserTokens(
    userId: string,
    type: AuthTokenType,
  ): Promise<void> {
    await this.prisma.authToken.deleteMany({
      where: {
        user_id: userId,
        type,
      },
    });
  }

  // Cleanup query equivalent:
  // DELETE FROM auth_tokens WHERE expires_at < NOW();
  async deleteExpiredTokens(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.authToken.deleteMany({
      where: {
        expires_at: {
          lt: now,
        },
      },
    });

    return result.count;
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
