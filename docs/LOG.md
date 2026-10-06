# Log — what happened (newest at the bottom)

_One entry per finished card or working session, ≤ 8 lines: date — card/topic; branch + commits; tests run with counts; decisions needed; what to click. Full history before 2026-10-06: git history + `_backup/` zip._

## History in short (before 2026-10-06)
- 2026-09-26…09-30 — QA chain on the old code; context system set up; decided to continue + improve, not rewrite (D-008, D-010); reviews rated backend 2.9, frontend 2.6, Python 2.4.
- 2026-09-30…10-04 — Phase 1 (P1-01…P1-12) + work packages WP-A/B/B1/C/D, INT-1, QA-1, CLN-1, QA-1F: tenant isolation, auth hardening, STOP/consent, delivery reliability, config validation, rebuilt Inbox, staging on Railway, cleanup. Phase 1 accepted 2026-10-04 (D-024); merged and deployed to staging + production.
- 2026-10-05 — NIGHT-1 by Codex: N1 TR/EN/AR languages, N2 profile, N3 team page, N4 platform admin, N5 role change/removal (D-026). N1–N3 merged; N4/N5 waited on PRs. CI fixes for cross-repo pins (hosted CI never confirmed green).
- 2026-10-05 — Ideas file from the Comp AI CRM release (`reference/product/IDEAS_FROM_CRM_RELEASE_2026-10-05.md`).
- 2026-10-06 — P2-01 prompt written; Codex did not start it.

## 2026-10-06 — Restructure: one repo, one docs folder, MVP plan (Claude chat, founder approved)
- Repo: workspace root is now one git repo (`main`): `8a0fd8c` start · `f805235` import backend (origin/main `1359792` + merge of `n4/platform-admin` `b69236d` = N2–N5, only conflict was the deleted CI file) · `4d24f52` import frontend (origin/main `95b06de` + `n4` `2b2d340`, clean) · `23807ab` import Python (`90aac07`) · `5e9b59b` one small CI (D-029) · `b8e5011` docs. Old `.git` folders kept in `_backup/git/` (local, not pushed).
- Docs: ~70 `.md` files → `AGENTS.md` + `docs/` (6 files) + `docs/reference/`. Deleted: `context/`, `memory/`, `reviews/`, `graphify-out/`, `docs/archive/`, `docs/evidence/`, work packages, app `CLAUDE.md`/evidence, Meta tunnel scripts. Backup: `_backup/omnix-docs-before-restructure-2026-10-06.zip`.
- Decisions: D-027 (monorepo + docs + light process), D-028 (MVP = 5 items), D-029 (small CI). KI-015 closed. New Q14 (pilot mode).
- Not run: no tests, no builds (no code changed apart from the N4/N5 merge, which matches the reviewed branch tips exactly).
- **Founder to click:** (1) GitHub → New repository `omnix` (private, empty, no README). (2) Terminal: `cd ~/Desktop/omnix && git remote add origin git@github.com:abdurrahmanmasdi/omnix.git && git push -u origin main`. (3) Railway, each environment: Backend/Frontend/Python service → Settings → Source → connect repo `omnix`, branch `main`, Root Directory `apps/backend-v2` / `apps/frontend-v2` / `apps/python-ai-service-v2`; set `PLATFORM_ADMIN_EMAILS` on Backend; optional Watch Paths `apps/<app>/**` so a change in one app does not redeploy the others; deploy staging first, check `/ready`, log in, open Settings → Team; then production. (4) GitHub: archive `Omnix_BE`, `Omnix_FE`, `Omnix_py` (Settings → Archive); delete the `ci-private-peers` environment/secret. (5) Open the first PR in `omnix` later and check the CI goes green.

## 2026-10-06 22:00 — Validate first (D-030)
- Founder: test the market before building; WhatsApp coexistence (M4) is the one card worth building now. CI switched to manual only.
- Codex had started P2-01 in the monorepo; stopped by the founder. Its commit `44033f6` (schema + migration, untested) is parked on `p2-01/coordination-records`; not merged.
- Next: founder V1 (Railway switch) + Meta Business verification/Tech Provider; Codex runs M4 from the prompt in chat.
