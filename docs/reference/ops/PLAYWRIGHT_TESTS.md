# Browser permission suite (P1-10)

Proves, in a real browser, that changing identity, role or clinic cannot leak an earlier user's data.

```bash
bash playwright/run.sh            # needs Docker + Node 22; starts disposable Postgres/Redis, backend, frontend
bash playwright/run.sh -g "A → logout"   # extra args go to `playwright test`
```

- **Synthetic only.** Two fake clinics, four personas, random passwords generated per run into a temp
  file (mode 0600) that is deleted on exit. No auth-state files are written; tests sign in through the UI.
- **Traces are off** (they can contain request bodies). Opt in with `PLAYWRIGHT_TRACE=1`.
- Fixture seeding and operator-style actions (recovery link, role downgrade) live in
  `../backend-v2/scripts/playwright-fixture.ts`, outside `src/`.
- Assertions look at DOM text, web storage, Cache Storage, IndexedDB names and recorded API payloads — not screenshots.
- Scenarios: A → logout → B in one tab with delayed A responses; cross-tab logout; role downgrade while
  signed in; recovery invalidating an open session; staff joining an existing clinic; restricted staff
  in the Inbox (expects the "no access" alert, not an empty thread).
- Not covered here: delayed _socket_ events in the browser (covered by `src/lib/__tests__/socket-runtime.test.ts`
  and the backend socket e2e suite).
