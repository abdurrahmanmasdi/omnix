import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
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
    const existingUser = await this.prisma.user.findFirst({
      where: { email: signupDto.email },
    });

    if (existingUser)
      throw new ConflictException('A user with this email already exists');

    const hashedPassword = await bcrypt.hash(signupDto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: signupDto.email,
        password_hash: hashedPassword,
        firstName: signupDto.firstName,
        lastName: signupDto.lastName,
        isEmailVerified: false,
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
        data: { isEmailVerified: true },
      });

      return { message: 'Email successfully verified!' };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: loginDto.email },
      include: {
        memberships: {
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

    // If they have no organization yet, these will just safely be null!
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
    );
  }

  async refreshTokens(refreshToken: string) {
    try {
      // 1. Verify the token signature mathematically
      const payload: JwtPayload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // 2. Make sure the user still exists in the database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { memberships: true },
      });

      if (!user) throw new UnauthorizedException('User not found');

      // 3. Issue fresh tokens
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
      );
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  generateTokens(
    userId: string,
    email: string,
    organizationId: string | null,
    roleId: string | null,
    firstName: string,
    lastName: string,
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

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRATION',
      ) as any,
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
