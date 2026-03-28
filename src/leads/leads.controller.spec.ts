import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { AppPermission } from '../constants/permissions.registry';

describe('LeadsController', () => {
  let controller: LeadsController;

  const mockLeadsService = {
    remove: jest.fn(),
  } as unknown as LeadsService;

  const mockAccessVerificationService = {
    verifyUserInOrganization: jest.fn(),
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
      const permissions = Reflect.getMetadata(
        'permissions',
        LeadsController.prototype.remove,
      ) as string[];

      expect(permissions).toEqual([AppPermission.LEADS_DELETE]);
    });
  });

  describe('remove', () => {
    it('verifies organization membership then delegates scoped delete to service', async () => {
      const organizationId = 'org-1';
      const leadId = 'lead-1';
      const userId = 'user-1';
      const req = { user: { id: userId } } as { user: { id: string } };

      (
        mockAccessVerificationService.verifyUserInOrganization as jest.Mock
      ).mockResolvedValueOnce(undefined);
      (mockLeadsService.remove as jest.Mock).mockResolvedValueOnce(undefined);

      await controller.remove(
        organizationId,
        leadId,
        req as unknown as Parameters<LeadsController['remove']>[2],
      );

      expect(
        mockAccessVerificationService.verifyUserInOrganization,
      ).toHaveBeenCalledWith(organizationId, userId);
      expect(mockLeadsService.remove).toHaveBeenCalledWith(
        organizationId,
        leadId,
      );
    });
  });
});
