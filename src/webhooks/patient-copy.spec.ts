import {
  actionFallbackText,
  defaultDisclosure,
  detectLanguage,
  mediaConsentRequestText,
  patientLanguage,
} from './patient-copy';

describe('patient copy', () => {
  it('detects Turkish by letters or two Turkish words, else English', () => {
    expect(detectLanguage('İmplant fiyatı ne kadar?')).toBe('tr');
    expect(detectLanguage('merhaba fiyat')).toBe('tr');
    expect(detectLanguage('Hello, how much are implants?')).toBe('en');
    expect(detectLanguage('mi')).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });

  it('prefers the lead preferred language, then patient texts, then primary', () => {
    expect(patientLanguage({ preferredLanguage: 'tr-TR' }, ['Hello'])).toBe(
      'tr',
    );
    expect(
      patientLanguage({ primaryLanguage: 'en' }, ['Merhaba, nasıl?']),
    ).toBe('tr');
    expect(patientLanguage({ primaryLanguage: 'tr' }, [])).toBe('tr');
    expect(patientLanguage(null, [])).toBe('en');
  });

  it('names the clinic in the consent request and keeps the commands', () => {
    for (const language of ['en', 'tr'] as const) {
      const text = mediaConsentRequestText('Synthetic Dental', language);
      expect(text).toContain('Synthetic Dental');
      expect(text).toContain('I CONSENT');
      expect(text).toContain('WITHDRAW CONSENT');
      expect(text).not.toContain('OmniDesk');
    }
  });

  it('discloses the AI in EN/TR without timing promises (KI-060)', () => {
    const names = {
      firstName: 'Ayşe',
      agentName: 'Asistan',
      clinicName: 'Synthetic Dental',
    };
    const en = defaultDisclosure('en', names);
    const tr = defaultDisclosure('tr', names);
    expect(en).toContain("I'm an AI");
    expect(tr).toContain('yapay zekâ asistanıyım');
    expect(defaultDisclosure('tr', { ...names, firstName: null })).toMatch(
      /^Merhaba! /,
    );
    for (const text of [
      en,
      tr,
      actionFallbackText('en'),
      actionFallbackText('tr'),
    ]) {
      expect(text).not.toMatch(/right away|right now|shortly|hemen|birazdan/i);
      expect(text).not.toContain('OmniDesk');
    }
    expect(actionFallbackText('tr')).toContain('ekibine');
  });
});
