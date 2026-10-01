@AGENTS.md

# frontend-v2 — Next.js dashboard + landing page (app rules)

Read the workspace `../../CLAUDE.md` first (product rules, mode of work, memory protocol). `AGENTS.md` (imported above) warns that this Next.js version has breaking changes: **read the relevant guide in `node_modules/next/dist/docs/` before writing Next code.** This file adds what is specific to this app.
Rating: **2.6 / 5, rewrite specific parts** (`../../reviews/frontend-v2.md`, 2026-10-01): keep the session/API core, **rebuild the Inbox** as the first C14 slice. Open problems: `../../memory/known-issues.md` (KI-034…KI-045, KI-059 are this app's findings). Brand tokens, routes, fonts: `../../context/frontend-design.md`.

## What this is

Staff dashboard (inbox, patients/leads, settings) and landing page for OmniX. Next.js App Router, React, TanStack Query, Zustand (UI/session state only), Orval-generated API client, Socket.IO client, React Hook Form + Zod, Tailwind + `components/ui`. Node 22 (`.nvmrc`). This repo is its own git repo; commit here, not in the workspace repo. The brand is **OmniX** ("OmniDesk" in the UI is the old name).

## Commands

```bash
npm ci
npm run dev              # next dev -p 3001
npm run build
npm test                 # vitest run (31 cases, all on session/socket/contract/accept-invite)
npm run lint && npm run lint:baseline   # baseline is empty: add NO warnings
npm run generate:api     # Orval, from the tracked openapi.json snapshot (see orval.config.ts)
```

The full cross-service gate runs from the backend repo (`../backend-v2/scripts/quality-gate.sh`). There is no frontend-owned CI yet. Env names: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` (see `.env.example`). **Never read or print `.env` or `Archive.zip` contents.** `NEXT_PUBLIC_SOCKET_URL` is not a Docker build ARG yet (KI-040): hosted builds fall back to `localhost:3000`.

## Rules for this app

- **Server data only through the generated Orval hooks + TanStack Query.** Never hand-edit generated files: `src/lib/api/generated`, `src/lib/api/model`, `socket-events.generated.ts`, `openapi.json`. If a generated type is wrong, fix the **backend** OpenAPI and regenerate (KI-041); don't add `as unknown as` casts or shape guessing.
- **Socket events update the Query cache** via the generated socket contract and the generated key getters, with de-dupe by message id.
- **The backend is the only permission authority.** The UI currently reads no permissions at all, so every role sees every control (backend still enforces). Never rely on the UI to hide anything security-relevant, and show backend-redacted fields as given (no un-masking; never PATCH masked PII back, KI-043).
- **Every async view needs explicit loading / empty / error states.** An error must never render as "No messages yet" or zeros (KI-037).
- **Session core is good: keep it** (`src/lib/session-manager.ts`, `session-scope.ts`, `socket-runtime.ts`, `api/axios-client.ts`, `hooks/useSocket.ts`). Identity changes go through `installSession` / `resetSession` (clears query + mutation caches, bumps a session generation that rejects stale responses, tears down the socket). Access token lives **in memory only**: never put tokens in localStorage / cookies you read from JS.
- **Human takeover first (rule 5):** manual send is enabled only while the AI is paused. Show message delivery status (`PENDING/SENT/FAILED/UNKNOWN`) and never show an `AI_DRAFT` as sent (KI-034, KI-035).
- **Copy follows the claims policy** (rules 14–15, `../../context/product.md`): no "trains your AI", no proven CRM sync, no outcome/guarantee wording, no fabricated timestamps or "verified" labels, AI identity disclosed in any example chat. The known offenders are listed in KI-059 / review §10: fix them when you touch the file.
- **Turkish is the target market:** fonts need latin-ext (ğ ş ı İ), add strings through an i18n layer once one exists (KI-045). Test Turkish rendering.
- Prefer feature folders over the flat `components/`; split files over ~300 lines; use brand tokens, not new hex colours. Behavior changes and refactors go in separate commits (rule 13).

## Do not patch the Inbox; rebuild it

`src/app/dashboard/conversations/page.tsx`, `components/conversations/LiveChatPane.tsx`, `LiveKanbanBoard.tsx` (~1,050 lines) score ≤ 2 on correctness, contracts, tests, operability. Build the new C14 Inbox next to it and switch over. The rebuild must keep: send only when AI is paused; cursor-paged history (`GET /conversations/:id/messages`); `onNewMessage` / `onConversationUpdate` / `onLeadUpdate` from the generated socket contract; invalidate via generated key getters; stage changes via `PATCH /leads/:id/stage`. The lead drawer (`LeadDetailDrawer.tsx`) is replaced by the C14 patient detail. C14 also replaces the dashboard overview (→ Today), leads table (→ Patients), documents (→ Clinic Knowledge) and analytics cards (→ Results). Carry forward: `lib/` session/socket/api, generated client + socket contract, `providers/`, `components/ui/`, auth pages, validation schemas, pipeline-stage / lead-source / channel settings.

## Deliberate: don't "fix" these (review §11)

- `installSession` clears caches **synchronously** and fire-and-forgets `cancelQueries`: login callbacks must stay synchronous; the generation counter covers late responses.
- The response interceptor throws `CanceledError('Stale session response')` for successful responses: that is the stale-identity guard.
- Token refresh uses bare `axios.post`, not `axiosInstance`: avoids interceptor loops. (Making it **single-flight** is wanted: KI-038.)
- `resetSession` ends with `location.replace('/login')` (no Back into a protected page); `releaseRef(generation)` ignores stale generations.
- `withCredentials: false` on invitation accept; drawer notes/attachments are disabled with "unavailable" labels (pilot scope); `/signup` is an invitation-only notice.

## Dead code and clutter: don't import, don't extend

Dead (no importers): `components/leads/KanbanBoard.tsx`, `components/AddExperienceForm.tsx` (+ `.bak`), `hooks/useTenantQueryKey.ts`, `components/ui/accordion.tsx`. Root clutter: `patch*.sh`, `patch_*.py`, `Archive.zip` (extract `messages/{en,tr,ar}.json` before removal, KI-019), `product_vision.md`, `ARCHITECTURE_NEXTJS.md`. `test-results/`, `playwright/.auth/`, `.pytest_cache/` are not in `.gitignore` yet: add them before committing the P1-10 Playwright work. Deletion plan: `../../memory/cleanup-manifest.md` §2.
