import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActionExecutorService } from './action-executor.service';
import { ToolActionWire } from './interfaces/agent.interface';

const logger = new Logger('ActionClaim');

/** A stable UUID for an idempotency claim row. */
export function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Executes a generation's actions at most once (B9): a job retry after the
 * actions ran (e.g. a crash before the bubbles were stored) must not send
 * a second staff alert or schedule a second follow-up. The claim row (audit
 * `ai.actions_executed`, id derived from `generationKey`) also remembers
 * whether the first run needed the fallback reply. Callers must use keys
 * that are unique per generation and never shared between job kinds.
 * Returns true when the fallback reply + handoff is required.
 */
export async function executeActionsOnce(
  prisma: PrismaService,
  actionExecutor: Pick<ActionExecutorService, 'executeActions'>,
  input: {
    organizationId: string;
    conversationId: string;
    generationKey: string;
    actions: ToolActionWire[];
  },
): Promise<boolean> {
  const { organizationId, conversationId, generationKey, actions } = input;
  const id = deterministicUuid(`${generationKey}:actions`);
  try {
    await prisma.auditLog.create({
      data: {
        id,
        organizationId,
        actor: 'ai',
        action: 'ai.actions_executed',
        targetId: conversationId,
        metadata: {
          batchKey: generationKey,
          actionTypes: actions.map((action) => action.type),
        },
      },
    });
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
    const claim = await prisma.auditLog.findUnique({ where: { id } });
    logger.warn(`AI_ACTIONS_ALREADY_EXECUTED conversationId=${conversationId}`);
    return (
      (claim?.metadata as { fallback?: boolean } | null)?.fallback === true
    );
  }
  const actionResult = await actionExecutor.executeActions(
    organizationId,
    conversationId,
    actions,
  );
  const fallback =
    actionResult.outcomes?.some((item) => item.status !== 'EXECUTED') ||
    actionResult.rejected > 0 ||
    actionResult.failed > 0;
  await prisma.auditLog.update({
    where: { id },
    data: {
      metadata: {
        batchKey: generationKey,
        actionTypes: actions.map((action) => action.type),
        fallback,
      },
    },
  });
  return fallback;
}
