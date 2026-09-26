import { randomBytes } from 'node:crypto';
import {
  credentialKey,
  decryptCredential,
  encryptCredential,
} from './credential-cipher';

describe('credential encryption shared by runtime and upgrade', () => {
  it('round-trips the existing AES-GCM storage format with fresh IVs', () => {
    const key = credentialKey(randomBytes(32).toString('base64'));
    const payload = { accessToken: randomBytes(24).toString('hex') };
    const encrypted = encryptCredential(payload, key);
    expect(encrypted.split('.')).toHaveLength(3);
    expect(
      decryptCredential(encrypted, key).accessToken === payload.accessToken,
    ).toBe(true);
    expect(encryptCredential(payload, key) === encrypted).toBe(false);
  });

  it.each([undefined, '', 'invalid', Buffer.alloc(16).toString('base64')])(
    'fails closed on invalid key configuration',
    (encoded) => {
      expect(() => credentialKey(encoded)).toThrow('CREDENTIAL_KEY_INVALID');
    },
  );

  it('rejects tampering and wrong keys with a fixed error', () => {
    const key = randomBytes(32);
    const encrypted = encryptCredential({ accessToken: 'synthetic' }, key);
    expect(() => decryptCredential(encrypted, randomBytes(32))).toThrow(
      'CREDENTIAL_DECRYPT_FAILED',
    );
    const [iv, tag] = encrypted.split('.');
    expect(() => decryptCredential(`${iv}.${tag}.AAAA`, key)).toThrow(
      'CREDENTIAL_DECRYPT_FAILED',
    );
    expect(() => decryptCredential('PLAINTEXT_MIGRATE:synthetic', key)).toThrow(
      'CREDENTIAL_DECRYPT_FAILED',
    );
  });
});
