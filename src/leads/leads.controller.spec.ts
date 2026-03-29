import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { AppPermission } from '../constants/permissions.registry';

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

describe('LeadsController', () => {
  let controller: LeadsController;
  const removeMock = jest.fn();
  const verifyUserInOrganizationMock = jest.fn();

  const mockLeadsService = {
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

  describe('delete permission metadata', () => {
    it('requires leads:delete permission on remove endpoint', () => {
      const permissions = getPermissionsMetadata(
        LeadsController.prototype,
        'remove',
      );

      expect(permissions).toEqual([AppPermission.LEADS_DELETE]);
    });
  });

  describe('remove', () => {
    it('verifies organization membership then delegates scoped delete to service', async () => {
      const organizationId = 'org-1';
      const leadId = 'lead-1';
      const userId = 'user-1';
      const req = { user: { id: userId } } as { user: { id: string } };

      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      removeMock.mockResolvedValueOnce(undefined);

      await controller.remove(
        organizationId,
        leadId,
        req as unknown as Parameters<LeadsController['remove']>[2],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        organizationId,
        userId,
      );
      expect(removeMock).toHaveBeenCalledWith(organizationId, leadId);
    });
  });
});
