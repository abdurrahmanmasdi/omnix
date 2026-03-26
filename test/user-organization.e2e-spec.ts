/**
 * E2E Tests: User Registration, Authentication & Organization Management
 *
 * This test suite validates the complete user onboarding and organization
 * creation workflow:
 *
 * 1. User Registration → POST /auth/register
 * 2. User Login → POST /auth/login (extract JWT)
 * 3. Create Organization → POST /organizations (with JWT auth)
 * 4. Verify Membership → GET /users/me/organizations (with JWT auth)
 *
 * All test data is automatically cleaned up after execution.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestUser,
  createTestOrganization,
  TEST_CONSTANTS,
} from './fixtures/e2e.fixtures';
import {
  initializeApp,
  cleanupTestData,
  clearDatabase,
  registerUser,
  loginUser,
  createOrganization,
  getUserOrganizations,
  validateJwtFormat,
  findMembershipByOrganizationId,
} from './utils/e2e.utils';
import {
  IUser,
  IAuthResponse,
  IOrganization,
  IOrganizationMembership,
} from './types/e2e.types';

describe('User Registration, Authentication & Organization Management (E2E)', () => {
  // ============================================================================
  // Setup & Teardown
  // ============================================================================

  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await initializeApp(app);

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    await clearDatabase(prismaService);
  });

  afterAll(async () => {
    await cleanupTestData(
      prismaService,
      createdOrganization?.id,
      registeredUser?.id,
    );
    await app.close();
  });

  // ============================================================================
  // Test State
  // ============================================================================

  // Test fixtures
  const testUser = createTestUser();
  const testOrganization = createTestOrganization();

  // Variables to capture from API responses
  let registeredUser: IUser;
  let authToken: string;
  let createdOrganization: IOrganization;

  // ============================================================================
  // Test Suite: User Registration
  // ============================================================================

  describe('👤 User Registration (POST /auth/register)', () => {
    it('should successfully register a new user with valid credentials', async () => {
      // Act
      registeredUser = await registerUser(app, testUser);

      // Assert
      expect(registeredUser).toBeDefined();
      expect(registeredUser.id).toBeDefined();
      expect(registeredUser.email).toBe(testUser.email);
      expect(registeredUser.first_name).toBe(testUser.first_name);
      expect(registeredUser.last_name).toBe(testUser.last_name);
      expect(registeredUser).not.toHaveProperty('password_hash');
    });
  });

  // ============================================================================
  // Test Suite: User Authentication
  // ============================================================================

  describe('🔐 User Authentication (POST /auth/login)', () => {
    it('should successfully authenticate user and return valid JWT token', async () => {
      // Act
      const authResponse: IAuthResponse = await loginUser(
        app,
        testUser.email,
        testUser.password,
      );

      // Assert - Response structure
      expect(authResponse).toBeDefined();
      expect(authResponse.access_token).toBeDefined();
      expect(typeof authResponse.access_token).toBe('string');

      // Assert - JWT format
      expect(validateJwtFormat(authResponse.access_token)).toBe(true);

      // Store token for subsequent authenticated requests
      authToken = authResponse.access_token;
    });
  });

  // ============================================================================
  // Test Suite: Organization Creation
  // ============================================================================

  describe('🏢 Organization Creation (POST /organizations)', () => {
    it('should successfully create organization with Bearer JWT authentication', async () => {
      // Act
      createdOrganization = await createOrganization(
        app,
        authToken,
        testOrganization,
      );

      // Assert - Response structure
      expect(createdOrganization).toBeDefined();
      expect(createdOrganization.id).toBeDefined();
      expect(createdOrganization.name).toBe(testOrganization.name);
      expect(createdOrganization.slug).toBe(testOrganization.slug);
      expect(typeof createdOrganization.is_public).toBe('boolean');
    });
  });

  // ============================================================================
  // Test Suite: Membership Verification
  // ============================================================================

  describe('👥 Organization Membership Verification (GET /users/me/organizations)', () => {
    it('should retrieve user organizations and verify admin membership status', async () => {
      // Act
      const memberships: IOrganizationMembership[] = await getUserOrganizations(
        app,
        authToken,
      );

      // Assert - Response structure
      expect(Array.isArray(memberships)).toBe(true);
      expect(memberships.length).toBeGreaterThan(0);

      // Find the created organization in memberships
      const membership = findMembershipByOrganizationId(
        memberships,
        createdOrganization.id,
      );
      expect(membership).toBeDefined();

      // Assert - Membership details
      if (membership) {
        expect(membership.status).toBe(TEST_CONSTANTS.MEMBERSHIP_STATUS.ACTIVE);
        expect(membership.role.name).toBe(TEST_CONSTANTS.ROLE.ADMIN);
        expect(membership.organization_id).toBe(createdOrganization.id);

        // Assert - Nested organization data
        expect(membership.organization).toBeDefined();
        expect(membership.organization.name).toBe(testOrganization.name);
        expect(membership.organization.slug).toBe(testOrganization.slug);
      }
    });
  });

  // ============================================================================
  // Test Suite: Complete Workflow
  // ============================================================================

  describe('🎯 Complete User & Organization Workflow', () => {
    it('should execute full workflow from registration to membership verification', async () => {
      // Assert entire workflow was successful
      expect(registeredUser.id).toBeDefined();
      expect(registeredUser.email).toBe(testUser.email);

      expect(authToken).toBeDefined();
      expect(validateJwtFormat(authToken)).toBe(true);

      expect(createdOrganization.id).toBeDefined();
      expect(createdOrganization.name).toBe(testOrganization.name);

      // Verify the end-to-end connection
      const memberships = await getUserOrganizations(app, authToken);
      const membership = findMembershipByOrganizationId(
        memberships,
        createdOrganization.id,
      );

      expect(membership).toBeDefined();
      if (membership) {
        expect(membership.status).toBe(TEST_CONSTANTS.MEMBERSHIP_STATUS.ACTIVE);
        expect(membership.role.name).toBe(TEST_CONSTANTS.ROLE.ADMIN);
      }
    });
  });
});
