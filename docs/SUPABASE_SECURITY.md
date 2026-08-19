# Supabase security review

## Phase 2 findings

- The frontend uses an `sb_publishable_...` key. No secret/service-role credential is present.
- Anonymous `SELECT` currently succeeds for `venues` and recent `check_ins`, which is required for guest discovery.
- Email/password Auth is enabled. Sign-up is enabled and email confirmation is required. No social provider is currently enabled.
- Every production venue currently has null latitude/longitude.
- Row-level policy metadata is not exposed through the public Data API, so existing policy definitions could not be enumerated with the browser credential. Review them with a database-owner connection before applying the migration.
- Phase 2 makes no production database change by itself. The migration must be reviewed and applied separately.

## Owner preflight

Run this read-only query in the Supabase SQL editor before applying Phase 2:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('venues', 'check_ins', 'profiles', 'saved_venues')
order by tablename;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('venues', 'check_ins', 'profiles', 'saved_venues')
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('venues', 'check_ins', 'profiles', 'saved_venues')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Confirm that no legacy policy grants `UPDATE` or `DELETE` to anonymous users. Production already has a permissive check-in INSERT policy. Because PostgreSQL combines permissive policies with OR, adding another narrow permissive policy would not restrict it. The migration therefore adds `check_ins_identity_guard` as a restrictive policy, which is ANDed with every permissive INSERT path.

## Required post-migration behavior

- Anonymous users can read venues/check-ins and insert only compatibility reports with `user_id is null`, `proximity_status = 'unassessed'`, and `distance_meters is null`.
- Authenticated users can read venues/check-ins and insert only check-ins owned by `auth.uid()`.
- Profiles are visible and writable only to their owner.
- Saved relationships are visible and mutable only to their owner.
- `client_nearby` requires a non-null account ID but remains a browser-supplied, advisory proximity estimate—not an authorization claim, cryptographic proof, or server verification.
- The frontend only displays “Device-estimated nearby” when both `user_id` and `proximity_status = 'client_nearby'` are present. Anonymous rows never receive that indicator.

The migration intentionally does not add any field called `verified` or `server_verified`. A future server-controlled function should own that state, revoke direct client writes to it, validate location evidence, and apply anti-abuse controls.

Run Supabase database security/performance advisors after applying the migration, then test as both `anon` and two distinct authenticated users. User A must not be able to read or modify User B's profile or saved venues.
