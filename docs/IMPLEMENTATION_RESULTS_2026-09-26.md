## S07: WebSockets and Notifications Authorization
- **Status:** **COMPLETE** (2026-09-27)
- **Summary:** Added mid-session permission revocation and connected-socket tests. Filtered previously persisted notifications when a recipient loses record access (e.g., losing `leads:read:all` and unassigned from the reference). Audited notification producers to ensure response parity and proper access level validation prior to socket broadcasts.
- **Evidence:** `authorization-socket.e2e-spec.ts` passes `run-credential-upgrade.sh` locally.
- **Remaining Limits:** Database RLS is inactive. All authorization relies on application-level checks and queries.
