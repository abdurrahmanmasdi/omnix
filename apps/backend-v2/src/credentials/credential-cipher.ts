import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type SecretPayload = Record<string, string>;

export function credentialKey(encoded: string | undefined): Buffer {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new Error('CREDENTIAL_KEY_INVALID');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('CREDENTIAL_KEY_INVALID');
  }
  return key;
}

export function encryptCredential(payload: SecretPayload, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptCredential(value: string, key: Buffer): SecretPayload {
  try {
    const parts = value.split('.');
    if (parts.length !== 3) throw new Error();
    const [iv, tag, ciphertext] = parts.map((part) =>
      Buffer.from(part, 'base64'),
    );
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const payload: unknown = JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8',
      ),
    );
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.values(payload).some((entry) => typeof entry !== 'string')
    ) {
      throw new Error();
    }
    return payload as SecretPayload;
  } catch {
    // Never propagate crypto/parser errors containing decrypted secret values.
    throw new Error('CREDENTIAL_DECRYPT_FAILED');
  }
}
