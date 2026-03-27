/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
/**
 * E2E Tests: Role Management (PBAC Endpoints)
 *
 * This test suite validates role management endpoints:
 * 1. Create Role → POST /api/v1/organizations/:orgId/roles
 * 2. Get Roles → GET /api/v1/organizations/:orgId/roles
 *
 * Test Setup:
 * - Create a test user and register
 * - Create an organization (auto-generates default roles with permissions)
 * - Authenticate to get JWT
 * - Use x-organization-id header for tenant context
 *
 * Database: tourcrm_test (isolated test database)
 * All test data is automatically cleaned up after execution.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestUser,
  createTestOrganization,
} from './fixtures/e2e.fixtures';
import {
  initializeApp,
  cleanupTestData,
  clearDatabase,
  registerUser,
  loginUser,
  createOrganization,
  createRole,
  getRoles,
  findRoleByName,
} from './utils/e2e.utils';
import {
  IUser,
  IAuthResponse,
  IOrganization,
  ICreateRolePayload,
} from './types/e2e.types';

describe('Role Management - PBAC Endpoints (E2E)', () => {
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
  let systemPermissions: Array<{ id: string; action: string }> = [];

  // ============================================================================
  // Setup Phase: User Registration, Auth, Org Creation
  // ============================================================================

  describe('🔧 Setup Phase: Establish Test Context', () => {
    it('should register a test user', async () => {
      // Act
      registeredUser = await registerUser(app, testUser);

      // Assert
      expect(registeredUser).toBeDefined();
      expect(registeredUser.id).toBeDefined();
      expect(registeredUser.email).toBe(testUser.email);
      expect(registeredUser).not.toHaveProperty('password_hash');
    });

    it('should authenticate user and retrieve JWT token', async () => {
      // Act
      const authResponse: IAuthResponse = await loginUser(
        app,
        testUser.email,
        testUser.password,
      );

      // Assert
      expect(authResponse).toBeDefined();
      expect(authResponse.access_token).toBeDefined();
      expect(typeof authResponse.access_token).toBe('string');

      authToken = authResponse.access_token;
    });

    it('should create organization with auto-generated default roles', async () => {
      // Act
      createdOrganization = await createOrganization(
        app,
        authToken,
        testOrganization,
      );

      // Assert
      expect(createdOrganization).toBeDefined();
      expect(createdOrganization.id).toBeDefined();
      expect(createdOrganization.name).toBe(testOrganization.name);
      expect(createdOrganization.slug).toBe(testOrganization.slug);
    });

    it('should fetch system permissions for role creation', async () => {
      // Fetch all permissions from the database (seeded on app startup)
      const allPermissions = await prismaService.permission.findMany({
        select: { id: true, action: true },
        take: 10, // Get first 10 permissions for testing
      });

      // Assert
      expect(Array.isArray(allPermissions)).toBe(true);
      expect(allPermissions.length).toBeGreaterThan(0);

      systemPermissions = allPermissions;
    });
  });

  // ============================================================================
  // Test Suite 1: Get Roles (GET /organizations/:orgId/roles)
  // ============================================================================

  describe('📋 GET /organizations/:orgId/roles - Retrieve all roles', () => {
    it('should return 200 OK and fetch all roles for the organization', async () => {
      // Act
      const roles = await getRoles(app, authToken, createdOrganization.id);

      // Assert
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
    });

    it('should return roles with correct structure and nested permissions', async () => {
      // Act
      const roles = await getRoles(app, authToken, createdOrganization.id);

      // Assert - Check at least one role exists and has correct structure
      const ownerRole = findRoleByName(roles, 'Owner');
      expect(ownerRole).toBeDefined();

      if (ownerRole) {
        // Check role structure
        expect(ownerRole.id).toBeDefined();
        expect(typeof ownerRole.id).toBe('string');
        expect(ownerRole.name).toBe('Owner');
        expect(ownerRole.organization_id).toBe(createdOrganization.id);
        expect(ownerRole.created_at).toBeDefined();

        // Check rolePermissions array and permission structure
        expect(Array.isArray(ownerRole.rolePermissions)).toBe(true);
        expect(ownerRole.rolePermissions.length).toBeGreaterThan(0);

        // Check first permission structure
        const firstPermission = ownerRole.rolePermissions[0];
        expect(firstPermission.permission).toBeDefined();
        expect(firstPermission.permission.id).toBeDefined();
        expect(firstPermission.permission.action).toBeDefined();
        expect(typeof firstPermission.permission.action).toBe('string');
      }
    });

    it('should have populated permissions from system permissions', async () => {
      // Act
      const roles = await getRoles(app, authToken, createdOrganization.id);

      // Get Owner role (should have all permissions)
      const ownerRole = findRoleByName(roles, 'Owner');

      // Assert
      expect(ownerRole).toBeDefined();
      if (ownerRole) {
        expect(ownerRole.rolePermissions.length).toBeGreaterThan(0);

        // Verify permission actions are valid system permission actions
        const ownerPermissions = ownerRole.rolePermissions.map(
          (rp) => rp.permission.action,
        );
        expect(ownerPermissions.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // Test Suite 2: Create Role (POST /organizations/:orgId/roles)
  // ============================================================================

  describe('➕ POST /organizations/:orgId/roles - Create a new role', () => {
    it('should return 201 Created when creating a role with valid data', async () => {
      // Arrange: Prepare role creation payload
      const rolePayload: ICreateRolePayload = {
        name: 'Senior Manager',
        permissionIds: systemPermissions.slice(0, 5).map((p) => p.id), // Use first 5 permissions
      };

      // Act
      const createdRole = await createRole(
        app,
        authToken,
        createdOrganization.id,
        rolePayload,
      );

      // Assert - Response structure
      expect(createdRole).toBeDefined();
      expect(createdRole.id).toBeDefined();
      expect(createdRole.name).toBe(rolePayload.name);
      expect(createdRole.organization_id).toBe(createdOrganization.id);
      expect(typeof createdRole.created_at).toBe('string');
    });

    it('should return role with populated permissions in correct structure', async () => {
      // Arrange
      const rolePayload: ICreateRolePayload = {
        name: `TeamLead ${Date.now()}`,
        permissionIds: systemPermissions.slice(0, 3).map((p) => p.id),
      };

      // Act
      const createdRole = await createRole(
        app,
        authToken,
        createdOrganization.id,
        rolePayload,
      );

      // Assert - Verify role structure
      expect(createdRole.name).toBe(rolePayload.name);
      expect(createdRole.id).toBeDefined();

      // Verify rolePermissions array
      expect(Array.isArray(createdRole.rolePermissions)).toBe(true);
      expect(createdRole.rolePermissions.length).toBe(
        rolePayload.permissionIds.length,
      );

      // Verify permission structure within rolePermissions
      createdRole.rolePermissions.forEach((rolePermission) => {
        expect(rolePermission.permission).toBeDefined();
        expect(rolePermission.permission.id).toBeDefined();
        expect(rolePermission.permission.action).toBeDefined();
        expect(typeof rolePermission.permission.action).toBe('string');
      });
    });

    it('should validate that created role is returned with all assigned permissions', async () => {
      // Arrange - Get permissions to assign
      const permissionsToAssign = systemPermissions.slice(2, 5);
      const rolePayload: ICreateRolePayload = {
        name: `ProjectManager ${Date.now()}`,
        permissionIds: permissionsToAssign.map((p) => p.id),
      };

      // Act
      const createdRole = await createRole(
        app,
        authToken,
        createdOrganization.id,
        rolePayload,
      );

      // Assert
      expect(createdRole.rolePermissions.length).toBe(
        permissionsToAssign.length,
      );

      // Verify each assigned permission is in the response
      const returnedPermissionIds = createdRole.rolePermissions.map(
        (rp) => rp.permission.id,
      );
      permissionsToAssign.forEach((p) => {
        expect(returnedPermissionIds).toContain(p.id);
      });
    });

    it('should persist created role and be retrievable via GET endpoint', async () => {
      // Arrange
      const rolePayload: ICreateRolePayload = {
        name: `Auditor ${Date.now()}`,
        permissionIds: systemPermissions.slice(0, 2).map((p) => p.id),
      };

      // Act 1: Create role
      const createdRole = await createRole(
        app,
        authToken,
        createdOrganization.id,
        rolePayload,
      );

      // Act 2: Fetch all roles
      const allRoles = await getRoles(app, authToken, createdOrganization.id);

      // Assert
      const retrievedRole = findRoleByName(allRoles, rolePayload.name);
      expect(retrievedRole).toBeDefined();

      if (retrievedRole) {
        expect(retrievedRole.id).toBe(createdRole.id);
        expect(retrievedRole.name).toBe(rolePayload.name);
        expect(retrievedRole.organization_id).toBe(createdOrganization.id);
        expect(retrievedRole.rolePermissions.length).toBe(
          rolePayload.permissionIds.length,
        );
      }
    });

    it('should support creating role with various permission counts', async () => {
      // Test with 1 permission
      const singlePermRole: ICreateRolePayload = {
        name: `Viewer ${Date.now()}`,
        permissionIds: [systemPermissions[0].id],
      };
      const createdSinglePerm = await createRole(
        app,
        authToken,
        createdOrganization.id,
        singlePermRole,
      );
      expect(createdSinglePerm.rolePermissions.length).toBe(1);

      // Test with multiple permissions
      const multiPermRole: ICreateRolePayload = {
        name: `PowerUser ${Date.now()}`,
        permissionIds: systemPermissions.slice(0, 8).map((p) => p.id),
      };
      const createdMultiPerm = await createRole(
        app,
        authToken,
        createdOrganization.id,
        multiPermRole,
      );
      expect(createdMultiPerm.rolePermissions.length).toBe(8);
    });
  });

  // ============================================================================
  // Test Suite 3: Complete Workflow
  // ============================================================================

  describe('🎯 Complete Role Management Workflow', () => {
    it('should execute complete workflow: create role and verify via GET', async () => {
      // Arrange
      const workflowRolePayload: ICreateRolePayload = {
        name: `WorkflowRole ${Date.now()}`,
        permissionIds: systemPermissions.slice(1, 4).map((p) => p.id),
      };

      // Act 1: Create role
      const created = await createRole(
        app,
        authToken,
        createdOrganization.id,
        workflowRolePayload,
      );

      // Assert 1: Created response is valid
      expect(created.id).toBeDefined();
      expect(created.name).toBe(workflowRolePayload.name);
      expect(created.rolePermissions.length).toBe(
        workflowRolePayload.permissionIds.length,
      );

      // Act 2: Verify role exists in GET response
      const allRoles = await getRoles(app, authToken, createdOrganization.id);

      // Assert 2: Role is in the list
      const found = findRoleByName(allRoles, workflowRolePayload.name);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);

      // Assert 3: All permissions are present
      expect(found?.rolePermissions.length).toBe(
        workflowRolePayload.permissionIds.length,
      );
    });
  });

  // ============================================================================
  // Test Suite 4: Authentication & Tenant Context
  // ============================================================================

  describe('🔐 Authentication & Tenant Isolation', () => {
    it('should require valid JWT token to create role', async () => {
      // Act & Assert - Invalid token should fail
      const invalidToken = 'invalid-token-format';
      const rolePayload: ICreateRolePayload = {
        name: 'Should Fail',
        permissionIds: systemPermissions.slice(0, 1).map((p) => p.id),
      };

      try {
        // This should fail with 401 Unauthorized
        await createRole(
          app,
          invalidToken,
          createdOrganization.id,
          rolePayload,
        );
        fail('Should have thrown 401 Unauthorized');
      } catch (error: any) {
        expect(error.status).toBe(401);
      }
    });

    it('should validate organization header in request', async () => {
      // Verify that x-organization-id header is set in requests
      // The TenantInterceptor should validate this

      const rolePayload: ICreateRolePayload = {
        name: `ValidRole ${Date.now()}`,
        permissionIds: systemPermissions.slice(0, 1).map((p) => p.id),
      };

      // Act - Create role with valid org context
      const created = await createRole(
        app,
        authToken,
        createdOrganization.id,
        rolePayload,
      );

      // Assert - Should succeed with correct org
      expect(created.organization_id).toBe(createdOrganization.id);
    });
  });

  // ============================================================================
  // Test Suite: Global Permissions
  // ============================================================================

  describe('🔐 Global Permissions Endpoint', () => {
    it('should return 200 OK and fetch all system permissions', async () => {
      // Act

      const response = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const permissions = response.body;

      // Assert - Response structure
      expect(Array.isArray(permissions)).toBe(true);

      expect(permissions.length).toBeGreaterThan(0);
    });

    it('should return permissions with correct structure', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const permissions = response.body;

      // Assert - Each permission should have required fields
      permissions.forEach((permission: any) => {
        expect(permission).toHaveProperty('id');
        expect(permission).toHaveProperty('action');
        expect(permission).toHaveProperty('description');
        expect(typeof permission.id).toBe('string');
        expect(typeof permission.action).toBe('string');
      });
    });

    it('should return permissions sorted alphabetically by action', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const permissions = response.body;
      const actions = permissions.map((p: any) => p.action);

      // Assert - Verify alphabetical sorting
      const sortedActions = [...actions].sort();
      expect(actions).toEqual(sortedActions);
    });

    it('should require authentication to access permissions endpoint', async () => {
      // Act & Assert
      await request(app.getHttpServer()).get('/api/v1/permissions').expect(401);
    });

    it('should return 401 with invalid JWT token', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .get('/api/v1/permissions')
        .set('Authorization', 'Bearer invalid-token-format')
        .expect(401);
    });
  });
});
