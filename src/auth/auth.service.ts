import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    // 1. Find the user in the database
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Compare the plain-text password with the database hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Create the token payload (usually the user ID and email)
    // In JWT terminology, 'sub' (subject) is the standard claim for the user ID
    const payload = { sub: user.id, email: user.email };

    // 4. Sign and return the token
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
