import { MembershipStatus } from '@prisma/client';
/**
 * E2E Test Fixtures
 *
 * Central location for all test data and fixtures.
 * Makes it easy to update test data without modifying test logic.
 */

import {
  IRegisterPayload,
  ICreateOrganizationPayload,
} from '../types/e2e.types';

/**
 * Generate unique test user with timestamp-based email
 */
export function createTestUser(): IRegisterPayload {
  const timestamp = Date.now();
  return {
    email: `test-user-${timestamp}@example.com`,
    password: 'SecurePassword123!',
    first_name: 'John',
    last_name: 'Doe',
  };
}

/**
 * Generate unique test organization with timestamp-based slug
 */
export function createTestOrganization(): ICreateOrganizationPayload {
  const timestamp = Date.now();
  return {
    name: `Test Organization ${timestamp}`,
    slug: `test-org-${timestamp}`,
  };
}

/**
 * Generate test role payload for role creation
 */
export function createTestRole(roleName?: string) {
  return {
    name: roleName || `Test Role ${Date.now()}`,
    // Note: Permission IDs will be fetched from the database in E2E tests
    // This is a placeholder - actual IDs come from the system
    permissionIds: [] as string[],
  };
}

/**
 * Test data constants for assertion values
 */
export const TEST_CONSTANTS = {
  MEMBERSHIP_STATUS: {
    ACTIVE: MembershipStatus.ACTIVE,
    PENDING: MembershipStatus.PENDING,
  },

  ROLE: {
    OWNER: 'owner',
    Agent: 'agent',
    ADMIN: 'Admin',
  },

  HTTP_STATUS: {
    CREATED: 201,
    OK: 200,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
  },

  JWT: {
    PARTS_COUNT: 3,
    SEPARATOR: '.',
  },
} as const;
