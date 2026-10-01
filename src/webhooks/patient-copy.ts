/**
 * Patient-facing texts sent by the Nest backend, in English and Turkish.
 * Draft copy pending founder/clinic review (F02). No timing promises.
 */
export type PatientLanguage = 'en' | 'tr';

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/u;
const TURKISH_WORDS =
  /(?<!\p{L})(?:merhaba|selam|fiyat\p{L}*|istiyorum|lütfen|teşekkür\p{L}*|tesekkur\p{L}*|randevu\p{L}*|nasıl|nedir|kadar|evet|hayır|musunuz|misiniz|mısınız|mi|mı|ne)(?!\p{L})/giu;

/** Same heuristic as the Python service (WP-A): Turkish letters or ≥2 TR words. */
export function detectLanguage(
  text: string | null | undefined,
): PatientLanguage {
  const value = text ?? '';
  if (TURKISH_CHARS.test(value)) return 'tr';
  return (value.match(TURKISH_WORDS)?.length ?? 0) >= 2 ? 'tr' : 'en';
}

/**
 * The lead's preferred language if set; otherwise the patient's own recent
 * texts; otherwise the lead's primary language (often a default); else en.
 */
export function patientLanguage(
  lead: {
    preferredLanguage?: string | null;
    primaryLanguage?: string | null;
  } | null,
  recentPatientTexts: string[],
): PatientLanguage {
  const code = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized?.startsWith('tr')) return 'tr' as const;
    if (normalized?.startsWith('en')) return 'en' as const;
    return null;
  };
  return (
    code(lead?.preferredLanguage) ??
    (detectLanguage(recentPatientTexts.join(' ')) === 'tr'
      ? 'tr'
      : (code(lead?.primaryLanguage) ?? 'en'))
  );
}

export function mediaConsentRequestText(
  clinicName: string,
  language: PatientLanguage,
): string {
  return language === 'tr'
    ? `${clinicName}, buradan gönderdiğiniz fotoğrafları ve sesli mesajları ekibinin inceleyebilmesi için saklamak üzere onayınızı istiyor. Onay vermek için I CONSENT yazın. Onayınızı istediğiniz zaman WITHDRAW CONSENT yazarak geri alabilirsiniz.`
    : `${clinicName} needs your consent to store the photos and voice messages you send here so the clinic's team can review them. Reply I CONSENT to allow this. You can withdraw consent at any time by replying WITHDRAW CONSENT.`;
}
