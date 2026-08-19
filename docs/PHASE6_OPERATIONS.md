# Phase 6 production operations

Phase 6 is designed to remain compatible before its migration: discovery, social, and Live Look continue normally; export requests return a clear unavailable message until the reviewed migration is applied.

Required privileged workers (not browser code): process export requests into short-lived authenticated downloads; revoke sessions then perform account deletion and cascade review; purge expired Live Looks/location evidence/export artifacts/error telemetry; deliver privacy-minimized APNs/Web Push notifications; triage social and Live Look reports; and maintain immutable moderation audit records. Use service-role credentials only in a protected server environment.

Realtime must remain RLS-backed and limited to the signed-in recipient/conversation. At scale, move message delivery to private authenticated Broadcast channels and revalidate membership server-side. Notification payloads must contain opaque IDs, not private message bodies or precise locations.

Set release identifiers, CSP/reporting endpoint, alert routing, uptime checks, source-map access, latency/error budgets, retention schedules, moderator roles, and runbooks before launch. Client telemetry is sanitized and memory-only until the approved backend is configured.
