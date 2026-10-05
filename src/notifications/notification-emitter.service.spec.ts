import { NotificationEmitterService } from './notification-emitter.service';

describe('notification translation metadata persistence', () => {
  it.each([true, false])(
    'persists safe params when PII access is %s',
    async (pii) => {
      const create = jest.fn().mockResolvedValue({ id: 'notification' });
      const tx = {
        notification: { create },
        outboxEvent: { create: jest.fn() },
      };
      const prisma = {
        organizationMembership: {
          findFirst: jest.fn().mockResolvedValue({ id: 'membership' }),
        },
        $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      };
      const permissions = {
        has: jest.fn((_user: string, _org: string, permission: string) =>
          Promise.resolve(permission === 'leads:read:pii' ? pii : true),
        ),
      };
      const service = new NotificationEmitterService(
        prisma as never,
        permissions as never,
      );
      await service.send({
        organizationId: 'org',
        userId: 'self',
        type: 'NEW_MESSAGE',
        code: 'NEW_MESSAGE',
        params: { name: 'Synthetic', preview: 'Hello' },
        title: 'New message',
        body: 'Hello',
      });
      expect(create.mock.calls[0][0].data).toMatchObject(
        pii
          ? {
              code: 'NEW_MESSAGE',
              params: { name: 'Synthetic', preview: 'Hello' },
            }
          : { code: 'GENERIC_NOTIFICATION', params: {} },
      );
    },
  );
});
