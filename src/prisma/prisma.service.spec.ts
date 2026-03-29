import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

type ExtensionQueryArgs = {
  model: string;
  args: Record<string, unknown>;
  query: (args: Record<string, unknown>) => Promise<unknown>;
};

type AllModelsQueryHandlers = {
  delete: (args: ExtensionQueryArgs) => Promise<unknown>;
  deleteMany: (args: ExtensionQueryArgs) => Promise<unknown>;
  findUnique: (args: ExtensionQueryArgs) => Promise<unknown>;
  findFirst: (args: ExtensionQueryArgs) => Promise<unknown>;
  findMany: (args: ExtensionQueryArgs) => Promise<unknown>;
};

type DelegateMock = {
  update: jest.Mock;
  updateMany: jest.Mock;
  findFirst: jest.Mock;
};

type MockedPrismaBaseClient = {
  user: DelegateMock;
  organization: DelegateMock;
  lead: DelegateMock;
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
  class PrismaClientMock {
    user = createSoftDeleteDelegate('User');
    organization = createSoftDeleteDelegate('Organization');
    lead = createSoftDeleteDelegate('Lead');
    message = createSoftDeleteDelegate('Message');
    leadNote = createSoftDeleteDelegate('LeadNote');
    leadAttachment = createSoftDeleteDelegate('LeadAttachment');
    conversation = {
      delete: jest.fn(),
      deleteMany: jest.fn(),
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
      const allModels = extension.query.$allModels;

      const bind = (model: string, method: keyof AllModelsQueryHandlers) => {
        return async (args: Record<string, unknown> = {}) =>
          allModels[method]({
            model,
            args,
            query: createPassthroughQuery(model, String(method)),
          });
      };

      return {
        user: {
          delete: bind('User', 'delete'),
          deleteMany: bind('User', 'deleteMany'),
          findUnique: bind('User', 'findUnique'),
          findFirst: bind('User', 'findFirst'),
          findMany: bind('User', 'findMany'),
        },
        conversation: {
          delete: bind('Conversation', 'delete'),
          deleteMany: bind('Conversation', 'deleteMany'),
          findUnique: bind('Conversation', 'findUnique'),
          findFirst: bind('Conversation', 'findFirst'),
          findMany: bind('Conversation', 'findMany'),
        },
        $connect: this.$connect,
        $disconnect: this.$disconnect,
      };
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

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://test:test@localhost:5432/test';
      }
      return null;
    }),
  };

  beforeEach(async () => {
    prismaBaseClients.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
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
          where: {
            AND: Array<Record<string, unknown>>;
          };
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
        AND: Array<Record<string, unknown>>;
      };
    };

    expect(typedFindFirstArgs.where).toEqual({
      AND: [{ id: 'user-1' }, { deleted_at: null }],
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

  it('passes non-soft-delete model delete through original query without mutation', async () => {
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
  });

  it('delegates module lifecycle connect and disconnect to extended client', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(baseClient.$connect).toHaveBeenCalledTimes(1);
    expect(baseClient.$disconnect).toHaveBeenCalledTimes(1);
  });
});
