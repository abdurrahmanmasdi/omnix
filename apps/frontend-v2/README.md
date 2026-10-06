# OmniX frontend

This Next.js app is the invitation-only pilot UI. Public signup is disabled. The operator invitation flow is exercised in `../backend-v2/test/first-organization.e2e-spec.ts`.

## Local development

Use Node 22 (`nvm use`), then `npm ci` and `npm run dev`. Next's default dev port is 3000; if the Nest backend is also running locally, set a different frontend port and `NEXT_PUBLIC_API_URL` to the backend's browser-reachable address. The repository-root Compose stack maps Nest to `http://localhost:3000` and Next to `http://localhost:3001` (the Next container sets `PORT=3001`). These are development addresses, not staging endpoints.

For a Railway frontend Docker deployment, set `NEXT_PUBLIC_API_URL` to the browser-reachable backend HTTPS origin on the frontend service **before building** and rebuild when it changes. The Dockerfile declares it as a builder-stage `ARG`; a runtime-only value cannot change a URL already embedded in the browser bundle. See [Railway Docker build variables](https://docs.railway.com/builds/dockerfiles) and [Next environment variables](https://nextjs.org/docs/app/guides/environment-variables). This configuration change does not by itself verify the current Railway deployment.

Run `npm run build`, `npm run lint`, and `npx vitest run` before review. Fonts are bundled locally; the production build does not fetch Google Fonts. The generated API client comes from the checked-in `openapi.json`; use `npm run generate:api` and the backend contract check when changing the API.

Public copy is tracked in `../docs/CLAIMS_REVIEW_2026-09-28.md`. The example chat is illustrative, and clinic-specific privacy/terms wording still needs product/privacy owner approval before publication.
