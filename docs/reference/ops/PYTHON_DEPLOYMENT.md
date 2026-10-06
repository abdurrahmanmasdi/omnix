# Railway deployment

The Python service runs HTTP readiness on Railway's `PORT` and authenticated gRPC
on `GRPC_PORT` (default `50051`). Use the Dockerfile's default start command.
Railway variables are configured per service and environment; a variable on the
backend is not automatically available to Python.

## Required Python variables

| Variable | Configuration |
| --- | --- |
| `OPENAI_API_KEY` | The key for this environment. Synthetic rehearsal may use a nonempty placeholder when no model calls are intended. |
| `DATABASE_URL` | PostgreSQL URL for the `omnix_python_runtime` role, provisioned by the backend deploy step. |
| `INTERNAL_RPC_SECRET` | The same secret as the backend in this environment; at least 32 characters for production. |
| `ENVIRONMENT` | `production` for Railway staging and production, so production validation runs. |

For a Railway backend service named **Backend**, set Python's
`INTERNAL_RPC_SECRET` to the reference `${{Backend.INTERNAL_RPC_SECRET}}`.
Use the actual service name, including its capitalization. Configure the backend
secret first. Generate a new environment-specific secret locally, for example
with `openssl rand -hex 32`, and enter it directly into Railway; never commit it or
paste it into chat. Do not generate independent secrets for the two services.

## Internal gRPC transport

For the approved private-network topology, both services must be in the same
Railway project and environment and use the private Python hostname. Configure
these variables on **both** Python and the backend:

```dotenv
INTERNAL_GRPC_TLS=disabled
INTERNAL_GRPC_PRIVATE_NETWORK=true
```

Set backend `PYTHON_SERVER_URL` to `<python-private-hostname>:50051`, using the
private hostname displayed in Python's Networking settings. This is a gRPC target,
not an HTTP URL. Keep Python's gRPC listener unexposed publicly.

For connections outside the private network, keep `INTERNAL_GRPC_TLS=required`:
Python needs `INTERNAL_GRPC_TLS_CERT` and `INTERNAL_GRPC_TLS_KEY` (file paths), or
their `_B64` equivalents (base64 PEM). The backend needs the matching
`INTERNAL_GRPC_TLS_CA` or `INTERNAL_GRPC_TLS_CA_B64`. Missing TLS material stops
startup; supplying only the bearer secret does not complete transport setup.

## Deploy and verify

1. Start Postgres and Redis.
2. Configure the backend's pre-deploy command as `npm run db:deploy:prod`, with
   `DATABASE_URL`, `INTEGRATION_CREDENTIAL_KEY`,
   `OMNIX_BACKEND_RUNTIME_DB_PASSWORD` and `OMNIX_PYTHON_RUNTIME_DB_PASSWORD`.
   This applies migrations and provisions the runtime roles before Python starts.
   See the backend repository's `docs/DEPLOYMENT.md` for the full backend setup.
3. Apply the Python variables above and deploy the pending Railway changes.
4. Verify Python starts its gRPC listener and `GET /health` returns HTTP 200 with
   both `database` and `grpc` checks reporting `ok`. Reach this endpoint privately
   or from the service console; no public Python domain is needed.

## Troubleshooting `INTERNAL_RPC_SECRET: Field required`

This Pydantic error means the Python process did not receive the variable. In
Railway, select the failing environment, open **Python/AI → Variables**, and add
the reference to the configured backend secret. Apply/deploy the pending change.
Check the backend has the secret too and that both transport settings are present.
A Git push or a restart with unchanged variables cannot supply the missing secret.
Do not add a default secret to Python or remove the authentication interceptor.

References: [Railway variables](https://docs.railway.com/variables),
[reference variables](https://docs.railway.com/variables/reference).
