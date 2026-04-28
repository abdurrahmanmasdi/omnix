import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from '../services/permissions.service';

describe('PermissionsGuard', () => {
  const mockReflector = {
    get: jest.fn(),
  } as unknown as jest.Mocked<Reflector>;

  const mockPermissionsService = {
    getEffectivePermissions: jest.fn(),
  } as unknown as jest.Mocked<PermissionsService>;

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  } as unknown as jest.Mocked<I18nService>;

  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(
      mockReflector,
      mockPermissionsService,
      mockI18nService,
    );
  });

  const createContext = (
    requiredPermissions?: string[],
    effectivePermissions: string[] = [],
    requestOverrides?: {
      user?: Record<string, unknown>;
      params?: Record<string, string>;
      headers?: Record<string, string>;
    },
  ): ExecutionContext => {
    (mockReflector.get as jest.Mock).mockReturnValue(requiredPermissions);
    (
      mockPermissionsService.getEffectivePermissions as jest.Mock
    ).mockResolvedValue(effectivePermissions);

    const request = {
      user: {
        id: 'user-1',
        email: 'user@test.com',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date(),
      },
      params: {
        organizationId: 'org-1',
      },
      headers: {} as Record<string, string>,
      ...requestOverrides,
    };

    const handler = () => undefined;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler,
    } as unknown as ExecutionContext;
  };

  it('allows access when no permissions metadata exists', async () => {
    const context = createContext(undefined, []);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(
      mockPermissionsService.getEffectivePermissions,
    ).not.toHaveBeenCalled();
  });

  it('reads permissions metadata from handler key', async () => {
    const context = createContext(['leads:read'], ['leads:read']);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockReflector.get).toHaveBeenCalledWith(
      'permissions',
      expect.any(Function),
    );
  });

  it('throws ForbiddenException when request has no authenticated user', async () => {
    const context = createContext(['leads:read'], ['leads:read'], {
      user: undefined,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockI18nService.t).toHaveBeenCalledWith(
      'auth.ERRORS.UNAUTHORIZED_ACCESS',
    );
  });

  it('throws BadRequestException when organization id cannot be extracted', async () => {
    const context = createContext(['leads:read'], ['leads:read'], {
      params: {},
      headers: {},
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockI18nService.t).toHaveBeenCalledWith(
      'auth.ERRORS.ORGANIZATION_ID_REQUIRED',
    );
  });

  it('extracts org id from params.orgId when present', async () => {
    const context = createContext(['leads:read'], ['leads:read'], {
      params: { orgId: 'org-via-orgId' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockPermissionsService.getEffectivePermissions).toHaveBeenCalledWith(
      'user-1',
      'org-via-orgId',
    );
  });

  it('extracts org id from params.id fallback', async () => {
    const context = createContext(['leads:read'], ['leads:read'], {
      params: { id: 'org-via-id' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockPermissionsService.getEffectivePermissions).toHaveBeenCalledWith(
      'user-1',
      'org-via-id',
    );
  });

  it('extracts org id from x-organization-id header fallback', async () => {
    const context = createContext(['leads:read'], ['leads:read'], {
      params: {},
      headers: { 'x-organization-id': 'org-via-header' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockPermissionsService.getEffectivePermissions).toHaveBeenCalledWith(
      'user-1',
      'org-via-header',
    );
  });

  it('allows access when route requires create and user has manage in same domain', async () => {
    const context = createContext(
      ['lead_sources:create'],
      ['lead_sources:manage'],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when user has global wildcard permission', async () => {
    const context = createContext(['roles:delete'], ['*']);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when user has namespace wildcard permission', async () => {
    const context = createContext(['leads:delete'], ['leads:*']);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows read permission when user has read_all', async () => {
    const context = createContext(
      ['team_members:read'],
      ['team_members:read_all'],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows delete permission when user has delete_all', async () => {
    const context = createContext(
      ['team_members:delete'],
      ['team_members:delete_all'],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('throws ForbiddenException when user lacks required permissions', async () => {
    const context = createContext(['roles:delete'], ['roles:read']);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockI18nService.t).toHaveBeenCalledWith(
      'auth.ERRORS.INSUFFICIENT_PERMISSIONS',
    );
  });
});
