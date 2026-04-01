import 'reflect-metadata';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod, ParseUUIDPipe } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { AppPermission } from '../constants/permissions.registry';

type RouteArgMetadataValue = {
  index: number;
  data?: string;
  pipes?: unknown[];
};

type RouteArgMetadata = Record<string, RouteArgMetadataValue>;

const getPermissionsMetadata = (
  prototype: object,
  methodName: string,
): string[] => {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
  const handler = descriptor?.value as object | undefined;

  if (!handler) {
    return [];
  }

  return (
    (Reflect.getMetadata('permissions', handler) as string[] | undefined) ?? []
  );
};

const getHandler = (
  methodName: keyof LeadsController,
): ((...args: unknown[]) => unknown) => {
  const descriptor = Object.getOwnPropertyDescriptor(
    LeadsController.prototype,
    methodName,
  );

  if (!descriptor?.value) {
    throw new Error(`Handler ${String(methodName)} is missing`);
  }

  return descriptor.value as (...args: unknown[]) => unknown;
};

const getRouteArgsMetadata = (
  methodName: keyof LeadsController,
): RouteArgMetadata => {
  return (Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    LeadsController,
    methodName,
  ) ?? {}) as RouteArgMetadata;
};

describe('LeadsController', () => {
  let controller: LeadsController;

  const createMock = jest.fn();
  const findAllMock = jest.fn();
  const findOneMock = jest.fn();
  const bulkUpdateMock = jest.fn();
  const updateMock = jest.fn();
  const removeMock = jest.fn();
  const verifyUserInOrganizationMock = jest.fn();

  const mockLeadsService = {
    create: createMock,
    findAll: findAllMock,
    findOne: findOneMock,
    bulkUpdate: bulkUpdateMock,
    update: updateMock,
    remove: removeMock,
  } as unknown as LeadsService;

  const mockAccessVerificationService = {
    verifyUserInOrganization: verifyUserInOrganizationMock,
  } as unknown as AccessVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeadsController(
      mockLeadsService,
      mockAccessVerificationService,
    );
  });

  describe('route metadata', () => {
    it('registers class route prefix', () => {
      expect(Reflect.getMetadata(PATH_METADATA, LeadsController)).toBe(
        'organizations/:organizationId/leads',
      );
    });

    it('maps methods to expected HTTP methods and paths', () => {
      expect(Reflect.getMetadata(METHOD_METADATA, getHandler('create'))).toBe(
        RequestMethod.POST,
      );
      expect(Reflect.getMetadata(PATH_METADATA, getHandler('create'))).toBe(
        '/',
      );

      expect(Reflect.getMetadata(METHOD_METADATA, getHandler('findAll'))).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(PATH_METADATA, getHandler('findAll'))).toBe(
        '/',
      );

      expect(Reflect.getMetadata(METHOD_METADATA, getHandler('findOne'))).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(PATH_METADATA, getHandler('findOne'))).toBe(
        ':leadId',
      );

      expect(
        Reflect.getMetadata(METHOD_METADATA, getHandler('bulkUpdate')),
      ).toBe(RequestMethod.PATCH);
      expect(Reflect.getMetadata(PATH_METADATA, getHandler('bulkUpdate'))).toBe(
        'bulk',
      );

      expect(Reflect.getMetadata(METHOD_METADATA, getHandler('update'))).toBe(
        RequestMethod.PATCH,
      );
      expect(Reflect.getMetadata(PATH_METADATA, getHandler('update'))).toBe(
        ':leadId',
      );

      expect(Reflect.getMetadata(METHOD_METADATA, getHandler('remove'))).toBe(
        RequestMethod.DELETE,
      );
      expect(Reflect.getMetadata(PATH_METADATA, getHandler('remove'))).toBe(
        ':leadId',
      );
    });
  });

  describe('permission metadata', () => {
    it('requires leads:edit permission on bulkUpdate endpoint', () => {
      const permissions = getPermissionsMetadata(
        LeadsController.prototype,
        'bulkUpdate',
      );

      expect(permissions).toEqual([AppPermission.LEADS_EDIT]);
    });

    it('requires leads:delete permission on remove endpoint', () => {
      const permissions = getPermissionsMetadata(
        LeadsController.prototype,
        'remove',
      );

      expect(permissions).toEqual([AppPermission.LEADS_DELETE]);
    });
  });

  describe('pipe wiring metadata', () => {
    it('wires ParseUUIDPipe on organizationId param', () => {
      const routeArgs = getRouteArgsMetadata('findAll');
      const metadataValues = Object.values(routeArgs);

      const orgArg = metadataValues.find(
        (arg) => arg.data === 'organizationId',
      );

      expect(orgArg?.pipes?.some((pipe) => pipe instanceof ParseUUIDPipe)).toBe(
        true,
      );
    });
  });

  describe('create', () => {
    it('verifies membership and delegates shape to service', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = { first_name: 'John' };
      const expected = { id: 'lead-1' };
      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      createMock.mockResolvedValueOnce(expected);

      const result = await controller.create(
        'org-1',
        req as Parameters<LeadsController['create']>[1],
        dto as Parameters<LeadsController['create']>[2],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(createMock).toHaveBeenCalledWith('org-1', 'user-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('verifies membership and forwards query shape to service', async () => {
      const req = { user: { id: 'user-1' } };
      const expected = { data: [], meta: { page: 2 } };
      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      findAllMock.mockResolvedValueOnce(expected);

      const result = await controller.findAll(
        'org-1',
        req as Parameters<LeadsController['findAll']>[1],
        {
          page: 2,
          limit: 10,
          filters: '[{"field":"country","operator":"equals","value":"TR"}]',
          sort_by: 'created_at',
          sort_dir: 'asc',
          search: 'john',
        } as Parameters<LeadsController['findAll']>[2],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(findAllMock).toHaveBeenCalledWith('org-1', 'user-1', {
        page: 2,
        limit: 10,
        filters: '[{"field":"country","operator":"equals","value":"TR"}]',
        sort_by: 'created_at',
        sort_dir: 'asc',
        search: 'john',
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('verifies membership and forwards ids to service', async () => {
      const req = { user: { id: 'user-1' } };
      const expected = { id: 'lead-1' };
      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      findOneMock.mockResolvedValueOnce(expected);

      const result = await controller.findOne(
        'org-1',
        'lead-1',
        req as Parameters<LeadsController['findOne']>[2],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(findOneMock).toHaveBeenCalledWith('org-1', 'user-1', 'lead-1');
      expect(result).toEqual(expected);
    });
  });

  describe('bulkUpdate', () => {
    it('verifies membership and forwards dto to service', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = {
        lead_ids: ['11111111-1111-4111-8111-111111111111'],
        update_data: { status: 'WON' },
      };
      const expected = { updated_count: 1 };
      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      bulkUpdateMock.mockResolvedValueOnce(expected);

      const result = await controller.bulkUpdate(
        'org-1',
        req as Parameters<LeadsController['bulkUpdate']>[1],
        dto as Parameters<LeadsController['bulkUpdate']>[2],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(bulkUpdateMock).toHaveBeenCalledWith('org-1', 'user-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('update', () => {
    it('verifies membership and forwards dto to service', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = { first_name: 'Updated' };
      const expected = { id: 'lead-1', first_name: 'Updated' };
      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      updateMock.mockResolvedValueOnce(expected);

      const result = await controller.update(
        'org-1',
        'lead-1',
        req as Parameters<LeadsController['update']>[2],
        dto as Parameters<LeadsController['update']>[3],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(updateMock).toHaveBeenCalledWith('org-1', 'lead-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('remove', () => {
    it('verifies membership then delegates scoped delete to service', async () => {
      const req = { user: { id: 'user-1' } };
      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      removeMock.mockResolvedValueOnce(undefined);

      await controller.remove(
        'org-1',
        'lead-1',
        req as Parameters<LeadsController['remove']>[2],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
      expect(removeMock).toHaveBeenCalledWith('org-1', 'lead-1');
    });
  });
});
