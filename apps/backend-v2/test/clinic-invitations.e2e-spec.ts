import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvitationsService } from '../src/auth/invitations.service';
import * as bcrypt from 'bcrypt';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { safeDeploy } from '../src/credentials/deploy-cli';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { provisionOrganizationRolesAndPermissions } from '../src/auth/permission.provisioning';

jest.setTimeout(120_000);
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
let admin: Client;
let dbName: string;
let app: INestApplication;
let prisma: PrismaService;
let invitations: InvitationsService;

beforeAll(async () => {
  const url = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!url || new URL(url).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: url });
  await admin.connect();
  dbName = 'omnidesk_s02_' + randomUUID().replace(/-/g, '');
  await admin.query(`CREATE DATABASE "${dbName}"`);

  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  const isolatedUrl = parsed.toString();
  process.env.DATABASE_URL = isolatedUrl;

  await safeDeploy(resolve(__dirname, '..'));

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  prisma = app.get(PrismaService);
  invitations = app.get(InvitationsService);
});

afterAll(async () => {
  if (app) await app.close();
  if (!admin) return;
  await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.end();
});

describe('Clinic Invitations (e2e)', () => {
  it('should allow clinic owner to issue and new user to accept invitation', async () => {
    return system(async () => {
      // 1. Create a clinic and owner
      const owner = await prisma.user.create({
        data: {
          email: `owner-${Date.now()}@test.com`,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Owner',
          lastName: 'Test',
          status: 'ACTIVE',
        },
      });

      const org = await prisma.organization.create({
        data: {
          name: 'Test Clinic',
          slug: `test-clinic-${Date.now()}`,
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'Agent',
          organizationId: org.id,
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: owner.id,
          organizationId: org.id,
          roleId: role.id,
          status: 'ACTIVE',
        },
      });

      // 2. Issue invitation
      const newEmail = `staff-${Date.now()}@test.com`;
      const issueResult = await invitations.issueClinicInvitation(
        { email: newEmail, roleId: role.id },
        owner.id,
        org.id,
      );

      expect(issueResult.token).toBeDefined();

      // 3. Accept via HTTP as a new user
      const acceptRes = await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: issueResult.token,
          firstName: 'Staff',
          lastName: 'Test',
          password: 'securepassword123',
        })
        .expect(200);

      expect(acceptRes.body.message).toEqual('Clinic invitation accepted.');
      expect(acceptRes.body.organizationId).toEqual(org.id);

      // 4. Verify user was created and joined clinic
      const staff = await prisma.user.findUnique({
        where: { email: newEmail },
      });
      expect(staff).toBeDefined();
      expect(staff!.status).toEqual('ACTIVE');
      expect(staff!.firstName).toEqual('Staff');

      const membership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: { userId: staff!.id, organizationId: org.id },
        },
      });
      expect(membership).toBeDefined();
      expect(membership!.roleId).toEqual(role.id);
      expect(membership!.status).toEqual('ACTIVE');

      // 5. The new staff member logs straight into the inviting clinic (not onboarding)
      const loginRes = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: newEmail, password: 'securepassword123' })
        .expect(200);
      expect(loginRes.body.user.organizationId).toEqual(org.id);
      expect(loginRes.body.user.hasCompletedOnboarding).toBe(true);
    });
  });

  it('should allow existing user to accept clinic invitation with JWT', async () => {
    return system(async () => {
      // 1. Create a clinic and owner
      const owner = await prisma.user.create({
        data: {
          email: `owner2-${Date.now()}@test.com`,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Owner2',
          lastName: 'Test',
          status: 'ACTIVE',
        },
      });

      const org = await prisma.organization.create({
        data: {
          name: 'Test Clinic 2',
          slug: `test-clinic-2-${Date.now()}`,
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'Agent',
          organizationId: org.id,
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: owner.id,
          organizationId: org.id,
          roleId: role.id,
          status: 'ACTIVE',
        },
      });

      // 2. Create existing active user with another clinic
      const org3 = await prisma.organization.create({
        data: { name: 'Test Clinic 3', slug: `test-clinic-3-${Date.now()}` },
      });
      const role3 = await prisma.role.create({
        data: { name: 'Agent', organizationId: org3.id },
      });
      const existingUserEmail = `existing-${Date.now()}@test.com`;
      const existingUser = await prisma.user.create({
        data: {
          email: existingUserEmail,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Existing',
          lastName: 'User',
          status: 'ACTIVE',
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: existingUser.id,
          organizationId: org3.id,
          roleId: role3.id,
          status: 'ACTIVE',
        },
      });

      // 3. Issue invitation
      const issueResult = await invitations.issueClinicInvitation(
        { email: existingUserEmail, roleId: role.id },
        owner.id,
        org.id,
      );

      // 4. Generate JWT for existing user
      const jwtService = app.get(JwtService);
      const token = jwtService.sign(
        {
          sub: existingUser.id,
          email: existingUserEmail,
          organizationId: org3.id,
          roleId: role3.id,
          securityVersion: 1,
        },
        { secret: process.env.JWT_ACCESS_SECRET },
      );

      // 5. Accept via HTTP as an existing logged-in user
      const acceptRes = await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .set('Authorization', `Bearer ${token}`)
        .send({
          token: issueResult.token,
        });

      if (acceptRes.status !== 200) {
        console.error(acceptRes.body);
      }
      expect(acceptRes.status).toEqual(200);
      expect(acceptRes.body.message).toEqual('Clinic invitation accepted.');

      // 6. Verify user joined clinic
      const membership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId: org.id,
          },
        },
      });
      expect(membership).toBeDefined();
      expect(membership!.roleId).toEqual(role.id);
    });
  });

  const clinicWithRoles = async (label: string) => {
    const org = await prisma.organization.create({
      data: {
        name: `Clinic ${label}`,
        slug: `clinic-${label}-${randomUUID()}`,
      },
    });
    const roles = await prisma.$transaction((tx) =>
      provisionOrganizationRolesAndPermissions(tx, org.id),
    );
    const owner = await prisma.user.create({
      data: {
        email: `owner-${label}-${randomUUID()}@test.com`,
        password_hash: await bcrypt.hash('password123', 10),
        firstName: 'Owner',
        lastName: label,
        status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: owner.id,
        organizationId: org.id,
        roleId: roles.get('Super Admin')!.id,
        status: 'ACTIVE',
      },
    });
    return { org, roles, owner };
  };

  it('never lets an invitation activate an identity that is PENDING elsewhere (KI-027)', async () => {
    return system(async () => {
      const clinicA = await clinicWithRoles('pending-a');
      const clinicB = await clinicWithRoles('pending-b');
      const email = `pending-${randomUUID()}@test.com`;
      // Identity created (PENDING) by clinic A's invitation; the invitee hasn't activated yet.
      await invitations.issueClinicInvitation(
        { email, roleId: clinicA.roles.get('Agent')!.id },
        clinicA.owner.id,
        clinicA.org.id,
      );
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });

      // Clinic B invites the same email and tries to set the password itself.
      const issued = await invitations.issueClinicInvitation(
        { email, roleId: clinicB.roles.get('Agent')!.id },
        clinicB.owner.id,
        clinicB.org.id,
      );
      expect(issued.createsAccount).toBe(false);
      await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: issued.token,
          firstName: 'Mal',
          lastName: 'Lory',
          password: 'attacker-password-1',
        })
        .expect(403);

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.status).toBe('PENDING');
      expect(after.password_hash).toBe(before.password_hash);
      expect(
        await prisma.organizationMembership.count({
          where: { userId: after.id, organizationId: clinicB.org.id },
        }),
      ).toBe(0);
    });
  });

  it('never lets an invitation activate an operator-issued PENDING pilot identity', async () => {
    return system(async () => {
      const clinic = await clinicWithRoles('pilot-pending');
      const email = `pilot-${randomUUID()}@test.com`;
      await invitations.issue(email, 'operator-test');
      const issued = await invitations.issueClinicInvitation(
        { email, roleId: clinic.roles.get('Agent')!.id },
        clinic.owner.id,
        clinic.org.id,
      );
      expect(issued.createsAccount).toBe(false);
      await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: issued.token,
          firstName: 'Mal',
          lastName: 'Lory',
          password: 'attacker-password-1',
        })
        .expect(403);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.status).toBe('PENDING');
    });
  });

  it('lets the creating clinic re-issue for its own pending identity', async () => {
    return system(async () => {
      const clinic = await clinicWithRoles('reissue');
      const email = `reissue-${randomUUID()}@test.com`;
      const first = await invitations.issueClinicInvitation(
        { email, roleId: clinic.roles.get('Agent')!.id },
        clinic.owner.id,
        clinic.org.id,
      );
      expect(first.createsAccount).toBe(true);
      const second = await invitations.issueClinicInvitation(
        { email, roleId: clinic.roles.get('Agent')!.id },
        clinic.owner.id,
        clinic.org.id,
      );
      expect(second.createsAccount).toBe(true);
      await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: first.token,
          firstName: 'Old',
          lastName: 'Token',
          password: 'staff-password-1',
        })
        .expect(401);
      await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: second.token,
          firstName: 'New',
          lastName: 'Staff',
          password: 'staff-password-1',
        })
        .expect(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.status).toBe('ACTIVE');
    });
  });

  it('requires the existing ACTIVE invitee to be logged in as themselves', async () => {
    return system(async () => {
      const clinic = await clinicWithRoles('active-needs-login');
      const email = `active-${randomUUID()}@test.com`;
      const existing = await prisma.user.create({
        data: {
          email,
          password_hash: await bcrypt.hash('original-password', 10),
          firstName: 'Real',
          lastName: 'Owner',
          status: 'ACTIVE',
        },
      });
      const issued = await invitations.issueClinicInvitation(
        { email, roleId: clinic.roles.get('Agent')!.id },
        clinic.owner.id,
        clinic.org.id,
      );
      expect(issued.createsAccount).toBe(false);
      await request(app.getHttpServer() as Server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: issued.token,
          firstName: 'Mal',
          lastName: 'Lory',
          password: 'attacker-password-1',
        })
        .expect(401);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: existing.id },
      });
      expect(after.password_hash).toBe(existing.password_hash);
      expect(
        await prisma.organizationMembership.count({
          where: { userId: existing.id, organizationId: clinic.org.id },
        }),
      ).toBe(0);
    });
  });

  it('refuses to let an issuer grant a role with permissions they lack', async () => {
    return system(async () => {
      const clinic = await clinicWithRoles('role-cap');
      // A coordinator: Agent role plus an override that lets them invite.
      const coordinator = await prisma.user.create({
        data: {
          email: `coordinator-${randomUUID()}@test.com`,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Co',
          lastName: 'Ordinator',
          status: 'ACTIVE',
        },
      });
      const membership = await prisma.organizationMembership.create({
        data: {
          userId: coordinator.id,
          organizationId: clinic.org.id,
          roleId: clinic.roles.get('Agent')!.id,
          status: 'ACTIVE',
        },
      });
      const manage = await prisma.permission.findUniqueOrThrow({
        where: { action: 'organization:manage' },
      });
      await prisma.membershipPermissionOverride.create({
        data: {
          membershipId: membership.id,
          permissionId: manage.id,
          is_granted: true,
        },
      });

      await expect(
        invitations.issueClinicInvitation(
          {
            email: `escalate-${randomUUID()}@test.com`,
            roleId: clinic.roles.get('Manager')!.id,
          },
          coordinator.id,
          clinic.org.id,
        ),
      ).rejects.toMatchObject({ status: 403 });
      // Same-or-lower role is still allowed.
      await expect(
        invitations.issueClinicInvitation(
          {
            email: `peer-${randomUUID()}@test.com`,
            roleId: clinic.roles.get('Agent')!.id,
          },
          coordinator.id,
          clinic.org.id,
        ),
      ).resolves.toMatchObject({ createsAccount: true });
    });
  });

  const access = (
    user: { id: string; email: string },
    organizationId: string,
    roleId: string,
  ) =>
    app.get(JwtService).sign(
      {
        sub: user.id,
        email: user.email,
        organizationId,
        roleId,
        securityVersion: 1,
      },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  it('N3 lists only current clinic members/invitations and refuses cross-clinic revocation', async () =>
    system(async () => {
      const a = await clinicWithRoles('team-a');
      const b = await clinicWithRoles('team-b');
      const tokenA = access(a.owner, a.org.id, a.roles.get('Super Admin')!.id);
      const tokenB = access(b.owner, b.org.id, b.roles.get('Super Admin')!.id);
      const server = app.getHttpServer() as Server;
      const members = await request(server)
        .get('/organizations/current/members')
        .query({ organizationId: b.org.id })
        .auth(tokenA, { type: 'bearer' })
        .expect(200);
      expect(members.body).toHaveLength(1);
      expect(members.body[0]).toMatchObject({
        userId: a.owner.id,
        email: a.owner.email,
        status: 'ACTIVE',
        roleName: 'Super Admin',
        joinedAt: expect.any(String),
      });
      const issuedA = await request(server)
        .post('/auth/invitations/clinic')
        .auth(tokenA, { type: 'bearer' })
        .send({
          email: `team-a-${randomUUID()}@example.invalid`,
          roleId: a.roles.get('Agent')!.id,
        })
        .expect(201);
      const issuedB = await request(server)
        .post('/auth/invitations/clinic')
        .auth(tokenB, { type: 'bearer' })
        .send({
          email: `team-b-${randomUUID()}@example.invalid`,
          roleId: b.roles.get('Agent')!.id,
        })
        .expect(201);
      const list = await request(server)
        .get('/organizations/current/invitations')
        .auth(tokenA, { type: 'bearer' })
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        id: issuedA.body.invitationId,
        roleName: 'Agent',
        issuer: 'Owner team-a',
      });
      expect(
        Object.keys(list.body[0] as Record<string, unknown>).sort(),
      ).toEqual(['email', 'expiresAt', 'id', 'issuer', 'roleName']);
      await request(server)
        .post(
          `/organizations/current/invitations/${issuedB.body.invitationId}/revoke`,
        )
        .auth(tokenA, { type: 'bearer' })
        .expect(404);
      await request(server)
        .post(
          `/organizations/current/invitations/${issuedA.body.invitationId}/revoke`,
        )
        .auth(tokenA, { type: 'bearer' })
        .expect(200, { revoked: true });
      await request(server)
        .post('/auth/invitations/clinic/accept')
        .send({
          token: issuedA.body.token,
          firstName: 'Synthetic',
          lastName: 'Staff',
          password: 'SyntheticPassword123',
        })
        .expect(401);
      const pending = await request(server)
        .get('/organizations/current/invitations')
        .auth(tokenA, { type: 'bearer' })
        .expect(200);
      expect(pending.body).toEqual([]);
      const event = await prisma.accountActivationEvent.findFirst({
        where: {
          invitationId: issuedA.body.invitationId as string,
          action: 'REVOKED',
        },
      });
      expect(event?.actor).toBe(a.owner.id);
    }));

  it('N3 denies team endpoints without organization:manage, including list and revoke', async () =>
    system(async () => {
      const clinic = await clinicWithRoles('team-denied');
      const staff = await prisma.user.create({
        data: {
          email: `team-denied-${randomUUID()}@example.invalid`,
          firstName: 'Restricted',
          lastName: 'Staff',
          password_hash: '!synthetic',
          status: 'ACTIVE',
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: staff.id,
          organizationId: clinic.org.id,
          roleId: clinic.roles.get('Agent')!.id,
          status: 'ACTIVE',
        },
      });
      const token = access(staff, clinic.org.id, clinic.roles.get('Agent')!.id);
      const server = app.getHttpServer() as Server;
      for (const path of ['members', 'invitations', 'roles']) {
        await request(server)
          .get(`/organizations/current/${path}`)
          .auth(token, { type: 'bearer' })
          .expect(403);
        await request(server).get(`/organizations/current/${path}`).expect(401);
      }
      await request(server)
        .post(`/organizations/current/invitations/${randomUUID()}/revoke`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      await request(server)
        .post('/auth/invitations/clinic')
        .auth(token, { type: 'bearer' })
        .send({
          email: `denied-${randomUUID()}@example.invalid`,
          roleId: clinic.roles.get('Agent')!.id,
        })
        .expect(403);
      const self = await request(server)
        .get('/users/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(self.body.memberships[0].canManageTeam).toBe(false);
    }));

  it('N3 grantable roles honor permission overrides and omit expired/consumed pending rows', async () =>
    system(async () => {
      const clinic = await clinicWithRoles('team-grants');
      const staff = await prisma.user.create({
        data: {
          email: `team-grants-${randomUUID()}@example.invalid`,
          firstName: 'Grant',
          lastName: 'Staff',
          password_hash: '!synthetic',
          status: 'ACTIVE',
        },
      });
      const membership = await prisma.organizationMembership.create({
        data: {
          userId: staff.id,
          organizationId: clinic.org.id,
          roleId: clinic.roles.get('Agent')!.id,
          status: 'ACTIVE',
        },
      });
      const manage = await prisma.permission.findUniqueOrThrow({
        where: { action: 'organization:manage' },
      });
      await prisma.membershipPermissionOverride.create({
        data: {
          membershipId: membership.id,
          permissionId: manage.id,
          is_granted: true,
        },
      });
      const token = access(staff, clinic.org.id, clinic.roles.get('Agent')!.id);
      const server = app.getHttpServer() as Server;
      const roles = await request(server)
        .get('/organizations/current/roles')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(roles.body).toEqual([
        { id: clinic.roles.get('Agent')!.id, name: 'Agent' },
      ]);
      const self = await request(server)
        .get('/users/me')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(self.body.memberships[0].canManageTeam).toBe(true);
      const grant = await prisma.permission.findUniqueOrThrow({
        where: { action: 'leads:manage' },
      });
      await prisma.membershipPermissionOverride.create({
        data: {
          membershipId: membership.id,
          permissionId: grant.id,
          is_granted: false,
        },
      });
      const none = await request(server)
        .get('/organizations/current/roles')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(none.body).toEqual([]);
      const expired = await invitations.issueClinicInvitation(
        {
          email: `expired-${randomUUID()}@example.invalid`,
          roleId: clinic.roles.get('Agent')!.id,
        },
        clinic.owner.id,
        clinic.org.id,
      );
      await prisma.accountInvitation.update({
        where: { id: expired.invitationId },
        data: { expiresAt: new Date(0) },
      });
      const list = await request(server)
        .get('/organizations/current/invitations')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(list.body).toEqual([]);
    }));
  const teamActor = async (
    clinic: Awaited<ReturnType<typeof clinicWithRoles>>,
    roleName: string,
  ) => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        password_hash: '!synthetic',
        firstName: 'Synthetic',
        lastName: 'Member',
        status: 'ACTIVE',
      },
    });
    const member = await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: clinic.org.id,
        roleId: clinic.roles.get(roleName)!.id,
        status: 'ACTIVE',
      },
    });
    const token = app.get(JwtService).sign(
      {
        sub: user.id,
        email: user.email,
        organizationId: clinic.org.id,
        roleId: member.roleId,
        securityVersion: 1,
      },
      { secret: process.env.JWT_ACCESS_SECRET!, expiresIn: '15m' },
    );
    return { user, member, token };
  };
  it('N5 changes roles/removes members, invalidates existing tokens and audits ids only', async () =>
    system(async () => {
      const clinic = await clinicWithRoles('n5-success');
      const actor = await teamActor(clinic, 'Super Admin');
      const target = await teamActor(clinic, 'Manager');
      await prisma.session.createMany({
        data: [1, 2].map((i) => ({
          userId: target.user.id,
          tokenHash: randomUUID(),
          familyId: `synthetic-family-${i}`,
          expiresAt: new Date(Date.now() + 3600000),
        })),
      });
      const server = app.getHttpServer() as Server;
      await request(server)
        .patch(`/organizations/current/members/${target.member.id}`)
        .auth(actor.token, { type: 'bearer' })
        .send({ roleId: clinic.roles.get('Agent')!.id })
        .expect(200, { changed: true });
      await request(server)
        .get('/organizations/current/members')
        .auth(target.token, { type: 'bearer' })
        .expect(401);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: target.user.id } }))
          .securityVersion,
      ).toBe(2);
      expect(
        await prisma.session.count({
          where: { userId: target.user.id, isRevoked: true },
        }),
      ).toBe(2);
      const removed = await teamActor(clinic, 'Agent');
      await request(server)
        .delete(`/organizations/current/members/${removed.member.id}`)
        .auth(actor.token, { type: 'bearer' })
        .expect(200);
      await request(server)
        .get('/organizations/current/members')
        .auth(removed.token, { type: 'bearer' })
        .expect(401);
      expect(
        (
          await prisma.organizationMembership.findUniqueOrThrow({
            where: { id: removed.member.id },
          })
        ).deletedAt,
      ).not.toBeNull();
      const logs = await prisma.auditLog.findMany({
        where: { organizationId: clinic.org.id, actor: actor.user.id },
      });
      expect(logs.map((l) => l.action).sort()).toEqual([
        'membership.removed',
        'membership.role_changed',
      ]);
      expect(
        logs.find((l) => l.action === 'membership.role_changed')?.metadata,
      ).toEqual({
        oldRoleId: target.member.roleId,
        newRoleId: clinic.roles.get('Agent')!.id,
      });
      expect(JSON.stringify(logs)).not.toContain(target.user.email);
    }));
  it('N5 rejects Manager, cross-clinic ids, self actions and invalid roles', async () =>
    system(async () => {
      const clinic = await clinicWithRoles('n5-denied');
      const other = await clinicWithRoles('n5-other');
      const actor = await teamActor(clinic, 'Super Admin');
      const manager = await teamActor(clinic, 'Manager');
      const foreign = await teamActor(other, 'Agent');
      const server = app.getHttpServer() as Server;
      for (const verb of ['patch', 'delete'] as const) {
        await request(server)
          [verb](`/organizations/current/members/${actor.member.id}`)
          .auth(manager.token, { type: 'bearer' })
          .send({ roleId: clinic.roles.get('Agent')!.id })
          .expect(403);
        await request(server)
          [verb](`/organizations/current/members/${foreign.member.id}`)
          .auth(actor.token, { type: 'bearer' })
          .send({ roleId: clinic.roles.get('Agent')!.id })
          .expect(404);
        const self = await request(server)
          [verb](`/organizations/current/members/${actor.member.id}`)
          .auth(actor.token, { type: 'bearer' })
          .send({ roleId: clinic.roles.get('Agent')!.id })
          .expect(409);
        expect(self.body.code).toBe('TEAM_SELF_CHANGE_FORBIDDEN');
      }
      await request(server)
        .patch(`/organizations/current/members/${manager.member.id}`)
        .auth(actor.token, { type: 'bearer' })
        .send({ roleId: other.roles.get('Agent')!.id })
        .expect(404);
    }));
  it('N5 rejects granting permissions denied by overrides and preserves the last active owner', async () =>
    system(async () => {
      const clinic = await clinicWithRoles('n5-last');
      const actor = await teamActor(clinic, 'Agent');
      const manage = await prisma.permission.findUniqueOrThrow({
        where: { action: 'organization:manage' },
      });
      await prisma.membershipPermissionOverride.create({
        data: {
          membershipId: actor.member.id,
          permissionId: manage.id,
          is_granted: true,
        },
      });
      const owner = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: clinic.org.id, userId: clinic.owner.id },
      });
      const server = app.getHttpServer() as Server;
      for (const verb of ['patch', 'delete'] as const) {
        const result = await request(server)
          [verb](`/organizations/current/members/${owner.id}`)
          .auth(actor.token, { type: 'bearer' })
          .send({ roleId: clinic.roles.get('Agent')!.id })
          .expect(409);
        expect(result.body.code).toBe('TEAM_LAST_OWNER_REQUIRED');
      }
      const target = await teamActor(clinic, 'Agent');
      await request(server)
        .patch(`/organizations/current/members/${target.member.id}`)
        .auth(actor.token, { type: 'bearer' })
        .send({ roleId: clinic.roles.get('Manager')!.id })
        .expect(403);
      const deny = await prisma.permission.findUniqueOrThrow({
        where: { action: 'leads:manage' },
      });
      await prisma.membershipPermissionOverride.create({
        data: {
          membershipId: actor.member.id,
          permissionId: deny.id,
          is_granted: false,
        },
      });
      await request(server)
        .patch(`/organizations/current/members/${target.member.id}`)
        .auth(actor.token, { type: 'bearer' })
        .send({ roleId: clinic.roles.get('Agent')!.id })
        .expect(403);
    }));
  it('N5 serializes concurrent owner demotions and permits granting an owner role when fully held', async () =>
    system(async () => {
      const clinic = await clinicWithRoles('n5-race');
      const original = await prisma.organizationMembership.findFirstOrThrow({
        where: { organizationId: clinic.org.id, userId: clinic.owner.id },
      });
      await prisma.organizationMembership.update({
        where: { id: original.id },
        data: { deletedAt: new Date() },
      });
      const a = await teamActor(clinic, 'Super Admin');
      const b = await teamActor(clinic, 'Super Admin');
      const server = app.getHttpServer() as Server;
      const results = await Promise.all([
        request(server)
          .patch(`/organizations/current/members/${b.member.id}`)
          .auth(a.token, { type: 'bearer' })
          .send({ roleId: clinic.roles.get('Agent')!.id }),
        request(server)
          .patch(`/organizations/current/members/${a.member.id}`)
          .auth(b.token, { type: 'bearer' })
          .send({ roleId: clinic.roles.get('Agent')!.id }),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        results.every((r) => [200, 401, 403, 409].includes(r.status)),
      ).toBe(true);
      expect(
        await prisma.organizationMembership.count({
          where: {
            organizationId: clinic.org.id,
            roleId: clinic.roles.get('Super Admin')!.id,
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
      ).toBe(1);
      const surviving = results[0].status === 200 ? a : b;
      const newOwner = await teamActor(clinic, 'Agent');
      await request(server)
        .patch(`/organizations/current/members/${newOwner.member.id}`)
        .auth(surviving.token, { type: 'bearer' })
        .send({ roleId: clinic.roles.get('Super Admin')!.id })
        .expect(200);
    }));
});
