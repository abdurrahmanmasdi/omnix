# Deployment: migrations are a separate step

_WP-C C2.6, 2026-10-03. Applies from branch `wp-c/access-config` onward._

The API process no longer migrates the database when it starts. `npm run start:prod`
runs only `node dist/src/main.js`. Migrations, the credential upgrade and the runtime
role passwords are applied by a **separate deploy step** that runs before the new
version starts.

## Why

`start:prod` used to run `deploy-cli` and then the app with the same `DATABASE_URL`.
That forces the long-running API to hold migration (DDL) privileges, which defeats the
least-privilege runtime role `omnix_backend_runtime` (KI-033, D-006). Separating the
steps lets each one use the role it needs:

| Step                                    | Command                                                                                                       | Database role                                      | Required env                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy (once per release, before start) | `npm run db:deploy:prod` (built: `node dist/src/credentials/deploy-cli.js`); from source: `npm run db:deploy` | migration/admin role via `DATABASE_URL`            | `DATABASE_URL`, `INTEGRATION_CREDENTIAL_KEY`, `OMNIX_BACKEND_RUNTIME_DB_PASSWORD`, `OMNIX_PYTHON_RUNTIME_DB_PASSWORD` (required when `NODE_ENV=production`) |
| Run (long-lived)                        | `npm run start:prod` (image default `CMD`)                                                                    | `omnix_backend_runtime` via `RUNTIME_DATABASE_URL` | everything in `.env.example`, validated at startup                                                                                                          |

`npm run db:deploy` stays the only supported migration entry point (credential
preflight, advisory lock, runtime role passwords). Do not call `prisma migrate deploy`
directly. Details of the credential part: `CREDENTIAL_UPGRADE.md`.

## What the deploy step does

1. Takes the `omnidesk-safe-deploy-v1` advisory lock (concurrent deployers serialize).
2. Validates `INTEGRATION_CREDENTIAL_KEY`, repairs/verifies encrypted credentials, applies
   migrations (`prisma migrate deploy` through the staged config) and re-checks credentials.
3. Sets the `omnix_backend_runtime` / `omnix_python_runtime` passwords from
   `OMNIX_BACKEND_RUNTIME_DB_PASSWORD` / `OMNIX_PYTHON_RUNTIME_DB_PASSWORD` (KI-013). It
   sends a SCRAM-SHA-256 verifier computed locally, so the plaintext never reaches the
   database server or its logs, and never prints it. Missing values stop a production
   deploy (`RUNTIME_ROLE_PASSWORD_REQUIRED`) and only warn elsewhere. Changing the secret
   and re-running the step rotates the password.
4. Prints `CREDENTIAL_UPGRADE_COMPLETE repaired=<n>` or a fixed error code; it never
   prints raw database errors.

The image contains the Prisma CLI (now a runtime dependency) so the same image can run
both commands.

## Per platform

- **Railway** (founder action in P1-11): set the service's _pre-deploy command_ to
  `npm run db:deploy:prod` with the deploy env above, and the start command to the image
  default (`npm run start:prod`). Until a pre-deploy command is configured, a release
  that adds a migration will start against the old schema.
- **Docker Compose (workspace `docker-compose.yml`)**: the `db-migrate` service already
  runs `node dist/src/credentials/deploy-cli.js` and the API waits for it
  (`service_completed_successfully`).
- **Local dev**: `npm run db:deploy` against the intended dev database only, then
  `npm run start:dev`.

## Not decided here

Which environments exist, where secrets live, TLS for internal gRPC
(`INTERNAL_GRPC_TLS`) and the rotation of the passwords that the committed migration
exposed are part of P1-11 (deployment rehearsal).
