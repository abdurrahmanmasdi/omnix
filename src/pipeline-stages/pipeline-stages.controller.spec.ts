import { AccessVerificationService } from '../access-control/access-verification.service';
import { AppPermission } from '../constants/permissions.registry';
import { PipelineStagesController } from './pipeline-stages.controller';
import { PipelineStagesService } from './pipeline-stages.service';

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

describe('PipelineStagesController', () => {
  let controller: PipelineStagesController;
  const findAllMock = jest.fn();
  const createMock = jest.fn();
  const updateMock = jest.fn();
  const removeMock = jest.fn();
  const verifyUserInOrganizationMock = jest.fn();

  const mockPipelineStagesService = {
    findAll: findAllMock,
    create: createMock,
    update: updateMock,
    remove: removeMock,
  } as unknown as PipelineStagesService;

  const mockAccessVerificationService = {
    verifyUserInOrganization: verifyUserInOrganizationMock,
  } as unknown as AccessVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PipelineStagesController(
      mockPipelineStagesService,
      mockAccessVerificationService,
    );
  });

  describe('permission metadata', () => {
    it('requires pipeline_stages:create permission on create endpoint', () => {
      const permissions = getPermissionsMetadata(
        PipelineStagesController.prototype,
        'create',
      );

      expect(permissions).toEqual([AppPermission.PIPELINE_STAGES_CREATE]);
    });

    it('requires pipeline_stages:edit permission on update endpoint', () => {
      const permissions = getPermissionsMetadata(
        PipelineStagesController.prototype,
        'update',
      );

      expect(permissions).toEqual([AppPermission.PIPELINE_STAGES_EDIT]);
    });

    it('requires pipeline_stages:delete permission on remove endpoint', () => {
      const permissions = getPermissionsMetadata(
        PipelineStagesController.prototype,
        'remove',
      );

      expect(permissions).toEqual([AppPermission.PIPELINE_STAGES_DELETE]);
    });
  });

  describe('findAll', () => {
    it('verifies membership then delegates to service', async () => {
      const organizationId = 'org-1';
      const userId = 'user-1';
      const req = { user: { id: userId } };
      const stages = [{ id: 'stage-1', organization_id: organizationId }];

      verifyUserInOrganizationMock.mockResolvedValueOnce(undefined);
      findAllMock.mockResolvedValueOnce(stages);

      const result = await controller.findAll(
        organizationId,
        req as Parameters<PipelineStagesController['findAll']>[1],
      );

      expect(verifyUserInOrganizationMock).toHaveBeenCalledWith(
        organizationId,
        userId,
      );
      expect(findAllMock).toHaveBeenCalledWith(organizationId);
      expect(result).toEqual(stages);
    });
  });
});
