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

/** Default AI disclosure when the clinic has no custom template (rule 4). */
export function defaultDisclosure(
  language: PatientLanguage,
  names: { firstName?: string | null; agentName: string; clinicName: string },
): string {
  const firstName = names.firstName?.trim();
  return language === 'tr'
    ? `Merhaba${firstName ? ` ${firstName}` : ''}! Ben ${names.agentName}, ${names.clinicName} kliniğinin yapay zekâ asistanıyım. Doktor ya da gerçek bir kişi değilim. Tedavilerimiz, fiyatlar ve konsültasyon talebi hakkında bilgi verebilirim. Bir kişiyle görüşmek isterseniz yazmanız yeterli; talebinizi kliniğin ekibine iletirim.`
    : `Hi${firstName ? ` ${firstName}` : ''}! I'm ${names.agentName}, the AI assistant for ${names.clinicName}. I'm an AI, not a doctor or a person. I can help with information about our treatments, prices and how to request a consultation. If you'd like to talk to a person, just say so and I'll pass your request to the clinic's team.`;
}

/**
 * Sent when an AI action could not be completed and the conversation is
 * handed to staff. Same wording as the Python service's technical handoff.
 */
export function actionFallbackText(language: PatientLanguage): string {
  return language === 'tr'
    ? 'Üzgünüm, mesajınızı işleyemedim. Mesajınızı kliniğin ekibine iletiyorum; bir ekip üyemiz size buradan yanıt verecek.'
    : "Sorry, I couldn't process your message. I'm passing it to the clinic's team, and a team member will reply to you here.";
}
