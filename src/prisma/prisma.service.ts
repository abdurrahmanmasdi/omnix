import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../request-context/request-context.service';

const SOFT_DELETE_MODEL_NAMES = [
  'User',
  'Organization',
  'Lead',
  'Message',
  'LeadNote',
  'LeadAttachment',
] as const;

export const TENANT_BOUND_MODELS = [
  'Role',
  'Invitation',
  'OrganizationMembership',
  'Conversation',
  'PipelineStage',
  'LeadSource',
  'Lead',
] as const;

type SoftDeleteModelName = (typeof SOFT_DELETE_MODEL_NAMES)[number];

const SOFT_DELETE_MODELS = new Set<string>(SOFT_DELETE_MODEL_NAMES);
const TENANT_BOUND_MODEL_SET = new Set<string>(TENANT_BOUND_MODELS);

const GENERATED_MODELS_WITH_DELETED_AT = new Set<string>(
  (Prisma.dmmf?.datamodel?.models ?? [])
    .filter((model) =>
      model.fields.some((field) => field.name === 'deleted_at'),
    )
    .map((model) => model.name),
);

type SoftDeleteDelegate = {
  update(args: Record<string, unknown>): Promise<unknown>;
  updateMany(args: Record<string, unknown>): Promise<unknown>;
  findFirst(args: Record<string, unknown>): Promise<unknown>;
};

const PASSTHROUGH_PROPERTIES = new Set<string>([
  'onModuleInit',
  'onModuleDestroy',
  'configService',
  'extendedClient',
]);

function isSoftDeleteModel(model: string | undefined): model is string {
  return Boolean(
    model &&
    SOFT_DELETE_MODELS.has(model) &&
    GENERATED_MODELS_WITH_DELETED_AT.has(model),
  );
}

function toSoftDeleteModelName(model: string): SoftDeleteModelName {
  if (SOFT_DELETE_MODEL_NAMES.includes(model as SoftDeleteModelName)) {
    return model as SoftDeleteModelName;
  }

  throw new Error(`Unsupported soft-delete model: ${model}`);
}

function getSoftDeleteDelegate(
  client: PrismaClient,
  model: SoftDeleteModelName,
): SoftDeleteDelegate {
  switch (model) {
    case 'User':
      return client.user as unknown as SoftDeleteDelegate;
    case 'Organization':
      return client.organization as unknown as SoftDeleteDelegate;
    case 'Lead':
      return client.lead as unknown as SoftDeleteDelegate;
    case 'Message':
      return client.message as unknown as SoftDeleteDelegate;
    case 'LeadNote':
      return client.leadNote as unknown as SoftDeleteDelegate;
    case 'LeadAttachment':
      return client.leadAttachment as unknown as SoftDeleteDelegate;
  }
}

function hasExplicitDeletedAtFilter(where: unknown): boolean {
  if (!where || typeof where !== 'object') {
    return false;
  }

  const node = where as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(node, 'deleted_at')) {
    return true;
  }

  const keys = ['AND', 'OR', 'NOT'] as const;

  for (const key of keys) {
    const value = node[key];

    if (
      Array.isArray(value) &&
      value.some((item) => hasExplicitDeletedAtFilter(item))
    ) {
      return true;
    }

    if (!Array.isArray(value) && hasExplicitDeletedAtFilter(value)) {
      return true;
    }
  }

  return false;
}

function withNotDeletedWhere<T extends Record<string, unknown> | undefined>(
  where: T,
): Record<string, unknown> {
  if (where && hasExplicitDeletedAtFilter(where)) {
    return where;
  }

  if (!where) {
    return { deleted_at: null };
  }

  return {
    AND: [where, { deleted_at: null }],
  };
}

function isTenantBoundModel(model: string | undefined): model is string {
  return Boolean(model && TENANT_BOUND_MODEL_SET.has(model));
}

function toDelegateProperty(model: string): string {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
}

function getFindFirstDelegate(
  client: PrismaClient,
  model: string,
): { findFirst: (args: Record<string, unknown>) => Promise<unknown> } | null {
  const delegateProperty = toDelegateProperty(model);
  const delegate = (client as unknown as Record<string, unknown>)[
    delegateProperty
  ] as Record<string, unknown> | undefined;

  if (!delegate || typeof delegate.findFirst !== 'function') {
    return null;
  }

  return {
    findFirst: delegate.findFirst as (
      args: Record<string, unknown>,
    ) => Promise<unknown>,
  };
}

function withTenantWhere(
  args: Record<string, unknown> | undefined,
  tenantId: string,
): Record<string, unknown> {
  const typedArgs = args ?? {};
  const where = typedArgs.where as Record<string, unknown> | undefined;

  return {
    ...typedArgs,
    where: where
      ? {
          AND: [where, { organization_id: tenantId }],
        }
      : {
          organization_id: tenantId,
        },
  };
}

