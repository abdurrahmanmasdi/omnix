import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { getTenantId, isSystemBypass } from '../core/tenant/tenant.context';
import { Pool } from 'pg';

export const TENANT_BOUND_MODEL_SET = new Set<string>(
  (Prisma.dmmf?.datamodel?.models ?? [])
    .filter((model) =>
      model.fields.some((field) => field.name === 'organizationId'),
    )
    .map((model) => model.name),
);

const PASSTHROUGH_PROPERTIES = new Set<string>([
  'onModuleInit',
  'onModuleDestroy',
  '$connect',
  '$disconnect',
  'extendedClient',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Fix 4: Typed as unknown so TypeScript doesn't expect the missing '$on' property
  private readonly extendedClient: unknown;

  constructor() {
    const databaseUrl = process.env['DATABASE_URL'];

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool({ connectionString: databaseUrl });
    super({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    });

    const self = this;
    const extended = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !TENANT_BOUND_MODEL_SET.has(model)) {
              return query(args);
            }

            if (isSystemBypass()) {
              return query(args);
            }

            const organizationId = getTenantId();
            if (!organizationId) {
              throw new Error(
                `[Security] Missing Tenant Context for model: ${model}`,
              );
            }

            // Fix 1 & 2: Safely cast to Record instead of 'any'
            const typedArgs = (args as Record<string, unknown>) ?? {};

            // Fix 3: Safely extract and reassign nested properties without 'any'
            if (
              [
                'findUnique',
                'findFirst',
                'findMany',
                'count',
                'aggregate',
                'groupBy',
              ].includes(operation)
            ) {
              const where = (typedArgs.where as Record<string, unknown>) ?? {};
              typedArgs.where = { ...where, organizationId };
            } else if (['create', 'createMany'].includes(operation)) {
              const data = typedArgs.data;
              if (Array.isArray(data)) {
                typedArgs.data = data.map((d: unknown) => ({
                  ...(d as Record<string, unknown>),
                  organizationId,
                }));
              } else {
                typedArgs.data = {
                  ...(data as Record<string, unknown>),
                  organizationId,
                };
              }
            } else if (
              ['update', 'updateMany', 'delete', 'deleteMany'].includes(
                operation,
              )
            ) {
              const where = (typedArgs.where as Record<string, unknown>) ?? {};
              typedArgs.where = { ...where, organizationId };
            }

            // Safely cast the query function so ESLint knows we aren't returning an unsafe call
            const typedQuery = query as (
              queryArgs: Record<string, unknown>,
            ) => Promise<unknown>;
            const result = await typedQuery(typedArgs);

            if (
              model === 'Lead' &&
              (operation === 'update' || operation === 'updateMany')
            ) {
              const data = (typedArgs.data as Record<string, unknown>) ?? {};
              if (data.deletedAt !== undefined && data.deletedAt !== null) {
                const leadIds: string[] = [];
                if (
                  operation === 'update' &&
                  result &&
                  typeof result === 'object' &&
                  'id' in result
                ) {
                  leadIds.push((result as any).id as string);
                }

                if (leadIds.length > 0) {
                  // Run bypass to prevent recursive interception issues
                  await self.conversation.updateMany({
                    where: { leadId: { in: leadIds }, organizationId },
                    data: { deletedAt: data.deletedAt as Date },
                  });
                  await (self as any).scheduledFollowUp.updateMany({
                    where: { leadId: { in: leadIds }, organizationId },
                    data: { deletedAt: data.deletedAt as Date },
                  });
                }
              }
            }

            return result;
          },
        },
      },
    });

    this.extendedClient = extended;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && PASSTHROUGH_PROPERTIES.has(prop)) {
          // Fix 5: Cast the Reflect return to unknown to satisfy ESLint
          return Reflect.get(target, prop, receiver) as unknown;
        }

        // Cast extendedClient to an object to safely Reflect off of it
        return Reflect.get(
          target.extendedClient as object,
          prop,
          receiver,
        ) as unknown;
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
