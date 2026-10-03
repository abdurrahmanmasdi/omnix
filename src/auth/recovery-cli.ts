import 'dotenv/config';
import { parseArgs } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      operator: { type: 'string' },
      origin: { type: 'string' },
    },
  });
  if (!values.operator || !values.email || !values.origin) {
    throw new Error('Provide --operator, --email, and --origin');
  }
  const prisma = new PrismaService();
  const jwt = new JwtService({});
  const config = new ConfigService();
  try {
    const auth = new AuthService(prisma, jwt, config);
    const { token } = await auth.issueRecovery(values.email, values.operator);
    const link = `${values.origin}/recover#token=${token}`;
    console.log(`RECOVERY_LINK_GENERATED\n\n${link}\n\nDeliver this link via secure operational channel.`);
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
