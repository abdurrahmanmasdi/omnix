/**
 * Synthetic fixtures for the browser permission suite (P1-10).
 *
 *   playwright-fixture.ts seed <fixture.json>      two clinics, personas, patients (random passwords)
 *   playwright-fixture.ts recovery <fixture.json> <userKey> <origin>   prints a recovery link
 *   playwright-fixture.ts downgrade <fixture.json> <userKey>           removes PII + message grants
 *
 * Lives outside src/ so it never ships in the application build. It contains no
 * literal credentials: passwords are generated per run into a mode-0600 file
 * that is git-ignored. Run only against a disposable database.
 */
import { hash } from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { AuthService } from '../src/auth/auth.service';
import { provisionOrganizationRolesAndPermissions } from '../src/auth/permission.provisioning';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

type UserKey = 'ownerA' | 'coordinatorA' | 'restrictedA' | 'ownerB';
interface FixtureUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleName: string;
  clinic: 'A' | 'B';
}
interface FixtureClinic {
  id: string;
  name: string;
  assignedPatient: { first: string; last: string; phone: string; text: string };
  unassignedPatient: {
    first: string;
    last: string;
    phone: string;
    text: string;
  };
  agentRoleId: string;
}
export interface Fixture {
  users: Record<UserKey, FixtureUser>;
  clinics: Record<'A' | 'B', FixtureClinic>;
}

const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
const secret = () => randomBytes(18).toString('base64url');

async function seed(file: string, prisma: PrismaService) {
  const fixture = { users: {}, clinics: {} } as unknown as Fixture;
  const plan: {
    key: UserKey;
    clinic: 'A' | 'B';
    roleName: string;
    first: string;
  }[] = [
    { key: 'ownerA', clinic: 'A', roleName: 'Super Admin', first: 'Owner' },
    {
      key: 'coordinatorA',
      clinic: 'A',
      roleName: 'Manager',
      first: 'Coordinator',
    },
    { key: 'restrictedA', clinic: 'A', roleName: 'Agent', first: 'Restricted' },
    { key: 'ownerB', clinic: 'B', roleName: 'Super Admin', first: 'Owner' },
  ];
  await system(async () => {
    for (const clinic of ['A', 'B'] as const) {
      const run = randomBytes(4).toString('hex');
      const organization = await prisma.organization.create({
        data: { name: `Synthetic Clinic ${clinic} ${run}`, slug: randomUUID() },
      });
      const roles = await prisma.$transaction((tx) =>
        provisionOrganizationRolesAndPermissions(tx, organization.id),
      );
      const patient = (assigned: boolean) => ({
        first: `Patient${clinic}${assigned ? 'Assigned' : 'Open'}`,
        last: `Zz${run}`,
        phone: `+9055${clinic === 'A' ? '1' : '2'}${assigned ? '1' : '2'}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
        text: `synthetic-${clinic}-${assigned ? 'assigned' : 'open'}-${run} private message`,
      });
      fixture.clinics ??= {} as Fixture['clinics'];
      fixture.clinics[clinic] = {
        id: organization.id,
        name: organization.name,
        assignedPatient: patient(true),
        unassignedPatient: patient(false),
        agentRoleId: roles.get('Agent')!.id,
      };
      const members: Partial<Record<UserKey, string>> = {};
      for (const entry of plan.filter((p) => p.clinic === clinic)) {
        const password = secret();
        const user = await prisma.user.create({
          data: {
            email: `${entry.key.toLowerCase()}-${run}@example.invalid`,
            password_hash: await hash(password, 10),
            firstName: entry.first,
            lastName: `Clinic${clinic}`,
            status: 'ACTIVE',
          },
        });
        const membership = await prisma.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            roleId: roles.get(entry.roleName)!.id,
            status: 'ACTIVE',
          },
        });
        members[entry.key] = user.id;
        fixture.users[entry.key] = {
          email: user.email,
          password,
          firstName: entry.first,
          lastName: `Clinic${clinic}`,
          roleName: entry.roleName,
          clinic,
        };
        if (entry.key === 'restrictedA') {
          // Assigned-only (Agent has no leads:read:all) and no PII / message history.
          const perms = await prisma.permission.findMany({
            where: {
              action: { in: ['leads:read:pii', 'leads:read:messages'] },
            },
          });
          await prisma.membershipPermissionOverride.createMany({
            data: perms.map((p) => ({
              membershipId: membership.id,
              permissionId: p.id,
              is_granted: false,
            })),
          });
        }
      }
      for (const assigned of [true, false]) {
        const p = assigned
          ? fixture.clinics[clinic].assignedPatient
          : fixture.clinics[clinic].unassignedPatient;
        const lead = await prisma.lead.create({
          data: {
            organizationId: organization.id,
            firstName: p.first,
            lastName: p.last,
            phoneNumber: p.phone,
            country: 'TR',
            timezone: 'UTC',
            primaryLanguage: 'en',
            // Only clinic A's assigned patient is assigned to the restricted agent.
            assignedAgentId:
              assigned && clinic === 'A' ? members.restrictedA : null,
          },
        });
        const conversation = await prisma.conversation.create({
          data: {
            organizationId: organization.id,
            leadId: lead.id,
            externalContactId: p.phone,
            assignedAgentId:
              assigned && clinic === 'A' ? members.restrictedA : null,
          },
        });
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            content: p.text,
            type: 'LEAD_TEXT',
          },
        });
      }
    }
  });
  const fd = openSync(file, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(fixture, null, 2), 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function load(file: string): Fixture {
  return JSON.parse(readFileSync(file, 'utf8')) as Fixture;
}

async function main() {
  const [command, file, key, origin] = process.argv.slice(2);
  if (!command || !file)
    throw new Error(
      'usage: playwright-fixture.ts <seed|recovery|downgrade> <fixture.json> ...',
    );
  const prisma = new PrismaService();
  try {
    if (command === 'seed') return await seed(file, prisma);
    const user = load(file).users[key as UserKey];
    if (!user) throw new Error('unknown user key');
    if (command === 'recovery') {
      const auth = new AuthService(
        prisma,
        new JwtService({}),
        new ConfigService(),
      );
      const { token } = await system(() =>
        auth.issueRecovery(user.email, 'playwright-fixture'),
      );
      process.stdout.write(
        `${new URL('/recover', origin).toString()}#token=${token}\n`,
      );
      return;
    }
    if (command === 'downgrade') {
      await system(async () => {
        const row = await prisma.user.findUniqueOrThrow({
          where: { email: user.email },
        });
        const membership = await prisma.organizationMembership.findFirstOrThrow(
          {
            where: { userId: row.id, status: 'ACTIVE', deletedAt: null },
          },
        );
        const perms = await prisma.permission.findMany({
          where: {
            action: {
              in: ['leads:read:pii', 'leads:read:messages', 'leads:read:all'],
            },
          },
        });
        for (const p of perms) {
          await prisma.membershipPermissionOverride.upsert({
            where: {
              membershipId_permissionId: {
                membershipId: membership.id,
                permissionId: p.id,
              },
            },
            update: { is_granted: false },
            create: {
              membershipId: membership.id,
              permissionId: p.id,
              is_granted: false,
            },
          });
        }
      });
      return;
    }
    throw new Error('unknown command');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'fixture failed');
  process.exitCode = 1;
});
