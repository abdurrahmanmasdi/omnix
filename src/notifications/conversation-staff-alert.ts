import { NotificationType, Prisma } from '@prisma/client';
import {
  MEMBERSHIP_GRANTS_INCLUDE,
  membershipHasPermission,
} from '../auth/permission.service';

/**
 * Inside the caller's transaction: one SYSTEM_ALERT per eligible staff member
 * of the conversation (notifications:view and assigned, or leads:read:all),
 * each with a notification.broadcast outbox intent. Returns the recipient
 * count. Title/body must not contain patient text.
 */
export async function alertConversationStaff(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    conversation: {
      id: string;
      leadId: string | null;
      assignedAgentId: string | null;
      lead?: { assignedAgentId: string | null } | null;
    };
    title: string;
    body: string;
  },
): Promise<number> {
  const { organizationId, conversation } = input;
  const memberships = await tx.organizationMembership.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      deletedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
    },
    include: MEMBERSHIP_GRANTS_INCLUDE,
  });
  const recipients = memberships.filter(
    (membership) =>
      membershipHasPermission(membership, 'notifications:view') &&
      (membership.userId === conversation.lead?.assignedAgentId ||
        membership.userId === conversation.assignedAgentId ||
        membershipHasPermission(membership, 'leads:read:all')),
  );
  for (const membership of recipients) {
    const notification = await tx.notification.create({
      data: {
        organizationId,
        userId: membership.userId,
        type: NotificationType.SYSTEM_ALERT,
        title: input.title,
        body: input.body,
        referenceId: conversation.leadId ?? conversation.id,
        referenceType: conversation.leadId ? 'LEAD' : 'CONVERSATION',
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId,
        topic: 'notification.broadcast',
        payload: { organizationId, notificationId: notification.id },
      },
    });
  }
  return recipients.length;
}

/**
 * Inside the caller's transaction: one SYSTEM_ALERT per active member who can
 * manage channels (manage_channels + notifications:view), referencing the
 * channel. Returns the recipient count. Title/body must not contain secrets.
 */
export async function alertChannelManagers(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    channelId: string;
    title: string;
    body: string;
  },
): Promise<number> {
  const { organizationId } = input;
  const memberships = await tx.organizationMembership.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      deletedAt: null,
      user: { status: 'ACTIVE', deletedAt: null },
    },
    include: MEMBERSHIP_GRANTS_INCLUDE,
  });
  const recipients = memberships.filter(
    (membership) =>
      membershipHasPermission(membership, 'notifications:view') &&
      membershipHasPermission(membership, 'manage_channels'),
  );
  for (const membership of recipients) {
    const notification = await tx.notification.create({
      data: {
        organizationId,
        userId: membership.userId,
        type: NotificationType.SYSTEM_ALERT,
        title: input.title,
        body: input.body,
        referenceId: input.channelId,
        referenceType: 'CHANNEL',
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId,
        topic: 'notification.broadcast',
        payload: { organizationId, notificationId: notification.id },
      },
    });
  }
  return recipients.length;
}
