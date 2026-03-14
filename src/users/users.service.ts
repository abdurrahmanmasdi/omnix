import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  async createUser(email: string, passwordRaw: string) {
    // 1. Check if a user with this email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already in use');
    }

    // 2. Hash the password (10 is the standard salt rounds)
    const passwordHash = await bcrypt.hash(passwordRaw, 10);

    // 3. Save the new user to the database
    const newUser = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    // 4. Strip the password hash from the object before returning it
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  }
}
