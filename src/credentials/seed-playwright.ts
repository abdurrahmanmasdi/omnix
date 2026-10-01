import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hash } from 'bcrypt';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const hashedPassword = await hash('password123', 10);
  
  // User A (Owner)
  const userA = await prisma.user.create({
    data: { id: randomUUID(), email: 'a@example.com', password_hash: hashedPassword, firstName: 'User', lastName: 'A', status: 'ACTIVE' }
  });

  // User B (Staff)
  const userB = await prisma.user.create({
    data: { id: randomUUID(), email: 'b@example.com', password_hash: hashedPassword, firstName: 'User', lastName: 'B', status: 'ACTIVE' }
  });

  // Clinic
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: 'Playwright Clinic', slug: 'playwright-clinic' }
  });

  // Roles
  const ownerRole = await prisma.role.create({
    data: { id: randomUUID(), organizationId: org.id, name: 'Owner' }
  });
  const staffRole = await prisma.role.create({
    data: { id: randomUUID(), organizationId: org.id, name: 'Staff' }
  });

  // Add all permissions to Owner
  const permissions = ['view_conversations', 'leads:read:all', 'leads:read:pii', 'leads:read:messages', 'notifications:view', 'leads:view'];
  for (const action of permissions) {
    let p = await prisma.permission.findUnique({ where: { action } });
    if (!p) p = await prisma.permission.create({ data: { id: randomUUID(), action, description: action } });
    await prisma.rolePermission.create({ data: { roleId: ownerRole.id, permissionId: p.id } });
  }

  // Memberships
  await prisma.organizationMembership.create({ data: { id: randomUUID(), userId: userA.id, organizationId: org.id, roleId: ownerRole.id, status: 'ACTIVE' } });
  await prisma.organizationMembership.create({ data: { id: randomUUID(), userId: userB.id, organizationId: org.id, roleId: staffRole.id, status: 'ACTIVE' } });

  // Leads
  await prisma.lead.create({
    data: {
      id: randomUUID(),
      organizationId: org.id,
      firstName: 'Lead For User',
      lastName: 'A',
      email: 'leada@example.com',
      assignedAgentId: userA.id,
      phoneNumber: '+15551234567',
      country: 'US',
      timezone: 'UTC',
      primaryLanguage: 'en',
    }
  });

  console.log('Seeded Playwright database');
}

main().catch(console.error).finally(() => prisma.$disconnect());
