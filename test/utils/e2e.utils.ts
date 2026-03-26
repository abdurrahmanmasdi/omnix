/**
 * E2E Test Utilities and Helpers
 *
 * Common functions for test operations, assertions, and API interactions.
 * Promotes DRY principle and code reusability.
 */

import { INestApplication, Logger, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  IAuthResponse,
  IUser,
  IOrganization,
  IOrganizationMembership,
  IRegisterPayload,
  ICreateOrganizationPayload,
  IRoleWithPermissions,
  ICreateRolePayload,
} from '../types/e2e.types';

/**
 * Initialize NestJS application for E2E testing
 */
export async function initializeApp(app: INestApplication): Promise<void> {
  const logger = new Logger('E2E_SETUP');
  logger.log('Initializing NestJS application for E2E tests...');

  // Mirror main.ts routing setup so e2e tests hit the same URLs as runtime.
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.init();
  logger.log('Application initialized successfully');
}

/**
 * Cleanup test data from database
 * Respects foreign key constraints by deleting in correct order
 */
export async function cleanupTestData(
  prismaService: PrismaService | undefined,
  organizationId?: string,
  userId?: string,
): Promise<void> {
  if (!prismaService) {
    return;
  }

  const logger = new Logger('E2E_CLEANUP');

  try {
    logger.log('Starting test data cleanup...');

    // Delete memberships first (respects FK constraint on organization)
    if (organizationId) {
      await prismaService.organizationMembership.deleteMany({
        where: { organization_id: organizationId },
      });
      logger.log(`✓ Deleted memberships for organization: ${organizationId}`);
    }

    // Delete organization
    if (organizationId) {
      await prismaService.organization.delete({
        where: { id: organizationId },
      });
      logger.log(`✓ Deleted organization: ${organizationId}`);
    }

    // Delete user
    if (userId) {
      await prismaService.user.delete({
        where: { id: userId },
      });
      logger.log(`✓ Deleted user: ${userId}`);
    }

    logger.log('Test data cleanup completed successfully');
  } catch (error) {
    const cleanupLogger = new Logger('E2E_CLEANUP_ERROR');
    cleanupLogger.error(`Failed to cleanup test data: ${String(error)}`);
    // Don't throw - allow app to close even if cleanup fails
  }
}

/**
 * Clear all application tables for deterministic E2E runs.
 * This must only run against the dedicated test database.
 * Note: Permissions table is NOT cleared as it contains system data seeded on startup.
 */
export async function clearDatabase(
  prismaService: PrismaService | undefined,
): Promise<void> {
  if (!prismaService) {
    return;
  }

  const logger = new Logger('E2E_DB_RESET');

  try {
    logger.log('Clearing database state before E2E suite...');

    await prismaService.$transaction([
      prismaService.membershipPermissionOverride.deleteMany(),
      prismaService.rolePermission.deleteMany(),
      prismaService.invitation.deleteMany(),
      prismaService.organizationMembership.deleteMany(),
      prismaService.role.deleteMany(),
      // NOTE: Intentionally NOT deleting permissions - they are system data seeded on startup
      // prismaService.permission.deleteMany(),
      prismaService.organization.deleteMany(),
      prismaService.user.deleteMany(),
    ]);

    logger.log('✓ Database cleared successfully');
  } catch (error) {
    const resetLogger = new Logger('E2E_DB_RESET_ERROR');
    resetLogger.error(`Failed to clear database: ${String(error)}`);
    throw error;
  }
}

/**
 * Register a user via POST /api/v1/auth/register
 */
export async function registerUser(
  app: INestApplication,
  payload: IRegisterPayload,
): Promise<IUser> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/register')

    .send(payload)
    .expect(201);

  return response.body as IUser;
}

/**
 * Login user via POST /api/v1/auth/login
 */
export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<IAuthResponse> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')

    .send({ email, password })
    .expect(201);

  return response.body as IAuthResponse;
}

/**
 * Create organization via POST /api/v1/organizations
 */
export async function createOrganization(
  app: INestApplication,
  jwtToken: string,
  payload: ICreateOrganizationPayload,
): Promise<IOrganization> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const response = await request(app.getHttpServer())
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${jwtToken}`)

    .send(payload)
    .expect(201);

  return response.body as IOrganization;
}

/**
 * Get user's organizations via GET /api/v1/users/me/organizations
 */
export async function getUserOrganizations(
  app: INestApplication,
  jwtToken: string,
): Promise<IOrganizationMembership[]> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const response = await request(app.getHttpServer())
    .get('/api/v1/users/me/organizations')
    .set('Authorization', `Bearer ${jwtToken}`)
    .expect(200);

  return response.body as IOrganizationMembership[];
}

/**
 * Verify JWT token format (should have 3 parts separated by dots)
 */
export function validateJwtFormat(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && token.length > 0;
}

/**
 * Find organization membership from list
 */
export function findMembershipByOrganizationId(
  memberships: IOrganizationMembership[],
  organizationId: string,
): IOrganizationMembership | undefined {
  return memberships.find((m) => m.organization_id === organizationId);
}

/**
 * Create a new role via POST /api/v1/organizations/:orgId/roles
 */
export async function createRole(
  app: INestApplication,
  jwtToken: string,
  organizationId: string,
  payload: ICreateRolePayload,
): Promise<IRoleWithPermissions> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const response = await request(app.getHttpServer())
    .post(`/api/v1/organizations/${organizationId}/roles`)
    .set('Authorization', `Bearer ${jwtToken}`)
    .set('x-organization-id', organizationId)
    .send(payload);

  // If not a 201 status, throw an error with the status attached
  if (response.status !== 201) {
    const error = new Error(`Expected 201 but got ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response.body as IRoleWithPermissions;
}

/**
 * Get all roles for an organization via GET /api/v1/organizations/:orgId/roles
 */
export async function getRoles(
  app: INestApplication,
  jwtToken: string,
  organizationId: string,
): Promise<IRoleWithPermissions[]> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const response = await request(app.getHttpServer())
    .get(`/api/v1/organizations/${organizationId}/roles`)
    .set('Authorization', `Bearer ${jwtToken}`)
    .set('x-organization-id', organizationId)
    .expect(200);

  return response.body as IRoleWithPermissions[];
}

/**
 * Helper to find a role by name from roles array
 */
export function findRoleByName(
  roles: IRoleWithPermissions[],
  name: string,
): IRoleWithPermissions | undefined {
  return roles.find((r) => r.name === name);
}
