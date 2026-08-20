# Phase 6 production operations

Phase 6 is designed to remain compatible before its migration: discovery, social, and Live Look continue normally; export requests return a clear unavailable message until the reviewed migration is applied.

Required privileged workers (not browser code): process export requests into short-lived authenticated downloads; purge expired Live Looks/location evidence/export artifacts/error telemetry; deliver privacy-minimized APNs/Web Push notifications; triage social and Live Look reports; and maintain immutable moderation audit records. Use service-role credentials only in a protected server environment.

Account deletion is implemented in `supabase/functions/delete-account`. Deploy it with the committed `verify_jwt = true` configuration. It verifies the caller through Supabase Auth, rejects client-provided account IDs, requires a session token issued within ten minutes after the app’s password reauthentication, removes only paths inventoried from that user’s Live Looks, anonymizes direct-conversation keys, and calls the server-only hard-delete Admin API. Never set `verify_jwt = false`, expose `SUPABASE_SERVICE_ROLE_KEY`, or test with production accounts. Validate deployment with disposable users containing representative Live Looks and social data before release.

Realtime must remain RLS-backed and limited to the signed-in recipient/conversation. At scale, move message delivery to private authenticated Broadcast channels and revalidate membership server-side. Notification payloads must contain opaque IDs, not private message bodies or precise locations.

Set release identifiers, CSP/reporting endpoint, alert routing, uptime checks, source-map access, latency/error budgets, retention schedules, moderator roles, and runbooks before launch. Client telemetry is sanitized and memory-only until the approved backend is configured.
