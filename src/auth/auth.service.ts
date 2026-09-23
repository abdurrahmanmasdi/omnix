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
      console.log(`\n📧 [EMAIL SIMULATION] To: ${user.email}`);
      console.log(
        `Please click here to verify your email: http://localhost:3000/api/auth/verify-email?token=${emailVerificationToken}\n`,
      );

      return this.generateTokens(
        user.id,
        user.email,
        null,
        null,
        user.firstName,
        user.lastName,
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

    // Hash the nonce to find the session
    const tokenHash = crypto.createHash('sha256').update(nonce).digest('hex');

    const session = await this.prisma.session.findFirst({
      where: { familyId, tokenHash },
    });

    if (!session) {
      // Reuse detected! Token is valid but not in DB (probably already used and rotated).
      // Revoke the whole family.
      await this.prisma.session.updateMany({
        where: { familyId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'Reused token detected',
        },
      });
      throw new UnauthorizedException('Session revoked due to token reuse');
    }

    if (session.isRevoked) {
      throw new UnauthorizedException('Session is revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    // 2. Make sure the user still exists and membership is valid
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    // Deterministic selection
    const activeMembership = user.memberships[0];
    const organizationId = activeMembership?.organizationId || null;
    const roleId = activeMembership?.roleId || null;

    // Revoke the old token (rotation)
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'Rotated',
      },
    });

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
    );
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
  ) {
    const payload = {
      sub: userId,
      email,
      organizationId,
      roleId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

    await this.prisma.session.create({
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
