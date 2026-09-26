# Credential upgrade and recovery (S02)

Migration history is preserved: on 26 September 2026 the owner reported that deployment history outside this workspace is unknown. No existing migration is rewritten. The new migration is `20260926160000_credential_repair_guard`.

## Deploy

1. Stop ingress and all application/queue writers during this maintenance operation. Preserve a restricted backup and the **existing** production encryption key in the approved secret store. Do not rotate or generate a replacement key as part of this upgrade.
2. Use the repository's Node 22 runtime, install locked dependencies with `npm ci`, then run `npx prisma generate` and `npm run build`.
3. Supply `DATABASE_URL` and `INTEGRATION_CREDENTIAL_KEY` through the deployment secret environment. The key must be the existing canonical base64 encoding of 32 bytes. Run `npm run db:deploy` from `backend-v2`. The built equivalent is `node dist/src/credentials/deploy-cli.js`; production startup and Compose migrations use that entry point.
4. A successful run prints only `CREDENTIAL_UPGRADE_COMPLETE repaired=<count>`. Restarting this command is safe. It serializes concurrent deployers, verifies existing encrypted records with the configured key, and applies historical migration files without modifying their checksums.
5. Confirm the queries below and read an existing active credential through `CredentialsService.readActive` without logging its value. Check application login and the channel list, then resume writers. Provider validation belongs to S17.

Do not use direct `prisma migrate deploy` as the upgrade entry point. It skips the encrypted preflight and can invoke the preserved unsafe historical copy. The forward constraint rejects leftover plaintext, but cannot undo a previous historical migration that has already committed. If an old deployment created prefixed rows, run the repair procedure rather than starting an older application version.

## What the command does

For a clean/pre-credential schema, a temporary migration directory contains byte-for-byte copies through `20260920140000_secure_credentials`. Prisma deploys that stage, which retains legacy source columns. The temporary directory is removed on normal success or failure. No data or key is written there.

For both staged and already-upgraded databases, one transaction locks credential/channel/organization writes, encrypts `PLAINTEXT_MIGRATE:` rows with the runtime AES-256-GCM codec, and migrates organization CRM and channel access tokens. It reads saved ciphertext back and verifies decryption. Channel references must match organization and provider. Conflicting credentials stop the transaction for operator resolution. Audit records (`credential.upgrade_verified`) and source cleanup commit together; a failure rolls everything back. Revoked/rotated credential statuses and IDs are preserved.

After repair, the full migration chain runs. The forward migration rejects plaintext credential prefixes and nonempty legacy channel tokens, normalizes cleared channel values to NULL, and adds indexes for outbox lease timestamps and session expiry. A final verification pass checks decryption/linkage again. Application boot checks the key and refuses outstanding prefixed rows; reads no longer repair secrets opportunistically.

This scrubs logical live database values. It does not erase old WAL, snapshots, backups or storage pages. Restrict and expire those using the operational retention policy; backup restore evidence remains S17.

## Non-sensitive verification

```sql
SELECT count(*) AS legacy_credentials
FROM credentials WHERE "encryptedPayload" LIKE 'PLAINTEXT_MIGRATE:%';
SELECT count(*) AS legacy_channel_tokens
FROM channels WHERE COALESCE("accessToken", '') <> '';
SELECT count(*) AS invalid_channel_links
FROM channels ch JOIN credentials c ON c.id = ch."credentialId"
WHERE ch."organizationId" <> c."organizationId" OR ch.provider::text <> c.provider::text;
SELECT action, count(*) FROM audit_logs
WHERE action = 'credential.upgrade_verified' GROUP BY action;
```

The first three counts must be zero. Audits contain source category, version, verification flag and correlation IDs, never secrets. A repeat run normally reports zero repairs. Do not print `encryptedPayload`, legacy token columns, decoded credentials or database connection strings while investigating failures.

## Failure and recovery

- `CREDENTIAL_KEY_INVALID`: configure the existing 32-byte key. This check happens before database mutation.
- `CREDENTIAL_DECRYPT_FAILED` / `CREDENTIAL_KEY_VERSION_UNSUPPORTED`: obtain the correct existing key/version. Do not replace unreadable ciphertext or mark it repaired.
- `CREDENTIAL_*CONFLICT_REQUIRES_OPERATOR` / `CREDENTIAL_CHANNEL_LINK_INVALID`: compare linkage and provider configuration in a secure operator session. Resolve which credential should remain active without printing token values, then rerun. The repair transaction leaves sources intact on failure.
- `PRE_MVP_WHATSAPP_MIGRATION_REQUIRES_OPERATOR`: a schema predating September's channel migration still has organization-level WhatsApp credentials or account IDs. The old migration drops those fields. This case intentionally stops **before** migration; arrange an explicit encrypted channel backfill and verify it before continuing. This older upgrade path is not automated by S02.
- `MIGRATION_DEPLOY_FAILED_Pxxxx`: inspect `_prisma_migrations` names, timestamps and completion state without dumping its potentially sensitive `logs` column. Prisma can retain a failed migration record. Determine whether its SQL committed partially before using `prisma migrate resolve --rolled-back <exact-failed-name>` after correcting the cause, or `--applied` only if every statement has been independently verified. Never blindly resolve or rewrite applied history.
- Other failures stop with a fixed code, not raw PostgreSQL/Prisma errors. Check connectivity, permissions, locks and schema state using a restricted operator session. Keep ingress disabled until repair and schema verification succeed.

If failure happens after credential repair commits but before all later migrations succeed, rerun with the same key: encrypted records remain readable, audit intent is retained, and cleared sources cannot be recopied by the old migration. If returning to a prior application version requires plaintext columns, do **not** recreate them from ciphertext. Restore the pre-upgrade backup into an isolated database, verify it with its original matching key, and recover through a reviewed forward upgrade. Production backup restoration itself has not been exercised here.

## Migration-chain review

- The preserved duplicate-phone migration keeps one preferred active lead and soft-deletes/renames duplicates with their IDs. Both records survive; fixtures verify the active record count and uniqueness. It does not merge patient records. Review legacy duplicate groups before deployment. Unexpected generated-phone collisions, duplicate slugs, emails or memberships must be resolved by an operator before unique constraints can deploy.
- Existing `isEmailVerified=true` users become ACTIVE and other users become PENDING. This does not implement verification or invitation activation (S03).
- Sessions and their family/revocation/expiry fields survive upgrade. Outbox `updatedAt` and message `mediaExpiresAt` match runtime schema. These migrations do not prove worker lease behavior or media cleanup (S04/S10).

## Reproduce local evidence

```sh
nvm use
cd backend-v2
bash test/run-credential-upgrade.sh
```

Requires Docker and the `pgvector/pgvector:pg15` image. The runner creates a UUID-named container bound to a random loopback port and five UUID-named disposable databases. Only generated names may be dropped. EXIT/INT/TERM traps remove its container and all contained data, including after failed tests. A forced host shutdown/SIGKILL cannot run a shell trap; remove only the corresponding `omnidesk-s02-<uuid>` container if it remains. No persistent volume is created.

Verified on 26 September 2026 with Node 22.17.1: 5 database tests passed, exit 0. They exercise clean/repeated deploy, pre-prefix upgrade, already-applied prefix repair with an existing session, audit failure/rollback/retry, and missing/wrong-key rejection. The real credential service decrypts every fixture token; migrated users can log in; channel linkage and duplicate lead preservation are checked. Prisma `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` returned 0 on both clean and upgraded databases. Only synthetic fixtures were used.
