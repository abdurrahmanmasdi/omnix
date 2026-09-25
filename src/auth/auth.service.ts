import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(signupDto: SignupDto) {
    return this.prisma.$transaction(async (tx) => {
      // By using unique constraint, we don't necessarily need to check first, but we can.
      const existingUser = await tx.user.findUnique({
        where: { email: signupDto.email },
      });

      if (existingUser)
        throw new ConflictException('A user with this email already exists');

      const hashedPassword = await bcrypt.hash(signupDto.password, 10);
      const user = await tx.user.create({
        data: {
          email: signupDto.email,
          password_hash: hashedPassword,
          firstName: signupDto.firstName,
          lastName: signupDto.lastName,
          status: 'PENDING',
        },
      });

      // 1. Generate an Email Verification Token (Expires in 1 hour)
      const emailVerificationToken = this.jwtService.sign(
        { email: user.email },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: '1h',
        },
      );

      // 2. SIMULATE SENDING EMAIL (In production, use Resend, Sendgrid, AWS SES, etc.)
      console.log(
        `\n📧 [EMAIL SIMULATION] Verification email queued for user ${user.id}\n`,
      );

      return this.generateTokens(
        user.id,
        user.email,
        null,
        null,
        user.firstName,
        user.lastName,
        undefined,
        undefined,
        undefined,
        tx,
      );
    });
  }

  // --- NEW: Verify Email Method ---
  async verifyEmail(token: string) {
    try {
      // 1. Decode and verify the token
      const payload = this.jwtService.verify<{ email: string }>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      // 2. Update the user in the database
      const user = await this.prisma.user.findFirst({
        where: { email: payload.email },
      });
      if (!user) throw new UnauthorizedException('User not found');

      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE' },
      });

      return { message: 'Email successfully verified!' };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
  }

  async login(loginDto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: loginDto.email },
      include: {
        memberships: {
          where: { status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { role: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password_hash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credentials');

    // Deterministic organization selection: oldest active membership
    const activeMembership = user.memberships[0];
    const organizationId = activeMembership?.organizationId || null;
    const roleId = activeMembership?.roleId || null;

    return this.generateTokens(
      user.id,
      user.email,
      organizationId,
      roleId,
      user.firstName,
      user.lastName,
      userAgent,
      ip,
    );
  }

  async refreshTokens(refreshToken: string, userAgent?: string, ip?: string) {
    let payload: any;
    try {
      // 1. Verify the token signature mathematically
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { familyId, nonce } = payload;
    if (!familyId || !nonce) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const tokenHash = crypto.createHash('sha256').update(nonce).digest('hex');

    // Atomic refresh: lookup, validate, revoke old, create new — all in one tx
    const txResult = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { familyId, tokenHash },
      });

      if (!session) {
        // Token not found -> already rotated -> REUSE DETECTED
        await tx.session.updateMany({
          where: { familyId },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Reused token detected',
          },
        });
        return { error: 'Session revoked due to token reuse' };
      }

      if (session.isRevoked) {
        // A revoked token being presented -> REUSE DETECTED -> revoke whole family
        await tx.session.updateMany({
          where: { familyId, isRevoked: false },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Reused token detected (revoked session presented)',
          },
        });
        return { error: 'Session revoked due to token reuse' };
      }

      if (session.expiresAt < new Date()) {
        return { error: 'Session expired' };
      }

      const user = await tx.user.findUnique({
        where: { id: session.userId },
        include: {
          memberships: {
            where: { status: 'ACTIVE', deletedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!user) return { error: 'User not found' };

      // Deterministic selection
      const activeMembership = user.memberships[0];
      const organizationId = activeMembership?.organizationId || null;
      const roleId = activeMembership?.roleId || null;

      // Revoke old session atomically within the same tx
      await tx.session.update({
        where: { id: session.id },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'Rotated',
        },
      });

      // Generate new tokens (session creation also happens inside tx)
      return this.generateTokens(
        user.id,
        user.email,
        organizationId,
        roleId,
        user.firstName,
        user.lastName,
        userAgent,
        ip,
        familyId,
        tx,
      );
    });

    if (txResult && 'error' in txResult) {
      throw new UnauthorizedException(txResult.error);
    }

    return txResult;
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      const { familyId, nonce } = payload;
      if (familyId && nonce) {
        const tokenHash = crypto
          .createHash('sha256')
          .update(nonce)
          .digest('hex');
        await this.prisma.session.updateMany({
          where: { familyId, tokenHash, isRevoked: false },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Logout',
          },
        });
      }
    } catch (e) {
      // Ignore if token is already invalid
    }
  }

  async generateTokens(
    userId: string,
    email: string,
    organizationId: string | null,
    roleId: string | null,
    firstName: string,
    lastName: string,
    userAgent?: string,
    ip?: string,
    existingFamilyId?: string,
    txClient?: any,
  ) {
    const tx = txClient || this.prisma;
    const payload = {
      sub: userId,
      email,
      organizationId,
      roleId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),

      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION') as any,
    });

    // Create session
    const familyId = existingFamilyId || crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(nonce).digest('hex');

    const refreshPayload = {
      familyId,
      nonce,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),

      expiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRATION',
      ) as any,
    });

    // Parse expiration
    const expiresInStr =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const days = parseInt(expiresInStr) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await tx.session.create({
      data: {
        userId,
        familyId,
        tokenHash,
        expiresAt,
        deviceMetadata: { userAgent, ip },
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        firstName,
        lastName,
        organizationId,
        hasCompletedOnboarding: !!organizationId, // Useful boolean for your frontend!
      },
    };
  }
}
