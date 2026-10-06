# OmniX — start here (every AI agent: Claude chat, Claude Code, Codex)

OmniX = invitation-only **AI patient-enquiry assistant + internal CRM + staff dashboard for dental clinics** in Istanbul (international patients). WhatsApp first. Dental only.
One git repo. Apps: `apps/backend-v2` (NestJS), `apps/frontend-v2` (Next.js), `apps/python-ai-service-v2` (FastAPI + gRPC + LangGraph).

## The single source of truth is `docs/` — nothing else is documentation

| File | What | When to read |
| --- | --- | --- |
| `docs/PLAN.md` | Goal, where we are, the card list, what's next | **Always** — the "Now" section |
| `docs/README.md` | Product rules, how we work, card process, memory rules | **Always** (once per session) |
| `docs/ARCHITECTURE.md` | Services, data, AI, invariants, per-app commands + "deliberate, don't fix" lists | The sections for the app/area you touch |
| `docs/DECISIONS.md` | D-001… why things are the way they are | grep by id/topic before changing odd-looking behavior |
| `docs/ISSUES.md` | Open bugs (KI), open questions (Q), improvement ideas (IMP) | grep by id; the card names the ones you need |
| `docs/LOG.md` | One short entry per finished card/session | Last 3 entries |
| `docs/reference/` | Business docs, specs, ops runbooks, full old card text | Only when a card points to a file. grep, never read whole |

These files are the project memory: they stop us guessing. If it is not written there, do not assume it. If you learn something that matters later, write it in the right file (rules in `docs/README.md` → Memory).

## Hard rules (full list: `docs/README.md`)
- Never read, print or commit `.env*`, keys, tokens, real patient data or raw webhook payloads.
- Work on the card's branch; never commit to `main`, never merge, deploy, touch Railway or migrate a shared database.
- Do only the card. Other findings → new KI in `docs/ISSUES.md`, don't fix them.
- Run only the tests the card lists. No new tests, CI jobs, tooling or `.md` files beyond the card.
- End of card: update `docs/PLAN.md` (status) + add a `docs/LOG.md` entry (≤ 8 lines). No separate evidence files.

## Next.js warning (frontend)
This Next.js version has breaking changes — APIs, conventions and file structure may differ from your training data. Read the relevant guide in `apps/frontend-v2/node_modules/next/dist/docs/` before writing Next code. Heed deprecation notices.
