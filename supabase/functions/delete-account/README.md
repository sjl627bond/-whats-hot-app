# Account deletion Edge Function

This function is intentionally not deployed by repository changes. Deploy only after review, then validate with disposable non-production users.

Security invariants:

- `verify_jwt = true` remains enabled in `supabase/config.toml`.
- The function revalidates the bearer token with Supabase Auth and derives the subject from that verified user.
- The request body contains confirmation only. Client-provided `user_id`/`userId` fields are rejected.
- A token issued more than ten minutes earlier is rejected; the app obtains a fresh token through password reauthentication.
- `SUPABASE_SERVICE_ROLE_KEY` stays in the Supabase function environment and is never client configuration.
- Live Look paths must begin with the verified user UUID and are removed through the Storage API before Auth deletion.
- Logs contain an operation ID, stage, and object count only—never the user ID, credentials, content, or media paths.

Activation checklist:

1. Review `docs/IOS_LAUNCH_READINESS.md` and `docs/PHASE6_OPERATIONS.md`.
2. Deploy `delete-account` without disabling JWT verification.
3. Use separate disposable accounts to verify cross-user isolation, representative database cascades, Live Look cleanup, stale-session rejection, retry after simulated failure, and local sign-out.
4. Run Supabase security/performance advisors and the full Phase 1–6 suite.
5. Do not use a production account for destructive validation.
