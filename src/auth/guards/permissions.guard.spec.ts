import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from '../services/permissions.service';

describe('PermissionsGuard', () => {
  const mockReflector = {
    get: jest.fn(),
  } as unknown as Reflector;

  const mockPermissionsService = {
    getEffectivePermissions: jest.fn(),
  } as unknown as PermissionsService;

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  } as unknown as I18nService;

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
    requiredPermissions: string[],
    effectivePermissions: string[],
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
      headers: {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('allows access when route requires create and user has manage in same domain', async () => {
    const context = createContext(
      ['lead_sources:create'],
      ['lead_sources:manage'],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows access when route requires edit and user has edit_all', async () => {
    const context = createContext(
      ['pipeline_stages:edit'],
      ['pipeline_stages:edit_all'],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
