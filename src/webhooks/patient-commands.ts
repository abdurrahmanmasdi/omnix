/**
 * Whole-message patient commands on WhatsApp. Keep this intentionally
 * conservative: ordinary uses of words such as “stop by tomorrow” must not
 * suppress consent.
 */
export type PatientCommand =
  | 'STOP'
  | 'START'
  | 'I_CONSENT'
  | 'WITHDRAW_CONSENT';

export function isOptOut(text: string): boolean {
  const normalized = text.trim().toLocaleLowerCase();
  return /^(stop|unsubscribe|cancel|end|quit|opt[ -]?out|no messages|no more messages|nicht mehr|abmelden|stopp|iptal|mesaj gönderme|mesaj gonderme|artık mesaj|artik mesaj|parar|basta|detener|cancelar)$/iu.test(
    normalized,
  );
}

// Only an explicit re-opt-in clears a STOP; an ordinary new message does not.
export function isOptIn(text: string): boolean {
  return /^(start|başla|basla)$/u.test(text.trim().toLowerCase());
}

export function patientCommand(text: string): PatientCommand | null {
  if (isOptOut(text)) return 'STOP';
  if (isOptIn(text)) return 'START';
  const upper = text.trim().toUpperCase();
  if (upper === 'I CONSENT') return 'I_CONSENT';
  if (upper === 'WITHDRAW CONSENT') return 'WITHDRAW_CONSENT';
  return null;
}
