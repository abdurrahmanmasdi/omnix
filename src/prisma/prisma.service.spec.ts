import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { RequestContextService } from '../request-context/request-context.service';

type ExtensionQueryArgs = {
  model: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

type AllModelsQueryHandlers = Record<
  string,
  (args: ExtensionQueryArgs) => Promise<unknown>
>;

type DelegateMock = {
  update: jest.Mock;
  updateMany: jest.Mock;
  findFirst: jest.Mock;
};

type MockedPrismaBaseClient = {
  user: DelegateMock;
  organization: DelegateMock;
  lead: DelegateMock;
  role: Record<string, jest.Mock>;
  invitation: Record<string, jest.Mock>;
  organizationMembership: Record<string, jest.Mock>;
  pipelineStage: Record<string, jest.Mock>;
  leadSource: Record<string, jest.Mock>;
  message: DelegateMock;
  leadNote: DelegateMock;
  leadAttachment: DelegateMock;
  conversation: {
    delete: jest.Mock;
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $extends: jest.Mock;
};

const prismaBaseClients: MockedPrismaBaseClient[] = [];

const createSoftDeleteDelegate = (modelName: string): DelegateMock => ({
  update: jest.fn().mockImplementation((args: Record<string, unknown>) => ({
    op: 'update',
    model: modelName,
    args,
  })),
  updateMany: jest.fn().mockImplementation((args: Record<string, unknown>) => ({
    op: 'updateMany',
    model: modelName,
    args,
  })),
  findFirst: jest.fn().mockImplementation((args: Record<string, unknown>) => ({
    op: 'findFirst',
    model: modelName,
    args,
  })),
});

const createPassthroughQuery = (
  model: string,
  method: string,
): ((args: Record<string, unknown>) => Promise<unknown>) => {
  return jest.fn().mockImplementation((args: Record<string, unknown>) => {
    return Promise.resolve({
      op: method,
      model,
      args,
      passthrough: true,
    });
  });
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@prisma/client', () => {
  const createGenericDelegate = () => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  });

  class PrismaClientMock {
    user = createSoftDeleteDelegate('User');
    organization = createSoftDeleteDelegate('Organization');
    lead = createSoftDeleteDelegate('Lead');
    role = createGenericDelegate();
    invitation = createGenericDelegate();
    organizationMembership = createGenericDelegate();
    pipelineStage = createGenericDelegate();
    leadSource = createGenericDelegate();
    message = createSoftDeleteDelegate('Message');
    leadNote = createSoftDeleteDelegate('LeadNote');
    leadAttachment = createSoftDeleteDelegate('LeadAttachment');
    conversation = {
      delete: jest.fn().mockImplementation((args: Record<string, unknown>) =>
        Promise.resolve({
          op: 'delete',
          model: 'Conversation',
          args,
          passthrough: true,
        }),
      ),
      deleteMany: jest
        .fn()
        .mockImplementation((args: Record<string, unknown>) =>
          Promise.resolve({
            op: 'deleteMany',
            model: 'Conversation',
            args,
            passthrough: true,
          }),
        ),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    };
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);

    constructor() {
      prismaBaseClients.push(this as unknown as MockedPrismaBaseClient);
    }

    $extends(extension: {
      query: {
        $allModels: AllModelsQueryHandlers;
      };
    }) {
      const applyExtension = (
        previousClient: Record<string, unknown>,
        inputExtension: {
          query: {
            $allModels: AllModelsQueryHandlers;
          };
        },
      ) => {
        const allModels = inputExtension.query.$allModels;

        const bindModel = (
          model: string,
          previousModel: Record<string, unknown>,
        ) => {
          const wrappedModel: Record<string, unknown> = {
            ...previousModel,
          };

          for (const method of Object.keys(allModels)) {
            const handler = allModels[method];

            if (typeof handler !== 'function') {
              continue;
            }

            wrappedModel[method] = (args: Record<string, unknown> = {}) => {
              const previousMethod = previousModel[method] as
                | ((methodArgs: Record<string, unknown>) => Promise<unknown>)
                | undefined;

              return handler({
                model,
                args,
                query: previousMethod
                  ? (queryArgs: Record<string, unknown>) =>
                      Promise.resolve(previousMethod(queryArgs))
                  : createPassthroughQuery(model, method),
              });
            };
          }

          return wrappedModel;
        };

        const extendedClient: Record<string, unknown> = {
          ...previousClient,
          user: bindModel(
            'User',
            (previousClient.user as Record<string, unknown>) ?? {},
          ),
          organization: bindModel(
            'Organization',
            (previousClient.organization as Record<string, unknown>) ?? {},
          ),
          lead: bindModel(
            'Lead',
            (previousClient.lead as Record<string, unknown>) ?? {},
          ),
          role: bindModel(
            'Role',
            (previousClient.role as Record<string, unknown>) ?? {},
          ),
          invitation: bindModel(
            'Invitation',
            (previousClient.invitation as Record<string, unknown>) ?? {},
          ),
          organizationMembership: bindModel(
            'OrganizationMembership',
            (previousClient.organizationMembership as Record<
              string,
              unknown
            >) ?? {},
          ),
          conversation: bindModel(
            'Conversation',
            (previousClient.conversation as Record<string, unknown>) ?? {},
          ),
          pipelineStage: bindModel(
            'PipelineStage',
            (previousClient.pipelineStage as Record<string, unknown>) ?? {},
          ),
          leadSource: bindModel(
            'LeadSource',
            (previousClient.leadSource as Record<string, unknown>) ?? {},
          ),
          message: bindModel(
            'Message',
            (previousClient.message as Record<string, unknown>) ?? {},
          ),
          leadNote: bindModel(
            'LeadNote',
            (previousClient.leadNote as Record<string, unknown>) ?? {},
          ),
          leadAttachment: bindModel(
            'LeadAttachment',
            (previousClient.leadAttachment as Record<string, unknown>) ?? {},
          ),
          $connect: previousClient.$connect,
          $disconnect: previousClient.$disconnect,
        };

        extendedClient.$extends = (nextExtension: {
          query: {
            $allModels: AllModelsQueryHandlers;
          };
        }) => applyExtension(extendedClient, nextExtension);

        return extendedClient;
      };

      return applyExtension(
        this as unknown as Record<string, unknown>,
        extension,
      );
    }
  }

  return {
    PrismaClient: PrismaClientMock,
    Prisma: {
      dmmf: {
        datamodel: {
          models: [
            {
              name: 'User',
              fields: [{ name: 'id' }, { name: 'deleted_at' }],
            },
            {
              name: 'Organization',
              fields: [{ name: 'id' }, { name: 'deleted_at' }],
            },
            {
              name: 'Lead',
              fields: [{ name: 'id' }, { name: 'deleted_at' }],
            },
            {
              name: 'Message',
              fields: [{ name: 'id' }, { name: 'deleted_at' }],
            },
            {
              name: 'LeadNote',
              fields: [{ name: 'id' }, { name: 'deleted_at' }],
            },
            {
              name: 'LeadAttachment',
              fields: [{ name: 'id' }, { name: 'deleted_at' }],
            },
            {
              name: 'Conversation',
              fields: [{ name: 'id' }],
            },
          ],
        },
      },
    },
  };
});

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let baseClient: MockedPrismaBaseClient;
  const mockRequestContextService = {
    getTenantId: jest.fn(),
    getStore: jest.fn(),
  } as jest.Mocked<Pick<RequestContextService, 'getTenantId' | 'getStore'>>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://test:test@localhost:5432/test';
      }
      return null;
    }),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    prismaBaseClients.length = 0;
    mockRequestContextService.getTenantId.mockReset();
    mockRequestContextService.getTenantId.mockReturnValue(undefined);
    mockRequestContextService.getStore.mockReset();
    mockRequestContextService.getStore.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    const latestBaseClient = prismaBaseClients[prismaBaseClients.length - 1];

    if (!latestBaseClient) {
      throw new Error('Expected mocked Prisma base client to be created.');
    }

    baseClient = latestBaseClient;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rewrites delete on soft-delete models into update with deleted_at timestamp', async () => {
    await (
      service as unknown as {
        user: { delete: (args: Record<string, unknown>) => Promise<unknown> };
      }
    ).user.delete({
      where: { id: 'user-1' },
    });

    expect(baseClient.user.update).toHaveBeenCalledTimes(1);
    const updateCalls = baseClient.user.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: { deleted_at: Date };
        },
      ]
    >;
    const updateArgs = updateCalls[0]?.[0];

    expect(updateArgs).toBeDefined();
    if (!updateArgs) {
      throw new Error('Expected update call arguments.');
    }

    const typedUpdateArgs = updateArgs as {
      where: { id: string };
      data: { deleted_at: Date };
    };

    expect(typedUpdateArgs.where).toEqual({ id: 'user-1' });
    expect(typedUpdateArgs.data.deleted_at).toBeInstanceOf(Date);
  });

  it('rewrites deleteMany on soft-delete models into updateMany with deleted_at timestamp', async () => {
    await (
      service as unknown as {
        user: {
          deleteMany: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });

    expect(baseClient.user.updateMany).toHaveBeenCalledTimes(1);
    const updateManyCalls = baseClient.user.updateMany.mock.calls as Array<
      [
        {
          where: { email: { contains: string } };
          data: { deleted_at: Date };
        },
      ]
    >;
    const updateManyArgs = updateManyCalls[0]?.[0];

    expect(updateManyArgs).toBeDefined();
    if (!updateManyArgs) {
      throw new Error('Expected updateMany call arguments.');
    }

    const typedUpdateManyArgs = updateManyArgs as {
      where: { email: { contains: string } };
      data: { deleted_at: Date };
    };

    expect(typedUpdateManyArgs.where).toEqual({
      email: { contains: '@example.com' },
    });
    expect(typedUpdateManyArgs.data.deleted_at).toBeInstanceOf(Date);
  });

  it('rewrites findUnique on soft-delete models into findFirst with deleted_at null filter', async () => {
    await (
      service as unknown as {
        user: {
          findUnique: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.findUnique({
      where: { id: 'user-1' },
    });

    expect(baseClient.user.findFirst).toHaveBeenCalledTimes(1);
    const findFirstCalls = baseClient.user.findFirst.mock.calls as Array<
      [
        {
          where: Record<string, unknown>;
        },
      ]
    >;
    const findFirstArgs = findFirstCalls[0]?.[0];

    expect(findFirstArgs).toBeDefined();
    if (!findFirstArgs) {
      throw new Error('Expected findFirst call arguments.');
    }

    const typedFindFirstArgs = findFirstArgs as {
      where: {
        id: string;
        deleted_at: null;
      };
    };

    expect(typedFindFirstArgs.where).toEqual({
      id: 'user-1',
      deleted_at: null,
    });
  });

  it('does not wrap findUnique where clause when deleted_at is explicitly present', async () => {
    const explicitWhere = {
      id: 'user-1',
      deleted_at: { not: null },
    };

    await (
      service as unknown as {
        user: {
          findUnique: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.findUnique({
      where: explicitWhere,
    });

    expect(baseClient.user.findFirst).toHaveBeenCalledTimes(1);
    const findFirstCalls = baseClient.user.findFirst.mock.calls as Array<
      [
        {
          where: Record<string, unknown>;
        },
      ]
    >;
    const findFirstArgs = findFirstCalls[0]?.[0];

    expect(findFirstArgs).toBeDefined();
    if (!findFirstArgs) {
      throw new Error('Expected findFirst call arguments.');
    }

    const typedFindFirstArgs = findFirstArgs as {
      where: Record<string, unknown>;
    };

    expect(typedFindFirstArgs.where).toEqual(explicitWhere);
  });

  it('does not inject deleted_at null when count explicitly requests deleted records', async () => {
    const trashWhere = {
      deleted_at: { not: null },
    };

    const result = await (
      service as unknown as {
        user: {
          count: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.count({
      where: trashWhere,
    });

    expect(result).toEqual({
      op: 'count',
      model: 'User',
      args: {
        where: trashWhere,
      },
      passthrough: true,
    });
  });

  it('does not inject deleted_at null when aggregate explicitly filters by deleted_at date', async () => {
    const deletedAtDate = new Date('2026-03-01T00:00:00.000Z');
    const trashWhere = {
      deleted_at: deletedAtDate,
    };

    const result = await (
      service as unknown as {
        user: {
          aggregate: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.aggregate({
      _count: { _all: true },
      where: trashWhere,
    });

    expect(result).toEqual({
      op: 'aggregate',
      model: 'User',
      args: {
        _count: { _all: true },
        where: trashWhere,
      },
      passthrough: true,
    });
  });

  it('does not inject deleted_at null when deleted_at is explicitly nested in OR and NOT arrays', async () => {
    const deletedAtDate = new Date('2026-03-02T00:00:00.000Z');
    const trashWhere = {
      OR: [
        { deleted_at: { not: null } },
        {
          NOT: [{ deleted_at: deletedAtDate }],
        },
      ],
    };

    const result = await (
      service as unknown as {
        user: {
          groupBy: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.groupBy({
      by: ['email'],
      where: trashWhere,
    });

    expect(result).toEqual({
      op: 'groupBy',
      model: 'User',
      args: {
        by: ['email'],
        where: trashWhere,
      },
      passthrough: true,
    });
  });

  it('injects deleted_at filter into count for soft-delete models', async () => {
    const result = await (
      service as unknown as {
        user: {
          count: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.count({
      where: { email: { contains: '@example.com' } },
    });

    expect(result).toEqual({
      op: 'count',
      model: 'User',
      args: {
        where: {
          email: { contains: '@example.com' },
          deleted_at: null,
        },
      },
      passthrough: true,
    });
  });

  it('injects deleted_at filter into aggregate for soft-delete models', async () => {
    const result = await (
      service as unknown as {
        user: {
          aggregate: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.aggregate({
      _count: { _all: true },
      where: { first_name: { contains: 'A' } },
    });

    expect(result).toEqual({
      op: 'aggregate',
      model: 'User',
      args: {
        _count: { _all: true },
        where: {
          first_name: { contains: 'A' },
          deleted_at: null,
        },
      },
      passthrough: true,
    });
  });

  it('deeply merges deleted_at filter into groupBy where clauses', async () => {
    const result = await (
      service as unknown as {
        user: {
          groupBy: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).user.groupBy({
      by: ['email'],
      where: {
        AND: [{ first_name: { contains: 'A' } }],
        OR: [
          { email: { contains: '@example.com' } },
          { email: { contains: '@test.com' } },
        ],
      },
    });

    expect(result).toEqual({
      op: 'groupBy',
      model: 'User',
      args: {
        by: ['email'],
        where: {
          AND: [{ first_name: { contains: 'A' } }, { deleted_at: null }],
          OR: [
            { email: { contains: '@example.com' } },
            { email: { contains: '@test.com' } },
          ],
        },
      },
      passthrough: true,
    });
  });

  it('passes tenant-bound non-soft-delete delete through original query when bypassSystem is active', async () => {
    mockRequestContextService.getStore.mockReturnValue({ bypassSystem: true });

    const result = await (
      service as unknown as {
        conversation: {
          delete: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).conversation.delete({ where: { id: 'conv-1' } });

    expect(baseClient.user.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      op: 'delete',
      model: 'Conversation',
      args: { where: { id: 'conv-1' } },
      passthrough: true,
    });
    expect(mockRequestContextService.getTenantId).not.toHaveBeenCalled();
  });

  it('applies tenant filter for tenant-bound queries when tenant context exists', async () => {
    mockRequestContextService.getTenantId.mockReturnValue('org-1');

    await (
      service as unknown as {
        conversation: {
          findMany: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).conversation.findMany({ where: { id: 'conv-1' } });

    expect(baseClient.conversation.findMany).toHaveBeenCalledTimes(1);
    expect(baseClient.conversation.findMany).toHaveBeenCalledWith({
      where: {
        AND: [{ id: 'conv-1' }, { organization_id: 'org-1' }],
      },
    });
  });

  it('skips tenant filter when system bypass is active', async () => {
    mockRequestContextService.getStore.mockReturnValue({ bypassSystem: true });
    mockRequestContextService.getTenantId.mockReturnValue('org-1');

    await (
      service as unknown as {
        conversation: {
          findMany: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).conversation.findMany({ where: { id: 'conv-1' } });

    expect(baseClient.conversation.findMany).toHaveBeenCalledTimes(1);
    expect(baseClient.conversation.findMany).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
    });
    expect(mockRequestContextService.getTenantId).not.toHaveBeenCalled();
  });

  it('delegates module lifecycle connect and disconnect to extended client', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(baseClient.$connect).toHaveBeenCalledTimes(1);
    expect(baseClient.$disconnect).toHaveBeenCalledTimes(1);
  });
});