function callExtensionQuery(
  query: unknown,
  args: Record<string, unknown>,
): Promise<unknown> {
  const typedQuery = query as (
    queryArgs: Record<string, unknown>,
  ) => Promise<unknown>;

  return typedQuery(args);
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly extendedClient: PrismaClient;

  constructor(
    private configService: ConfigService,
    private requestContextService: RequestContextService,
  ) {
    // 1. Create a connection pool using the native 'pg' driver
    // 1. Safely get the URL from the ConfigService
    const connectionString = configService.get<string>('DATABASE_URL');

    const pool = new Pool({
      connectionString: connectionString,
    });

    // 2. Wrap the pool in Prisma's adapter
    const adapter = new PrismaPg(
      pool as unknown as ConstructorParameters<typeof PrismaPg>[0],
    );

    // 3. Pass the adapter to the PrismaClient
    super({ adapter });

    const baseClient = this as unknown as PrismaClient;
    const requestContext = this.requestContextService;

    const softDeleteExtendedClient = this.$extends({
      query: {
        $allModels: {
          async delete({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }

            const delegate = getSoftDeleteDelegate(
              baseClient,
              toSoftDeleteModelName(model),
            );

            return delegate.update({
              ...(args as Record<string, unknown>),
              data: {
                ...(((args as Record<string, unknown>)?.data as
                  | Record<string, unknown>
                  | undefined) ?? {}),
                deleted_at: new Date(),
              },
            });
          },
          async deleteMany({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }

            const delegate = getSoftDeleteDelegate(
              baseClient,
              toSoftDeleteModelName(model),
            );

            return delegate.updateMany({
              ...(args as Record<string, unknown>),
              data: {
                ...(((args as Record<string, unknown>)?.data as
                  | Record<string, unknown>
                  | undefined) ?? {}),
                deleted_at: new Date(),
              },
            });
          },
          async findUnique({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }

            const delegate = getSoftDeleteDelegate(
              baseClient,
              toSoftDeleteModelName(model),
            );
            const typedArgs = (args as Record<string, unknown>) ?? {};
            const where =
              (typedArgs.where as Record<string, unknown> | undefined) ??
              undefined;

            return delegate.findFirst({
              ...typedArgs,
              where: withNotDeletedWhere(where),
            });
          },
          async findFirst({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }

            const typedArgs = (args as Record<string, unknown>) ?? {};
            const where =
              (typedArgs.where as Record<string, unknown> | undefined) ??
              undefined;

            return query({
              ...typedArgs,
              where: withNotDeletedWhere(where),
            });
          },
          async findMany({ model, args, query }) {
            if (!isSoftDeleteModel(model)) {
              return query(args);
            }

            const typedArgs = (args as Record<string, unknown>) ?? {};
            const where =
              (typedArgs.where as Record<string, unknown> | undefined) ??
              undefined;

            return query({
              ...typedArgs,
              where: withNotDeletedWhere(where),
            });
          },
        },
      },
    }) as unknown as PrismaClient;

    this.extendedClient = softDeleteExtendedClient.$extends({
      query: {
        $allModels: {
          async findUnique({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            const tenantArgs = withTenantWhere(
              args as Record<string, unknown> | undefined,
              tenantId,
            );

            const delegate = getFindFirstDelegate(
              softDeleteExtendedClient,
              model,
            );
            if (delegate) {
              return delegate.findFirst(tenantArgs);
            }

            return callExtensionQuery(query, tenantArgs);
          },

          async findFirst({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async findMany({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async update({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async updateMany({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async delete({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async deleteMany({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async aggregate({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async count({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },

          async groupBy({ model, args, query }) {
            if (!isTenantBoundModel(model)) {
              return query(args);
            }

            if (requestContext.isSystemBypass()) {
              return query(args);
            }

            const tenantId = requestContext.getTenantId();
            if (!tenantId) {
              return query(args);
            }

            return callExtensionQuery(
              query,
              withTenantWhere(
                args as Record<string, unknown> | undefined,
                tenantId,
              ),
            );
          },
        },
      },
    }) as unknown as PrismaClient;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && PASSTHROUGH_PROPERTIES.has(prop)) {
          const passthroughValue = Reflect.get(
            target,
            prop,
            receiver,
          ) as unknown;
          return passthroughValue;
        }

        const extendedValue = Reflect.get(
          target.extendedClient as object,
          prop,
          receiver,
        ) as unknown;

        return extendedValue;
      },
    });
  }

  // Connects to the database when the NestJS app starts
  async onModuleInit() {
    await this.extendedClient.$connect();
  }

  // Disconnects cleanly when the app shuts down
  async onModuleDestroy() {
    await this.extendedClient.$disconnect();
  }
}
