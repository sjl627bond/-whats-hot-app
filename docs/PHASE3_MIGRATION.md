# Phase 3 database review and rollout

`20260819171121_gohott_phase_3_trust_and_venue_data.sql` is prepared for review only. It has not been applied by this branch.

## What it adds

- `markets` for scalable market configuration, seeded idempotently with Sarasota and Tampa Bay
- `venue_profiles` for curator-verified coordinates, address, categories, hours, official links, photos, sources, and future owner assignment
- `venue_claim_requests` for owner-verification workflow intake without granting venue write access
- Server-owned check-in trust/moderation columns; all existing rows default to `legacy`
- `check_in_location_evidence`, a private table separated from public reports, with 30-day expiry metadata
- `check_in_moderation` for risk reasons and review outcomes
- `account_deletion_requests` for a future privileged deletion worker
- `submit_check_in_v3`, an authenticated, restricted RPC that validates sessions, derives the allowed vibe, applies cooldowns, calculates distance against verified venue coordinates, and flags implausible evidence

No existing venue, check-in, profile, or saved-venue row is updated or deleted. No venue becomes verified automatically.

## Security model

- Browsers cannot insert `trust_tier`, server distance, accuracy, or moderation state directly.
- The RPC is `SECURITY DEFINER` only because it must write protected columns. It uses an empty `search_path`, fully qualified relations, checks `auth.uid()` and the active `auth.sessions` row, and grants execution only to `authenticated`.
- Exact submitted location evidence has RLS enabled, no browser policies, and no browser grants.
- Public venue-profile reads expose only explicitly verified rows and omit `verified_by` and `owner_user_id` columns.
- Guest reports remain compatible but are always legacy/unassessed. Old authenticated clients can fall back to anonymous-shaped legacy reports.
- `server_assessed_nearby` means the database compared client-provided coordinates with administrator-verified venue coordinates. It is stronger than a client-assigned label but is not cryptographic proof of physical presence.

## Required review before approval

Run these read-only checks against production first:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'venues', 'venue_profiles', 'venue_claim_requests', 'check_ins',
    'check_in_location_evidence', 'check_in_moderation',
    'profiles', 'saved_venues', 'account_deletion_requests', 'markets'
  )
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select routine_schema, routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public' and routine_name = 'submit_check_in_v3';
```

Review the full migration in a staging or local Supabase project, then run the Supabase security and performance advisors. Do not apply it to production from this PR without explicit approval.

## Post-approval verification

After a separately approved migration application:

1. Confirm legacy anonymous `{venue_id, crowd_level, vibe}` inserts still succeed and have `trust_tier = 'legacy'`.
2. Confirm anonymous/direct clients cannot set `trust_tier`, `server_distance_meters`, `submitted_accuracy_meters`, or `moderation_state`.
3. Confirm signed-out users cannot call `submit_check_in_v3`.
4. Confirm an authenticated RPC call is cooldown-limited and cannot submit an arbitrary vibe for a crowd level.
5. Confirm only verified `venue_profiles` are public, and private owner/reviewer IDs are not selectable.
6. Confirm no client role can read location evidence or moderation tables.
7. Test two accounts for profile, saved venue, claim, and deletion-request isolation.
8. Run advisors again and inspect database logs for rejected RPC calls.

## Production configuration still required

- Curate venue profiles and source URLs manually; do not bulk-copy unverified legacy coordinates into verified fields.
- Implement a privileged moderation/admin surface before approving claims or changing verification state.
- Schedule deletion of expired `check_in_location_evidence` rows. The migration records `expires_at` but deliberately does not enable a production cron job.
- Implement the account-deletion worker in a server/Edge Function using a service-role credential stored only in server secrets. It must remove owned Storage objects, call the Auth Admin deletion API, and account for existing JWT lifetime.
- Define retention, privacy notice, moderation appeal, and venue-owner verification policies with product/legal review.
