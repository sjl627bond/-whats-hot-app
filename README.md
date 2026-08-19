# GoHott

GoHott answers one question: **Where should we go right now?** It is a mobile-first nightlife discovery PWA combining live crowd reports, venue popularity, location, saved places, and trusted user activity for Sarasota and Tampa Bay.

## Current product

Phase 1 established the GoHott brand, live Supabase venue ranking, city switching, crowd reports, realtime refreshes, and an installable static PWA. Phase 2 added authentication, profiles, saves, maps, and location-assisted reports. Phase 3 now adds a production-oriented trust foundation:

- Curator-verified venue metadata layered over existing venue rows without overwriting them
- Extensible market records with Sarasota/Tampa Bay compatibility fallbacks
- A review-only server-controlled check-in RPC with session validation, cooldowns, distance assessment, and abuse signals
- Recency/trust-weighted scoring with per-account deduplication, anonymous influence limits, and explainable adjustments
- Private location-evidence/moderation architecture and user-owned account-deletion requests
- Verified-coordinate-only map markers with graceful location/metadata fallbacks

Phase 4 adds the production **Live Look** foundation: temporary venue photos, camera/library upload, short-lived signed media, server-assessed proximity, owner removal, community reporting, moderation holds, and private Storage. Its reviewed migration and hardening are applied in production.

Phase 5 adds a migration-gated social foundation: richer profiles, people discovery, follow/block controls, privacy-safe nightlife plans, participant-only direct messages, native sharing, Live Look reactions, notifications, and social reporting. Discovery and all Phase 1–4 behavior continue to work before the Phase 5 migration is applied.

## Architecture

GoHott remains a dependency-light static application compatible with Vercel. Capacitor adds a thin native iOS shell; the deployable web root and production Supabase backend remain the same.

| File | Responsibility |
| --- | --- |
| `index.html` | App shell, accessible screens, navigation, and modal forms |
| `styles.css` | Mobile-first visual system and responsive components |
| `config.js` | Browser-safe configuration, city centers, and proximity thresholds |
| `supabase.js` | Data queries, mutations, realtime, profiles, and saves |
| `auth.js` | Persistent session, sign-up, sign-in, sign-out, and auth state |
| `geo.js` | Permission-based geolocation, distance, and proximity assessment |
| `live-look.js` | Live Look file/caption validation, hashing, and time labels |
| `social.js` | Social validation, plan/privacy constants, and native share fallback |
| `ranking.js` | Explainable recency, trust, deduplication, and influence-capped ranking |
| `map.js` | Leaflet map, OpenStreetMap tiles, venue markers, and user position |
| `app.js` | Product state, scoring, navigation, views, and interaction orchestration |
| `sw.js` | Versioned network-first app-shell cache |
| `native-runtime.js` | Browser-safe adapter for Capacitor camera, location, push, sharing, links, and lifecycle |
| `capacitor.config.json` | Native shell configuration with an explicit non-release Bundle ID placeholder |
| `ios/App/App.xcworkspace` | Generated GoHott iOS workspace using Swift Package Manager |
| `scripts/build-web.mjs` | Copies the canonical web app into the ignored native `www` build directory |
| `supabase/migrations/` | Additive database schema, grants, and RLS policies |
| `docs/PHASE3_MIGRATION.md` | Phase 3 security review, rollout, and production configuration checklist |
| `docs/PHASE4_MIGRATION.md` | Live Look Storage, RLS, privacy, cleanup, and rollout checklist |
| `docs/PHASE5_MIGRATION.md` | Social schema, RLS, privacy, Realtime, and staged rollout checklist |

No build step is required for Vercel/web deployment. Native development requires Node 22+, pnpm, Capacitor, and full Xcode; see `docs/IOS_LAUNCH_READINESS.md`.

## Local development

Serve the repository root over HTTP:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Geolocation works on localhost and HTTPS deployments. The map and Supabase client libraries load from pinned CDNs, so an internet connection is required for first use.

Run all tests with `pnpm test`. For iOS, run `pnpm build`, `pnpm ios:sync`, then open `ios/App/App.xcworkspace`. The committed Bundle ID is deliberately unusable for release until the owner supplies the registered identifier and Apple team.

## Supabase

The frontend depends on:

- `venues`: public venue discovery data, including nullable `latitude` and `longitude`
- `check_ins`: live crowd reports
- `profiles`: private per-user profile data added by Phase 2
- `saved_venues`: private user-to-venue relationships added by Phase 2
- Supabase Auth with email/password enabled
- Realtime publication for `check_ins`

`config.js` contains a Supabase project URL and publishable key. These are browser-safe identifiers, not secrets. Never commit service-role/secret keys, passwords, database connection strings, or access tokens.

### Phase 2 migration

Review and apply `supabase/migrations/20260819161930_gohott_phase_2.sql` using the normal Supabase migration workflow. It is additive: it creates `profiles` and `saved_venues`, adds identity and client-assessed proximity metadata to `check_ins`, creates indexes, grants minimum table privileges, enables RLS, and adds ownership policies. It does not delete or rewrite venue/check-in rows.

