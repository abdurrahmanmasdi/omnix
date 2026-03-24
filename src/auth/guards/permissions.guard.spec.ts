import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from '../../auth/services/permissions.service';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;

  const mockPermissionsService = {
    getUserPermissions: jest.fn(),
    invalidateUserPermissionsCache: jest.fn(),
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    // Suppress Logger output during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: Logger,
          useValue: {
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('No permissions required on route', () => {
    it('should allow access when no permissions are required', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue(null);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // Act
      const result = await guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
      expect(mockPermissionsService.getUserPermissions).not.toHaveBeenCalled();
    });
  });

  describe('Missing tenantId in request', () => {
    it('should throw UnauthorizedException when tenantId is missing', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'roles:read',
        'roles:write',
      ]);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: undefined, // Missing tenantId
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // Act & Assert
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Missing user ID in request', () => {
    it('should throw UnauthorizedException when userId is missing', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'roles:read',
        'roles:write',
      ]);
      const mockRequest = {
        user: undefined, // Missing user
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // Act & Assert
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Redis cache returns insufficient permissions', () => {
    it('should throw ForbiddenException when user lacks required permissions from cache', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'roles:write',
        'members:write',
      ]);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // User only has 'roles:read' permission, missing 'roles:write' and 'members:write'
      mockPermissionsService.getUserPermissions.mockResolvedValue([
        'roles:read',
      ]);

      // Act & Assert
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Redis miss, falls back to database', () => {
    it('should fetch permissions from database when Redis is empty and grant access if permissions match', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'roles:read',
        'roles:write',
      ]);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // PermissionsService will handle Redis miss and database fallback internally
      // It returns the full set of permissions
      mockPermissionsService.getUserPermissions.mockResolvedValue([
        'roles:read',
        'roles:write',
        'members:read',
        'leads:read',
      ]);

      // Act
      const result = await guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
      expect(mockPermissionsService.getUserPermissions).toHaveBeenCalledWith(
        'user-123',
        'org-123',
      );
    });
  });

  describe('Permission check with all permissions present', () => {
    it('should allow access when user has all required permissions', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'roles:read',
        'roles:write',
      ]);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPermissionsService.getUserPermissions.mockResolvedValue([
        'roles:read',
        'roles:write',
        'members:read',
      ]);

      // Act
      const result = await guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Permission check with some permissions missing', () => {
    it('should throw ForbiddenException when user lacks one required permission', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'roles:read',
        'roles:write',
        'members:delete',
      ]);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // User has 'roles:read' and 'roles:write' but not 'members:delete'
      mockPermissionsService.getUserPermissions.mockResolvedValue([
        'roles:read',
        'roles:write',
        'members:read',
      ]);

      // Act & Assert
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('PermissionsService throws unexpected error', () => {
    it('should throw ForbiddenException when PermissionsService fails', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue(['roles:write']);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPermissionsService.getUserPermissions.mockRejectedValue(
        new Error('Database connection failed'),
      );

      // Act & Assert
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Empty user permissions array', () => {
    it('should throw ForbiddenException when user has no permissions', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue(['roles:read']);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPermissionsService.getUserPermissions.mockResolvedValue([]);

      // Act & Assert
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Single permission requirement', () => {
    it('should allow access when user has the single required permission', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue(['leads:read']);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPermissionsService.getUserPermissions.mockResolvedValue([
        'leads:read',
        'leads:write',
      ]);

      // Act
      const result = await guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('User with many permissions', () => {
    it('should allow access when user has required permissions among many others', async () => {
      // Arrange
      mockReflector.getAllAndOverride.mockReturnValue([
        'deals:write',
        'members:read',
      ]);
      const mockRequest = {
        user: { id: 'user-123' },
        tenantId: 'org-123',
      };
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // User is an admin with many permissions
      mockPermissionsService.getUserPermissions.mockResolvedValue([
        'roles:read',
        'roles:write',
        'members:read',
        'members:write',
        'leads:read',
        'leads:write',
        'leads:delete',
        'deals:read',
        'deals:write',
        'deals:delete',
      ]);

      // Act
      const result = await guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
    });
  });
});
