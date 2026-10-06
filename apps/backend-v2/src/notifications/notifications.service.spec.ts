import { Notification } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

function row(overrides: Partial<Notification>): Notification {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    organizationId: ORG,
    userId: USER,
    type: 'NEW_MESSAGE',
    code: null,
    params: null,
    title: 'Message from Ayse Yilmaz',
    body: 'Hello, my number is +90 555 000 00 00',
    isRead: false,
    referenceId: null,
    referenceType: null,
    createdAt: new Date('2026-10-03T10:00:00Z'),
    ...overrides,
  };
}

function build(grants: string[], rows: Notification[]) {
  const prisma = {
    notification: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  const permissions = {
    has: jest.fn((_u: string, _o: string, action: string) =>
      Promise.resolve(grants.includes(action)),
    ),
  };
  const service = new NotificationsService(
    prisma as never,
    permissions as never,
  );
  return { service, prisma, permissions };
}

describe('NotificationsService read-time generalization (KI-011)', () => {
  it('keeps stored text for a user with the PII and message grants', async () => {
    const { service } = build(
      ['leads:read:all', 'leads:read:pii', 'leads:read:messages'],
      [row({})],
    );
    const [n] = await service.getUserNotifications(ORG, USER);
    expect(n.title).toBe('Message from Ayse Yilmaz');
    expect(n.body).toContain('+90 555');
  });

  it('generalizes text stored while the user held grants they no longer hold', async () => {
    const { service } = build(['leads:read:all'], [row({})]);
    const [n] = await service.getUserNotifications(ORG, USER);
    expect(JSON.stringify(n)).not.toContain('Ayse');
    expect(JSON.stringify(n)).not.toContain('+90');
    expect(n.title).toBe('New notification');
    expect(n.body).toBe('Open the inbox to view details.');
  });

  it('hides message content without the message grant and keeps other types', async () => {
    const { service } = build(
      ['leads:read:all', 'leads:read:pii'],
      [
        row({ id: 'a' }),
        row({
          id: 'b',
          type: 'LEAD_HANDED_OFF',
          title: 'Handoff: Ayse',
          body: 'Needs staff',
        }),
      ],
    );
    const list = await service.getUserNotifications(ORG, USER);
    const a = list.find((n) => n.id === 'a')!;
    const b = list.find((n) => n.id === 'b')!;
    expect(a.body).toBe('Open the inbox to view details.');
    expect(a.title).toBe('Message from Ayse Yilmaz');
    expect(b.body).toBe('Needs staff');
  });

  it('does not mutate the stored rows', async () => {
    const stored = row({});
    const { service } = build(['leads:read:all'], [stored]);
    await service.getUserNotifications(ORG, USER);
    expect(stored.title).toBe('Message from Ayse Yilmaz');
  });
});

describe('notification translation metadata', () => {
  it('returns code and params to authorized recipients', async () => {
    const { service } = build(
      ['leads:read:all', 'leads:read:pii', 'leads:read:messages'],
      [row({ code: 'NEW_MESSAGE', params: { name: 'Synthetic' } })],
    );
    expect((await service.getUserNotifications(ORG, USER))[0]).toMatchObject({
      code: 'NEW_MESSAGE',
      params: { name: 'Synthetic' },
    });
  });
  it('redacts params after permission revocation', async () => {
    const { service } = build(
      ['leads:read:all'],
      [row({ code: 'NEW_MESSAGE', params: { name: 'Secret' } })],
    );
    const [notification] = await service.getUserNotifications(ORG, USER);
    expect(notification).toMatchObject({
      code: 'GENERIC_NOTIFICATION',
      params: {},
    });
    expect(JSON.stringify(notification)).not.toContain('Secret');
  });
});
