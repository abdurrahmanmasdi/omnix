import {
  toPublicLeadDto,
  toPublicConversationDto,
  toPublicNotificationDto,
} from '../dto/public-events.dto';

describe('Gateway Mapper (Adversarial Tests)', () => {
  it('strips password_hash and billing details from lead data', () => {
    const rawLead = {
      id: 'lead-123',
      firstName: 'John',
      lastName: 'Doe',
      status: 'NEW',
      password_hash: 'super-secret', // Maliciously injected
      organization: {
        id: 'org-1',
        billingDetails: 'card_1234',
      },
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
    };

    const safeDto = toPublicLeadDto(rawLead);
    expect(safeDto.id).toBe('lead-123');
    expect(safeDto.firstName).toBe('John');
    expect((safeDto as any).password_hash).toBeUndefined();
    expect((safeDto as any).organization).toBeUndefined();
  });

  it('strips injected admin flags from notification data', () => {
    const rawNotification = {
      id: 'notif-1',
      title: 'Test',
      body: 'Test',
      type: 'INFO',
      isRead: false,
      createdAt: new Date('2023-01-01T00:00:00Z'),
      isAdmin: true, // Malicious flag
      user: {
        role: 'SUPER_ADMIN',
      },
    };

    const safeDto = toPublicNotificationDto(rawNotification);
    expect(safeDto.id).toBe('notif-1');
    expect((safeDto as any).isAdmin).toBeUndefined();
    expect((safeDto as any).user).toBeUndefined();
  });

  it('strips nested sensitive relations from conversation data', () => {
    const rawConv = {
      id: 'conv-1',
      createdAt: new Date('2023-01-01T00:00:00Z'),
      updatedAt: new Date('2023-01-01T00:00:00Z'),
      leadId: 'lead-1',
      lead: {
        // Relation should be stripped
        id: 'lead-1',
        firstName: 'Jane',
        createdAt: new Date('2023-01-01T00:00:00Z'),
        updatedAt: new Date('2023-01-01T00:00:00Z'),
        assignedAgent: {
          password_hash: 'secret',
        },
      },
    };

    const safeDto = toPublicConversationDto(rawConv);
    expect(safeDto.id).toBe('conv-1');
    expect(safeDto.leadId).toBe('lead-1');
    expect((safeDto as any).lead).toBeUndefined();
  });
});
