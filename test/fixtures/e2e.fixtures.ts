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
 * Test data constants for assertion values
 */
export const TEST_CONSTANTS = {
  MEMBERSHIP_STATUS: {
    ACTIVE: 'active',
    PENDING: 'pending_approval',
    INVITED: 'invited',
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
