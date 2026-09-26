import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { decryptCredential, encryptCredential } from './credential-cipher';

const PREFIX = 'PLAINTEXT_MIGRATE:';
type CredentialRow = {
  id: string;
  organizationId: string;
  provider: string;
  encryptedPayload: string;
  status: string;
  keyVersion: number;
};

export async function hasColumn(
  db: Client,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await db.query<{ present: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2) AS present`,
    [table, column],
  );
  return result.rows[0].present;
}

/** Explicit maintenance operation. Run with writers stopped and the deployment key. */
export async function repairCredentials(
  db: Client,
  key: Buffer,
): Promise<number> {
  let repaired = 0;
  await db.query('BEGIN');
  try {
    await db.query(
      `SELECT pg_advisory_xact_lock(hashtext('omnidesk-credential-repair-v1'))`,
    );
    // Lock writers until verification, audit and source scrubbing commit together.
    await db.query(
      'LOCK TABLE credentials, channels, organizations IN SHARE ROW EXCLUSIVE MODE',
    );
    const audit = async (
      organizationId: string,
      targetId: string,
      source: string,
    ) => {
      await db.query(
        `INSERT INTO audit_logs (id, "organizationId", actor, action, "targetId", metadata)
         VALUES ($1, $2, 'operator', 'credential.upgrade_verified', $3, $4::jsonb)`,
        [
          randomUUID(),
          organizationId,
          targetId,
          JSON.stringify({ version: 1, source, decryptionVerified: true }),
        ],
      );
      repaired++;
    };
    const verify = (row: CredentialRow) => {
      if (row.keyVersion !== 1)
        throw new Error('CREDENTIAL_KEY_VERSION_UNSUPPORTED');
      return decryptCredential(row.encryptedPayload, key);
    };
    const credentials = await db.query<CredentialRow>(
      'SELECT * FROM credentials FOR UPDATE',
    );
    for (const credential of credentials.rows) {
      if (credential.encryptedPayload.startsWith(PREFIX)) {
        const accessToken = credential.encryptedPayload.slice(PREFIX.length);
        if (!accessToken) throw new Error('CREDENTIAL_LEGACY_TOKEN_EMPTY');
        const encrypted = encryptCredential({ accessToken }, key);
        const saved = await db.query<CredentialRow>(
          'UPDATE credentials SET "encryptedPayload" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
          [credential.id, encrypted],
        );
        if (verify(saved.rows[0]).accessToken !== accessToken)
          throw new Error('CREDENTIAL_VERIFY_FAILED');
        await audit(credential.organizationId, credential.id, 'prefix');
      } else {
        // Fail before clearing any source if the configured key cannot read existing data.
        verify(credential);
      }
    }

    const create = async (
      organizationId: string,
      provider: string,
      accessToken: string,
    ) => {
      const id = randomUUID();
      const saved = await db.query<CredentialRow>(
        `INSERT INTO credentials (id, "organizationId", provider, "encryptedPayload", "updatedAt")
         VALUES ($1, $2, $3::"CredentialProvider", $4, CURRENT_TIMESTAMP) RETURNING *`,
        [id, organizationId, provider, encryptCredential({ accessToken }, key)],
      );
      if (verify(saved.rows[0]).accessToken !== accessToken)
        throw new Error('CREDENTIAL_VERIFY_FAILED');
      return id;
    };

    if (await hasColumn(db, 'organizations', 'crmAccessToken')) {
      const organizations = await db.query<{
        id: string;
        crmAccessToken: string;
      }>(
        `SELECT id, "crmAccessToken" FROM organizations WHERE COALESCE("crmAccessToken", '') <> '' FOR UPDATE`,
      );
      for (const org of organizations.rows) {
        const existing = await db.query<CredentialRow>(
          `SELECT * FROM credentials WHERE "organizationId" = $1 AND provider = 'HUBSPOT' AND status = 'ACTIVE'`,
          [org.id],
        );
        if (
          existing.rows.length > 1 ||
          existing.rows.some(
            (row) => verify(row).accessToken !== org.crmAccessToken,
          )
        ) {
          throw new Error('CREDENTIAL_CRM_CONFLICT_REQUIRES_OPERATOR');
        }
        const id =
          existing.rows[0]?.id ??
          (await create(org.id, 'HUBSPOT', org.crmAccessToken));
        await audit(org.id, id, 'organization.crmAccessToken');
        await db.query(
          'UPDATE organizations SET "crmAccessToken" = NULL WHERE id = $1',
          [org.id],
        );
      }
    }

    const channels = await db.query<{
      id: string;
      organizationId: string;
      provider: string;
      credentialId: string | null;
      accessToken: string | null;
    }>(
      'SELECT id, "organizationId", provider, "credentialId", "accessToken" FROM channels FOR UPDATE',
    );
    for (const channel of channels.rows) {
      if (channel.credentialId) {
        const linked = await db.query<CredentialRow>(
          'SELECT * FROM credentials WHERE id = $1 AND "organizationId" = $2 AND provider::text = $3',
          [channel.credentialId, channel.organizationId, channel.provider],
        );
        if (linked.rows.length !== 1)
          throw new Error('CREDENTIAL_CHANNEL_LINK_INVALID');
        const payload = verify(linked.rows[0]);
        if (
          channel.accessToken &&
          payload.accessToken !== channel.accessToken
        ) {
          throw new Error('CREDENTIAL_CHANNEL_CONFLICT_REQUIRES_OPERATOR');
        }
      } else if (channel.accessToken) {
        channel.credentialId = await create(
          channel.organizationId,
          channel.provider,
          channel.accessToken,
        );
        await db.query(
          'UPDATE channels SET "credentialId" = $2 WHERE id = $1',
          [channel.id, channel.credentialId],
        );
      }
      if (channel.accessToken) {
        const linked = await db.query<CredentialRow>(
          `SELECT c.* FROM channels ch JOIN credentials c ON c.id = ch."credentialId"
           AND c."organizationId" = ch."organizationId" WHERE ch.id = $1`,
          [channel.id],
        );
        if (
          linked.rows.length !== 1 ||
          verify(linked.rows[0]).accessToken !== channel.accessToken
        ) {
          throw new Error('CREDENTIAL_CHANNEL_VERIFY_FAILED');
        }
        await audit(
          channel.organizationId,
          channel.credentialId!,
          'channel.accessToken',
        );
        // Older schema requires NOT NULL; the forward migration normalizes this to NULL.
        await db.query('UPDATE channels SET "accessToken" = $2 WHERE id = $1', [
          channel.id,
          '',
        ]);
      }
    }
    await db.query('COMMIT');
    return repaired;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
