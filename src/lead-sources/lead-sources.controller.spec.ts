import { AccessVerificationService } from '../access-control/access-verification.service';
import { AppPermission } from '../constants/permissions.registry';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadSourcesService } from './lead-sources.service';

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

describe('LeadSourcesController', () => {
  let controller: LeadSourcesController;
  const findAllMock = jest.fn();
  const createMock = jest.fn();
  const updateMock = jest.fn();
  const removeMock = jest.fn();
  const verifyUserInOrganizationMock = jest.fn();

  const mockLeadSourcesService = {
    findAll: findAllMock,
    create: createMock,
    update: updateMock,
    remove: removeMock,
  } as unknown as LeadSourcesService;

  const mockAccessVerificationService = {
    verifyUserInOrganization: verifyUserInOrganizationMock,
  } as unknown as AccessVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeadSourcesController(
      mockLeadSourcesService,
      mockAccessVerificationService,
    );
  });

  describe('permission metadata', () => {
    it('requires lead_sources:create permission on create endpoint', () => {
      const permissions = getPermissionsMetadata(
        LeadSourcesController.prototype,
        'create',
      );

      expect(permissions).toEqual([AppPermission.LEAD_SOURCES_CREATE]);
    });

    it('requires lead_sources:edit permission on update endpoint', () => {
      const permissions = getPermissionsMetadata(
        LeadSourcesController.prototype,
        'update',
      );

      expect(permissions).toEqual([AppPermission.LEAD_SOURCES_EDIT]);
    });

    it('requires lead_sources:delete permission on remove endpoint', () => {
      const permissions = getPermissionsMetadata(
        LeadSourcesController.prototype,
        'remove',
      );

      expect(permissions).toEqual([AppPermission.LEAD_SOURCES_DELETE]);
    });
  });

  describe('findAll', () => {
    it('verifies membership then delegates to service', async () => {
      const organizationId = 'org-1';
      const userId = 'user-1';
      const req = { user: { id: userId } };
      const sources = [{ id: 'source-1', organization_id: organizationId }];

      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      findAllMock.mockResolvedValueOnce(sources);

      const result = await controller.findAll(
        organizationId,
        req as Parameters<LeadSourcesController['findAll']>[1],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        organizationId,
        userId,
      );
      expect(findAllMock).toHaveBeenCalledWith(organizationId);
      expect(result).toEqual(sources);
    });
  });
});
