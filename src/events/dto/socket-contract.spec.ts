import fixture from './socket-events.v1.fixtures.json';
import { toPublicMessageDto, toPublicLeadDto, toPublicConversationDto } from './public-events.dto';

const timestamp = new Date('2026-09-28T00:00:00.000Z');

describe('public socket contract v1', () => {
  it('maps representative records to the shared golden payloads and strips relations', () => {
    const rawMessage = {
      ...fixture.message, createdAt: timestamp, updatedAt: timestamp,
      metadata: { privateToken: 'secret' },
    };
    const rawLead = {
      ...fixture.lead, createdAt: timestamp, updatedAt: timestamp,
      organization: { privateToken: 'secret' },
    };
    const rawConversation = {
      ...fixture.conversation, createdAt: timestamp, updatedAt: timestamp,
      lead: { privateToken: 'secret' },
    };
    expect(toPublicMessageDto(rawMessage)).toEqual(fixture.message);
    expect(toPublicLeadDto(rawLead)).toEqual(fixture.lead);
    expect(toPublicConversationDto(rawConversation)).toEqual(fixture.conversation);
  });
});
