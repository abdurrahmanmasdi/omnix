import { weeklyPeriod, median, p90 } from './weekly-period';
import { classify, topicCounts } from './weekly-topics';
import {
  aggregateMessages,
  ReportInbound,
  ReportAttempt,
} from './weekly-aggregate';
const now = new Date('2026-10-10T12:00:00Z');
const at = (time: string) => new Date(`2026-10-05T${time}:00Z`);
const inbound = (
  id: string,
  conversationId: string,
  time: string,
  content = 'implant price',
): ReportInbound => ({
  id,
  conversationId,
  createdAt: at(time),
  type: 'LEAD_TEXT',
  handledBy: 'AI',
  metadata: null,
  content,
});
const attempt = (
  id: string,
  conversationId: string,
  time: string,
  staff = false,
): ReportAttempt => ({
  conversationId,
  acceptedAt: at(time),
  purpose: staff ? 'staff' : 'reply',
  status: 'ACCEPTED',
  message: {
    id,
    conversationId,
    createdAt: at(time),
    type: staff ? 'USER_TEXT' : 'AI_TEXT',
    handledBy: staff ? 'HUMAN' : 'AI',
    metadata: null,
  },
});
describe('weekly helpers', () => {
  it('uses Istanbul Monday boundaries and defaults to last completed week', () => {
    expect(weeklyPeriod({}, now).period.weekStart).toBe('2026-09-28');
    expect(weeklyPeriod({ weekStart: '2026-10-05' }, now).period).toMatchObject(
      {
        startUtc: '2026-10-04T21:00:00.000Z',
        endUtc: '2026-10-11T21:00:00.000Z',
        inProgress: true,
        cutoffUtc: now.toISOString(),
      },
    );
    expect(
      weeklyPeriod({}, new Date('2026-10-04T21:00:00Z')).period.weekStart,
    ).toBe('2026-09-28');
    expect(
      weeklyPeriod({ weekStart: '2025-10-06' }, now).period.inProgress,
    ).toBe(false);
  });
  it.each([
    '2026-02-30',
    '2026-10-06',
    '2026-10-12',
    '2025-09-29',
    '',
    null,
    ['2026-10-05'],
    '2026-10-05T00:00:00Z',
  ])('rejects invalid dates %p', (value) =>
    expect(() => weeklyPeriod({ weekStart: value }, now)).toThrow(),
  );
  it('rejects unknown fields', () =>
    expect(() => weeklyPeriod({ organizationId: 'foreign' }, now)).toThrow());
  it('keeps null separate from zero and uses nearest rank p90', () => {
    expect(median([])).toBeNull();
    expect(p90([])).toBeNull();
    expect(median([0])).toBe(0);
    expect(median([300, 120])).toBe(210);
    expect(p90([300, 120])).toBe(300);
  });
  it('matches normalized EN/TR/AR phrases without substrings', () => {
    expect(
      classify('PRICE implant appointment payment airport veneer'),
    ).toHaveLength(6);
    expect(classify('İMPLANT FİYAT ÜCRET ödeme havalimanı')).toEqual([
      'price',
      'implants',
      'travel_location',
      'payment',
    ]);
    expect(classify('سِعر زراعة الأسنان موعد تقسيط')).toEqual([
      'price',
      'implants',
      'consultation',
      'payment',
    ]);
    expect(classify('preimplantation overpriced')).toEqual([]);
  });
  it('counts conversations per topic, other only without matches, media unclassified and stable ties', () => {
    const result = topicCounts([
      inbound('a', 'A', '09:00'),
      inbound('b', 'A', '09:02', 'hello'),
      inbound('c', 'B', '09:10', 'hello'),
      { ...inbound('d', 'C', '09:20'), type: 'LEAD_MEDIA' },
    ]);
    expect(result.topics).toEqual([
      { id: 'price', conversations: 1 },
      { id: 'implants', conversations: 1 },
      { id: 'other', conversations: 1 },
    ]);
    expect(result.topicUnclassifiedConversations).toBe(1);
  });
  it('reconciles the card fixture, additional bubbles and separate phone coverage', () => {
    const inputs = [
      inbound('a', 'A', '09:00'),
      inbound('a2', 'A', '09:02'),
      inbound('b', 'B', '09:10'),
      inbound('c', 'C', '09:20'),
    ];
    inputs.push(
      {
        ...inbound('history', 'H', '09:00'),
        metadata: { origin: 'WHATSAPP_HISTORY' },
      },
      { ...inbound('readonly', 'R', '09:00'), metadata: { readOnly: true } },
    );
    const first = attempt('ai', 'A', '09:05');
    const attempts = [
      first,
      first,
      attempt('bubble', 'A', '09:06'),
      attempt('staff', 'B', '09:12', true),
      ...['UNKNOWN', 'FAILED', 'CANCELLED'].map((status) => ({
        ...attempt(status, 'C', '09:21'),
        status,
      })),
      {
        ...attempt('draft', 'C', '09:21'),
        message: {
          ...attempt('draft', 'C', '09:21').message,
          type: 'AI_DRAFT',
        },
      },
      ...['follow-up', 'consent-request'].map((purpose) => ({
        ...attempt(purpose, 'C', '09:21'),
        purpose,
      })),
      attempt('late', 'C', '10:00'),
    ];
    const phone = {
      ...inbound('phone', 'C', '09:22'),
      type: 'USER_TEXT',
      handledBy: 'HUMAN',
      metadata: { origin: 'WHATSAPP_PHONE' },
    };
    const result = aggregateMessages(
      inputs,
      attempts,
      [phone],
      at('09:00'),
      at('10:00'),
    );
    expect(result.replyInterval).toEqual({
      opportunities: 3,
      replied: 2,
      pending: 1,
      medianSeconds: 210,
      p90Seconds: 300,
      ai: { replied: 1, medianSeconds: 300 },
      staff: { replied: 1, medianSeconds: 120 },
    });
    expect(result.activity).toMatchObject({
      aiReplies: 2,
      staffDashboardReplies: 1,
      staffPhoneMessages: 1,
      denominator: 4,
    });
    expect(result.patientMessages).toBe(4);
  });
  it('excludes older queued bubbles from samples and allows equal timestamps with ID tie ordering', () => {
    const old = attempt('old', 'A', '09:01');
    old.message.createdAt = at('08:00');
    const result = aggregateMessages(
      [inbound('in', 'A', '09:00')],
      [old, attempt('z', 'A', '09:00'), attempt('a', 'A', '09:00', true)],
      [],
      at('09:00'),
      at('10:00'),
    );
    expect(result.replyInterval.staff).toEqual({
      replied: 1,
      medianSeconds: 0,
    });
    expect(
      aggregateMessages(
        [inbound('in', 'A', '09:00')],
        [old],
        [],
        at('09:00'),
        at('10:00'),
      ).replyInterval.replied,
    ).toBe(0);
    expect(
      aggregateMessages([], [], [], at('09:00'), at('10:00')).activity
        .aiPercent,
    ).toBeNull();
  });
});
