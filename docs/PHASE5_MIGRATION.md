# Phase 5 social migration review

`20260819224500_gohott_phase_5_social.sql` is review-only. This branch does not apply it to production.

## What it adds

- Optional social profile fields, unique usernames, visibility and messaging preferences
- Follow/request and two-way block relationships
- Participant-only direct conversations, messages and typed share references
- Privacy-scoped nightlife plans that represent future intent only
- Live Look reactions, private notifications and moderation reports
- Realtime publication for messages and notifications; RLS still filters Postgres Changes

The migration is additive. It does not delete or rewrite existing venues, check-ins, profiles, saved venues, or Live Looks. Existing profile fields and all pre-Phase 5 application behavior remain available.

## Security model

Anonymous users retain discovery and compatibility crowd-report access, but receive no social table privileges. Authenticated writes use narrowly scoped `SECURITY DEFINER` RPCs with an active-session check; clients never choose sender, follower, notification recipient, or reaction owner IDs. Table writes are revoked from browser roles. Conversation reads require membership, notifications are recipient-only, plans are owner-readable at table level, blocked relationships suppress discovery/messaging, and reports are write-only through an RPC.

Nightlife plans are not check-ins and must never be presented as real-time presence. Aggregate plan signals expose only a count among visible plans from followed accounts.

## Manual production steps (approval required)

1. Back up and inspect current policies/grants, then apply the migration in a staging or branch database.
2. Run the Supabase security and performance advisors; inspect every new RLS policy and function grant.
3. Test two authenticated accounts plus an anonymous session: private profile discovery, follows, blocks, message permissions, conversation isolation, plan visibility, reactions, notifications and reports.
4. Confirm Realtime delivers only rows allowed by RLS. At larger scale, move private messaging to authenticated private Broadcast channels.
5. Apply to production only after explicit approval, then refresh the PostgREST schema cache and smoke-test pre-Phase 5 profile saves.
6. Configure a privileged moderation workflow and retention policy for reports/messages before broad rollout.

No new Storage bucket, secret, service-role key, or Vercel environment variable is required by this migration.
