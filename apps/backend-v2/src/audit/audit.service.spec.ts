import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writes the supplied tenant identity rather than relying on ambient context', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new AuditService({ auditLog: { create } } as any);

    await service.record({
      organizationId: 'org-a',
      action: 'consent.opt_out',
      targetId: 'lead-a',
      actor: 'webhook:whatsapp',
      metadata: { sourceMessageId: 'wamid.a' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-a',
        action: 'consent.opt_out',
        targetId: 'lead-a',
        actor: 'webhook:whatsapp',
      }),
    });
  });
});
