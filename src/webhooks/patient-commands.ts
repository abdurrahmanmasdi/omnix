/**
 * Whole-message patient commands on WhatsApp (D-021, KI-064).
 *
 * Only an exact command counts: the whole message, after trimming, case
 * folding and dropping trailing "." / "!". There is deliberately no
 * sentence-level or model-based matching: "stop that, let's negotiate",
 * "stop by tomorrow" or "iptal" (cancel my appointment) must not opt anyone
 * out. A sentence such as "please stop messaging me" is therefore not
 * detected automatically; the AI and staff see it in the conversation.
 *
 * Turkish additions (durdur, abonelikten çık) are proposed pending native
 * review (Q13). Bare "dur" is excluded on purpose (too common).
 */
export type PatientCommand =
  | 'STOP'
  | 'START'
  | 'I_CONSENT'
  | 'WITHDRAW_CONSENT';

export const OPT_OUT_COMMANDS = [
  'stop',
  'stopp',
  'unsubscribe',
  'opt out',
  'opt-out',
  'optout',
  'no messages',
  'no more messages',
  'nicht mehr',
  'abmelden',
  'mesaj gönderme',
  'mesaj gonderme',
  'artık mesaj',
  'artik mesaj',
  'parar',
  'detener',
  'durdur',
  'abonelikten çık',
  'abonelikten cik',
] as const;

export const OPT_IN_COMMANDS = ['start', 'başla', 'basla'] as const;

/**
 * Trim, collapse spaces, Turkish-safe case fold (İ/I/ı all become i, so
 * "İPTAL", "ABONELİKTEN ÇIK" and "iptal" compare equal) and drop trailing
 * "." / "!".
 */
export function normalizeCommand(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[İI]/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!\s]+$/u, '');
}

const OPT_OUT = new Set(OPT_OUT_COMMANDS.map(normalizeCommand));
const OPT_IN = new Set(OPT_IN_COMMANDS.map(normalizeCommand));

export function isOptOut(text: string): boolean {
  return OPT_OUT.has(normalizeCommand(text));
}

// Only an explicit re-opt-in clears a STOP; an ordinary new message does not.
export function isOptIn(text: string): boolean {
  return OPT_IN.has(normalizeCommand(text));
}

export function patientCommand(text: string): PatientCommand | null {
  if (isOptOut(text)) return 'STOP';
  if (isOptIn(text)) return 'START';
  const upper = text.trim().toUpperCase();
  if (upper === 'I CONSENT') return 'I_CONSENT';
  if (upper === 'WITHDRAW CONSENT') return 'WITHDRAW_CONSENT';
  return null;
}
