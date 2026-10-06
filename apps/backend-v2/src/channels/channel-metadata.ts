import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Merge metadata under serializable isolation; concurrent progress must survive. */
export async function updateChannelMetadata(
  prisma: PrismaService,
  id: string,
  organizationId: string,
  change: (current: Prisma.JsonObject) => Prisma.InputJsonObject,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const channel = await tx.channel.findFirstOrThrow({
            where: { id, organizationId },
          });
          return tx.channel.update({
            where: { id },
            data: {
              metadata: change((channel.metadata as Prisma.JsonObject) ?? {}),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034' && attempt < 2)
        continue;
      throw error;
    }
  }
}
