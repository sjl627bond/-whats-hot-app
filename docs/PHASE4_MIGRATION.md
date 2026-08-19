# Phase 4 Live Look rollout (approval required)

`20260819203000_gohott_phase_4_live_looks.sql` has **not** been applied to production. It is additive and must receive a separate security/database review and explicit production approval.

## What it adds

- A private `live-looks` Storage bucket with an 8 MB limit and image-only MIME allowlist.
- Temporary Live Look metadata, private 24-hour location evidence, reports, verified structured hours, and an append-only moderation audit log.
- Server-controlled prepare/publish/remove/report RPCs. Browsers cannot set proximity or moderation state, choose another user's path, overwrite files, or read inactive media.
- Five-minute per-venue cooldown, hourly account cap, 24-hour image-hash replay protection, short signed image URLs, and an automatic review hold after three unique reports.

“Proximity assessed” means the server calculated distance from verified venue coordinates and client-supplied device coordinates with acceptable accuracy. It is not cryptographic proof or independent verification.

## Manual review and rollout

1. Run the migration in staging and inspect every existing policy before production. Confirm no broad pre-existing `storage.objects` policy reaches this bucket.
2. Confirm Storage image transformations are enabled. The client falls back to an untransformed signed URL.
3. Populate `venue_hours` only from reviewed sources. Expiry is capped at four hours; until hours exist, “until close” intentionally falls back to 60 minutes.
4. Create a privileged scheduled cleanup job for expired location evidence, expired/removed media, and abandoned uploads. The migration deletes nothing.
5. Build a staff-only moderation surface. Never expose a service-role key in the browser.
6. Test upload, denied/inaccurate/outside location, duplicate/cooldown controls, removal, reporting, expiry, signed URLs, Realtime, and deletion cleanup.
7. Add object removal and export handling to the privileged account-deletion worker. Exact coordinates must never enter public feeds or analytics.

Rollback before public use can revoke function execution and disable the UI. Defer schema/storage cleanup; do not drop tables or bucket objects during a production rollback.
