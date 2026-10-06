# Invitation-only pilot activation

Launch decision confirmed by the product owner on 26 September 2026: invitation-only now, public signup later.

Public `POST /auth/signup` returns 403. The old reusable-JWT `GET /auth/verify-email` returns 410 and cannot activate accounts. There is no configuration switch that enables unfinished public signup. Existing ACTIVE accounts can still log in. PENDING, SUSPENDED and deleted accounts cannot log in or provision a workspace.

## Operator workflow

Run the additive migration with `npm run db:deploy` using the existing deployment environment and encryption key; see [credential upgrade](CREDENTIAL_UPGRADE.md). Use Node 22 and generate/build the Prisma client/application before running compiled commands.

Only an authorized operator with deployment database access can issue/revoke invitations. There is deliberately no public invitation-issuance endpoint. The `--operator` value records the operator's accountable identity; it is an audit label, not an authentication credential. Control CLI/DB access through the deployment environment.

From `backend-v2`, choose a **new**, private output path:

```sh
npm run pilot:invite -- \
  --email founder@example.invalid \
  --operator operator-identity \
  --origin https://pilot.example.com \
  --output /private/tmp/pilot-invitation-new.txt
```

The compiled equivalent is `node dist/src/auth/invite-cli.js` with the same arguments. Substitute the real approved staff email and frontend origin; the examples are synthetic. HTTPS is required except for localhost development. Output creation is exclusive, permission 0600; existing files and symlinks are not overwritten. Standard output contains invitation ID and expiry only. Errors are sanitized and return nonzero. If writing the invitation file fails after issuance, the CLI attempts to revoke that invitation.

Deliver the file's link privately to the intended account owner through your approved pilot channel after verifying their identity. This command **does not send email**. Do not put the link in tickets, logs, shared documents or source control. Remove the local file after delivery. The link uses a URL fragment, which browsers do not send to the web server; the page removes the fragment from current history and retains it only in memory until acceptance. Reloading requires reopening the original invitation link.

The invite expires one hour after issuance. The account owner supplies their name and a password of at least 12 characters and at most 72 UTF-8 bytes. The API binds activation to the invited account; the caller cannot choose another email/user/organization. Acceptance activates the account and consumes the invitation in one transaction, including its audit event. The user then logs in with the invited email and their new password and creates their first workspace. Activation itself returns no session tokens.

To revoke an unused link:

```sh
npm run pilot:invite -- --revoke <invitation-uuid> --operator operator-identity
```

To replace a lost/expired link, issue another invitation for the same pending account with a new output filename. Reissue is limited to once per minute per account and revokes earlier unused invitations atomically. Issuance never reactivates suspended/deleted accounts or resets an ACTIVE account's password. Already activated users must log in; a password-recovery flow is outside this task.

## Audit and authorization

`account_invitations` stores a purpose-bound SHA-256 hash of a 256-bit random capability, creation/expiry/consumption/revocation times, and issuer identity. Raw invitation tokens are not stored in the database. `account_activation_events` records ISSUED, REVOKED and ACCEPTED against user/invitation IDs. These tables are pre-organization account records; they are accessed by the restricted CLI and capability-authenticated activation service, not exposed as tenant resources. Request-body token/password fields are redacted by the application's logger configuration. Full-path sensitive-log verification remains S11.

Before first-workspace creation, the verified active user may call only the existing `JwtUserGuard` route, `POST /organizations`. Tenant endpoints still require an active membership. Provisioning locks the user row, checks active/nondeleted status inside the transaction, then creates the organization, persona, roles, grants and membership atomically. Concurrent requests from one user return one workspace. Competing users cannot claim the same slug; the losing request returns 409 with no partial workspace. No database RLS claim is made here.

## Verification

```sh
nvm use
cd backend-v2
bash test/run-credential-upgrade.sh first-organization.e2e-spec.ts
```

This reuses the disposable PostgreSQL runner from S02. It creates a unique database/container, applies the real migrations, and cleans its own resources on success/failure/interruption. The suite loads production auth, guards, provisioning and channel-list code with the normal cookie parser, validation and tenant middleware. Unused external channel transports are faked; Redis/AI workers are not needed for account activation. No direct database activation occurs in the happy path: the actual operator CLI creates the link, and the HTTP API accepts it. Test-only database edits simulate expiry, revocation and suspension; a database trigger injects provisioning failure.

Verified locally on 26 September 2026: 16 onboarding tests pass; the combined S02/S03 run passes 21 tests across two suites. Coverage includes disabled signup, retired verification, single-use/expired/revoked/wrong-purpose tokens, forged payloads, operator reissue, simultaneous acceptance, pending/suspended/deleted accounts, duplicate/concurrent provisioning, atomic rollback, and membership revocation. Four frontend component tests cover activation, token removal, missing/invalid links and the signup information page. A deployed browser/provider acceptance run is not claimed.

## Public signup later

Public signup requires a separate implementation and release decision. Add a configured transactional email provider with a fake transport for tests; durable email intent/delivery handling; verified sending-domain configuration; signup/resend/abuse rate limits; and a separate `EMAIL_VERIFICATION` capability purpose with single-use, expiry and audit semantics. Do not repurpose pilot invitations or resurrect access-secret JWT verification. Pending users must remain unable to access tenant data.

Keep activation capabilities and account status separate from first-workspace provisioning so both onboarding modes can share the tested provisioning transaction. Update the frontend signup form, generated API contracts, activation journey and end-to-end acceptance tests before exposing public signup. SMTP/provider credentials and actual email delivery have not been configured in this pilot implementation.
