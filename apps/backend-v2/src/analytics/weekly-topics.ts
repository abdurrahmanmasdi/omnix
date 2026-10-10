export const TOPICS = [
  'price',
  'implants',
  'crowns_veneers',
  'consultation',
  'travel_location',
  'payment',
  'other',
] as const;
export type Topic = (typeof TOPICS)[number];
const dictionary: Record<Exclude<Topic, 'other'>, string[]> = {
  price: [
    'price',
    'prices',
    'cost',
    'costs',
    'fiyat',
    'fiyatı',
    'fiyatlar',
    'ücret',
    'ücreti',
    'سعر',
    'السعر',
    'أسعار',
    'تكلفة',
    'التكلفة',
  ],
  implants: [
    'implant',
    'implants',
    'implantasyon',
    'زرع الأسنان',
    'زراعة الأسنان',
  ],
  crowns_veneers: [
    'crown',
    'crowns',
    'veneer',
    'veneers',
    'kaplama',
    'تلبيسة',
    'فينير',
  ],
  consultation: [
    'consultation',
    'appointment',
    'appointments',
    'randevu',
    'استشارة',
    'موعد',
  ],
  travel_location: [
    'address',
    'location',
    'airport',
    'adres',
    'havalimanı',
    'عنوان',
    'مطار',
  ],
  payment: [
    'payment',
    'installment',
    'installments',
    'ödeme',
    'taksit',
    'دفع',
    'تقسيط',
  ],
};
// Keep Arabic letters; remove only optional vowel marks and elongation for matching.
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u0307/g, '')
    .replace(/ı/g, 'i')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
export function classify(text: string): Topic[] {
  const normalized = normalize(text);
  return TOPICS.filter(
    (topic): topic is Exclude<Topic, 'other'> => topic !== 'other',
  ).filter((topic) =>
    dictionary[topic].some((phrase) =>
      new RegExp(
        '(?<![\\p{L}\\p{N}])' + normalize(phrase) + '(?![\\p{L}\\p{N}])',
        'u',
      ).test(normalized),
    ),
  );
}
export function topicCounts(
  rows: { conversationId: string; type: string; content: string }[],
) {
  const conversations = new Set(rows.map((row) => row.conversationId));
  const classified = new Map<string, Set<Topic>>();
  for (const row of rows) {
    if (row.type !== 'LEAD_TEXT' || !row.content.trim()) continue;
    const topics = classified.get(row.conversationId) ?? new Set<Topic>();
    classify(row.content).forEach((topic) => topics.add(topic));
    classified.set(row.conversationId, topics);
  }
  const counts = new Map<Topic, number>();
  for (const topics of classified.values()) {
    if (!topics.size) topics.add('other');
    topics.forEach((topic) => counts.set(topic, (counts.get(topic) ?? 0) + 1));
  }
  return {
    topics: TOPICS.map((id) => ({ id, conversations: counts.get(id) ?? 0 }))
      .filter((row) => row.conversations)
      .sort(
        (a, b) =>
          b.conversations - a.conversations ||
          TOPICS.indexOf(a.id) - TOPICS.indexOf(b.id),
      )
      .slice(0, 5),
    topicClassifiedConversations: classified.size,
    topicUnclassifiedConversations: conversations.size - classified.size,
  };
}
