import { provisionRolePermissions } from "../src/auth/permission.provisioning";
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create a Test Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Istanbul Premium Hair & Dental',
      slug: 'ist-premium-clinic',
      industry_category: 'MEDICAL_TOURISM',
    },
  });

  // 2. Create an Admin Role for this Organization
  const role = await prisma.role.create({
    data: {
      name: 'Super Admin',
      is_system: true,
      organizationId: org.id,
    },
  });

  await provisionRolePermissions(prisma, role.id);

  // 3. Create a User with a securely hashed password
  const hashedPassword = await bcrypt.hash('password123', 10);
  const user = await prisma.user.create({
    data: {
      email: 'admin@clinic.com',
      password_hash: hashedPassword,
      firstName: 'Ahmed',
      lastName: 'Founder',
      isEmailVerified: true,
    },
  });

  // 4. Link the User to the Organization via Membership
  await prisma.organizationMembership.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      roleId: role.id,
      status: 'ACTIVE',
      agentTier: 'MANAGER',
    },
  });

  console.log('✅ Database seeded successfully!');
  console.log('-----------------------------------');
  console.log('📧 Test Email: admin@clinic.com');
  console.log('🔑 Test Password: password123');
  console.log('🏢 Organization ID:', org.id);
  console.log('-----------------------------------');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