Before production application, inspect existing `venues` and `check_ins` policies. PostgreSQL ORs permissive policies, so the migration adds a restrictive INSERT guard that is ANDed with the existing permissive check-in policy. It prevents identity spoofing and requires anonymous compatibility reports to use `proximity_status = 'unassessed'` with no distance.

## Authentication and authorization

Visitors can browse, view maps/details, and submit compatibility crowd reports without an account. Authentication is required for Saved and Profile. Authenticated check-ins attach the signed-in user ID and are checked against RLS ownership.

Required RLS model:

- `venues`: public read; no public writes
- `check_ins`: public read; anonymous inserts require `user_id is null`; authenticated inserts require `user_id = auth.uid()`
- `profiles`: authenticated users can select, insert, and update only `id = auth.uid()`
- `saved_venues`: authenticated users can select, insert, and delete only `user_id = auth.uid()`

`proximity_status = 'client_nearby'` means only that a signed-in browser calculated a distance within the configured radius. It is advisory, user-controlled evidence—not cryptographic proof or server verification. Anonymous reports never submit or display that label. Phase 3 introduces a separate server-owned assessment tier while preserving this field for compatibility.

### Phase 3 migration

`supabase/migrations/20260819171121_gohott_phase_3_trust_and_venue_data.sql` is additive and backward-compatible, but is **not applied by this branch**. It adds verified venue profiles, markets, protected check-in intake, private moderation/location evidence, and account-deletion request architecture. Review [the rollout checklist](docs/PHASE3_MIGRATION.md) and obtain explicit approval before any production application.

The browser never assigns `trust_tier`. When Phase 3 is available, authenticated reports go through `submit_check_in_v3`; before it is available they fall back to Phase 2 behavior. Guest reporting remains a legacy/unassessed path.

## Location and map behavior

Location is optional and only requested after a user action. If granted, GoHott calculates distance locally for venues with coordinates and shows the user on the map. If denied or unavailable, city-based discovery remains fully functional.

Leaflet uses OpenStreetMap's standard public tiles with required attribution and no billable API key. All current production venue coordinates were null during Phase 2 development, so the map truthfully shows an empty marker state. Markers and distance appear automatically when legitimate coordinates are populated; the application never invents venue locations.

## Scoring

Each venue still starts with `hot_score` (default 50), uses the original crowd signals (`+3` Going Off, `+2` Pretty Busy, `-1` Chill, `-3` Dead), caps live adjustment at ±15, and clamps the final score from 0–100. Phase 3 adds transparent recency buckets, gives server-assessed reports more influence, ignores suspicious reports, counts only the newest report per account, and caps anonymous contribution. Venue details show the baseline and live adjustment.

## Deployment and PWA

Deploy the repository root to Vercel as a static site with no build command. The manifest, icons, standalone metadata, relative paths, safe-area layout, and service worker are production-ready. The service worker uses a versioned, network-first strategy so new releases are not trapped behind stale cached code.

`vercel.json` applies a restrictive content security policy, same-origin geolocation permission, clickjacking protection, MIME sniffing protection, and a strict referrer policy while allowing the pinned Supabase/Leaflet dependencies and Supabase API connections.

After deploying, add the production and preview URLs to Supabase Auth redirect/site URL configuration, verify email templates, and test sign-up confirmation links.

## Known limitations

- The Phase 2 migration must be applied before profiles, saves, and identity metadata persist.
- Existing venues need legitimate coordinates before venue markers/distances can render.
- Email confirmation depends on Supabase Auth project mail settings.
- Guest check-ins remain for backward compatibility and are untrusted.
- The Phase 3 migration requires explicit approval and staged verification before production application.
- Server-assessed proximity still begins with client device coordinates; it is not cryptographic presence proof.
- Expired private location evidence needs a separately configured retention job.
- Account deletion requests need a privileged backend worker before they can complete Auth deletion and session revocation.
- Public OpenStreetMap tiles are suitable for current light traffic; a production-scale tile strategy must follow the provider usage policy.
- Live Look is enabled in production; privileged retention and moderator operations remain separate backend responsibilities.
- Phase 5 social writes remain disabled until its additive migration receives explicit approval and is applied.
- “Until close” is capped at four hours and safely falls back to 60 minutes until verified structured venue hours are populated.
- A privileged retention worker and moderator console are still required for production operations at scale.

## Next priorities

1. Review the Phase 5 migration in an isolated Supabase project and build moderator tooling.
2. Add self-service data export and complete social/media cleanup in account deletion.
3. Move high-volume private events to authenticated Realtime Broadcast channels.
4. Add edge-level abuse signals, message rate limits, and privacy-safe observability.
5. Add end-to-end isolated-Supabase and multi-browser CI.

## Phase 6 launch-readiness

Phase 6 adds iPhone safe-area and compact-viewport behavior, resilient offline navigation, permission rationale, deep-link routing, privacy/legal entry points, data-export and notification foundations, sanitized observability, and an additive review-only backend migration. The recommended native strategy is a thin Capacitor iOS shell over the existing PWA and Supabase architecture; see `docs/IOS_LAUNCH_READINESS.md` and `docs/PHASE6_OPERATIONS.md`.

The Phase 6 migration is not applied automatically. Export, deletion, notification, retention, moderation, and telemetry processing require privileged server workers and explicit production approval. The web client contains no service-role, APNs, or private credentials.
