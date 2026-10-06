import { describe, expect, it } from 'vitest';
import fixture from './socket-events.v1.fixtures.json';
import type { LiveMessagePayload, LeadUpdatePayload, ConversationUpdatePayload, NotificationInvalidationPayload } from './socket-events.generated';

describe('shared socket examples', () => {
  it('match frontend consumer types and contain no private relation fields', () => {
    const message: LiveMessagePayload = fixture.message;
    const lead: LeadUpdatePayload = fixture.lead;
    const conversation: ConversationUpdatePayload = fixture.conversation;
    const notification = fixture.notification as NotificationInvalidationPayload;
    for (const payload of [message, lead, conversation, notification]) {
      expect(payload).not.toHaveProperty('organization');
      expect(payload).not.toHaveProperty('metadata');
      expect(payload).not.toHaveProperty('passwordHash');
    }
    expect(message.status).toBe('PROCESSED');
    expect(notification.type).toBe('UPDATE');
  });
});
