import { isOptIn, isOptOut, patientCommand } from './patient-commands';

describe('patient commands (D-021, KI-064)', () => {
  it.each([
    'STOP',
    'stop.',
    'Stop!',
    'STOPP',
    '  stop  ',
    'Unsubscribe',
    'opt out',
    'opt-out',
    'OPTOUT',
    'durdur',
    'DURDUR',
    'mesaj gönderme',
    'MESAJ GÖNDERME',
    'abonelikten çık',
    'ABONELİKTEN ÇIK',
    'abonelikten cik',
    'artık mesaj',
    'nicht mehr',
    'parar',
    'detener',
  ])('treats %p as an opt-out', (text) => {
    expect(isOptOut(text)).toBe(true);
    expect(patientCommand(text)).toBe('STOP');
  });

  it.each([
    "stop that, let's negotiate",
    'stop that lets negotiate',
    'stop by tomorrow',
    "please don't stop",
    'please stop messaging me',
    'cancel',
    'Cancel',
    'iptal',
    'İPTAL',
    'cancelar',
    'end',
    'quit',
    'basta',
    'dur',
    'stop?',
  ])('does not treat %p as an opt-out', (text) => {
    expect(isOptOut(text)).toBe(false);
    expect(patientCommand(text)).not.toBe('STOP');
  });

  it.each(['START', 'start.', 'BAŞLA', 'Basla!', 'başla', ' Start '])(
    'treats %p as an opt-in',
    (text) => {
      expect(isOptIn(text)).toBe(true);
      expect(patientCommand(text)).toBe('START');
    },
  );

  it.each(['start by telling me prices', 'restart', 'başlayalım'])(
    'does not treat %p as an opt-in',
    (text) => expect(isOptIn(text)).toBe(false),
  );

  it('keeps the consent commands', () => {
    expect(patientCommand('I CONSENT')).toBe('I_CONSENT');
    expect(patientCommand('withdraw consent')).toBe('WITHDRAW_CONSENT');
    expect(patientCommand('Hello')).toBeNull();
  });
});
