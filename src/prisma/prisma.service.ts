import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private configService: ConfigService) {
    // 1. Create a connection pool using the native 'pg' driver
    // 1. Safely get the URL from the ConfigService
    const connectionString = configService.get<string>('DATABASE_URL');

    const pool = new Pool({
      connectionString: connectionString,
    });

    // 2. Wrap the pool in Prisma's adapter
    const adapter = new PrismaPg(
      pool as unknown as ConstructorParameters<typeof PrismaPg>[0],
    );

    // 3. Pass the adapter to the PrismaClient
    super({ adapter });
  }

  // Connects to the database when the NestJS app starts
  async onModuleInit() {
    await this.$connect();
  }

  // Disconnects cleanly when the app shuts down
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
