import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_PERMISSIONS } from '../src/constants/permissions.list';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({
  connectionString,
});
const prisma = new PrismaClient({ adapter });

async function seedPermissions() {
  console.log('  📝 Seeding permissions...');
  const createdPermissions = await Promise.all(
    SYSTEM_PERMISSIONS.map((permission) =>
      prisma.permission.upsert({
        where: { action: permission.action },
        update: { description: permission.description },
        create: {
          action: permission.action,
          description: permission.description,
        },
      }),
    ),
  );
  console.log(`  ✅ Seeded ${createdPermissions.length} permissions`);
}

async function main() {
  console.log('🌱 Starting database seed...');

  try {
    await seedPermissions();
    console.log('✅ Database seed completed successfully');
  } catch (error) {
    console.error('❌ Error during seed:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
