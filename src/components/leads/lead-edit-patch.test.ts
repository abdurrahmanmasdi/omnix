import { describe, expect, it } from 'vitest';
import { dirtyLeadPatch } from './lead-edit-patch';

describe('Existing lead edit safety', () => {
  it('sends changed fields only', () => {
    expect(dirtyLeadPatch({ firstName: 'İpek', lastName: 'Şahin', phoneNumber: '*******1234' }, { firstName: true }, { phoneNumber: '*******1234' })).toEqual({ firstName: 'İpek' });
  });
  it('never patches masked originals or newly entered masks', () => {
    expect(dirtyLeadPatch({ phoneNumber: '+905550001234', email: 'new@example.invalid', country: 'Türkiye' }, { phoneNumber: true, email: true, country: true }, { phoneNumber: '*******1234', email: 'ol***@example.invalid' })).toEqual({ country: 'Türkiye' });
    expect(dirtyLeadPatch({ phoneNumber: '*******1234' }, { phoneNumber: true })).toEqual({});
  });
  it('can patch a real unmasked contact change', () => {
    expect(dirtyLeadPatch({ phoneNumber: '+905550001234', email: 'new@example.invalid' }, { email: true }, { email: 'old@example.invalid' })).toEqual({ email: 'new@example.invalid' });
  });
});
