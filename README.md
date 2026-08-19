# GoHott

GoHott answers one question: **Where should we go right now?** It is a mobile-first nightlife discovery PWA combining live crowd reports, venue popularity, location, saved places, and trusted user activity for Sarasota and Tampa Bay.

## Current product

Phase 1 established the GoHott brand, live Supabase venue ranking, city switching, crowd reports, realtime refreshes, and an installable static PWA. Phase 2 adds:

- Persistent Supabase email/password authentication without blocking guest browsing
- User profiles, saved venues, and personal check-in history
- Location-aware distance display and trusted-nearby report metadata
- Repeated-report protection for authenticated users
- Interactive Leaflet/OpenStreetMap experience with automatic venue markers when verified coordinates exist
- Reusable venue detail screens with live status, score, line note, recent reports, Save, and Report actions
- Functional Discover, Map, Saved, and Profile navigation

## Architecture

GoHott remains a dependency-light static application compatible with Vercel.

| File | Responsibility |
| --- | --- |
| `index.html` | App shell, accessible screens, navigation, and modal forms |
| `styles.css` | Mobile-first visual system and responsive components |
| `config.js` | Browser-safe configuration, city centers, and trust thresholds |
| `supabase.js` | Data queries, mutations, realtime, profiles, and saves |
| `auth.js` | Persistent session, sign-up, sign-in, sign-out, and auth state |
| `geo.js` | Permission-based geolocation, distance, and proximity assessment |
| `map.js` | Leaflet map, OpenStreetMap tiles, venue markers, and user position |
| `app.js` | Product state, scoring, navigation, views, and interaction orchestration |
| `sw.js` | Versioned network-first app-shell cache |
| `supabase/migrations/` | Additive database schema, grants, and RLS policies |

No framework or build step is required.

## Local development

Serve the repository root over HTTP:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Geolocation works on localhost and HTTPS deployments. The map and Supabase client libraries load from pinned CDNs, so an internet connection is required for first use.

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

Review and apply `supabase/migrations/20260819161930_gohott_phase_2.sql` using the normal Supabase migration workflow. It is additive: it creates `profiles` and `saved_venues`, adds nullable identity/trust metadata to `check_ins`, creates indexes, grants minimum table privileges, enables RLS, and adds ownership policies. It does not delete or rewrite venue/check-in rows.

Before production application, inspect existing `venues` and `check_ins` policies. The migration adds a restrictive identity guard so legacy permissive insert policies cannot spoof `user_id`, but policy review remains required whenever old policies are unknown.

## Authentication and authorization

Visitors can browse, view maps/details, and submit compatibility crowd reports without an account. Authentication is required for Saved and Profile. Authenticated check-ins attach the signed-in user ID and are checked against RLS ownership.

Required RLS model:

- `venues`: public read; no public writes
- `check_ins`: public read; anonymous inserts require `user_id is null`; authenticated inserts require `user_id = auth.uid()`
- `profiles`: authenticated users can select, insert, and update only `id = auth.uid()`
- `saved_venues`: authenticated users can select, insert, and delete only `user_id = auth.uid()`

The browser's proximity assessment is advisory. A production trust score should eventually validate location server-side and incorporate device/account abuse signals.

## Location and map behavior

Location is optional and only requested after a user action. If granted, GoHott calculates distance locally for venues with coordinates and shows the user on the map. If denied or unavailable, city-based discovery remains fully functional.

Leaflet uses OpenStreetMap's standard public tiles with required attribution and no billable API key. All current production venue coordinates were null during Phase 2 development, so the map truthfully shows an empty marker state. Markers and distance appear automatically when legitimate coordinates are populated; the application never invents venue locations.

## Scoring

The Phase 1 algorithm is preserved: each venue starts with `hot_score` (default 50), reports from the previous two hours adjust it (`+3` Going Off, `+2` Pretty Busy, `-1` Chill, `-3` Dead), the adjustment is capped at ±15, and the final score is clamped from 0–100. Phase 2 records verification metadata but does not change report weighting yet.

## Deployment and PWA

Deploy the repository root to Vercel as a static site with no build command. The manifest, icons, standalone metadata, relative paths, safe-area layout, and service worker are production-ready. The service worker uses a versioned, network-first strategy so new releases are not trapped behind stale cached code.

After deploying, add the production and preview URLs to Supabase Auth redirect/site URL configuration, verify email templates, and test sign-up confirmation links.

## Known limitations

- The Phase 2 migration must be applied before profiles, saves, and identity metadata persist.
- Existing venues need legitimate coordinates before venue markers/distances can render.
- Email confirmation depends on Supabase Auth project mail settings.
- Guest check-ins remain for backward compatibility and are untrusted.
- Location verification and repeat throttling are client-assisted; robust anti-abuse enforcement needs server-side validation.
- Public OpenStreetMap tiles are suitable for current light traffic; a production-scale tile strategy must follow the provider usage policy.

## Phase 3 priorities

1. Curate verified venue coordinates, addresses, hours, media, and data provenance.
2. Add server-side check-in validation, rate limiting, moderation, and trust weighting.
3. Add Google/Apple Auth after provider and redirect configuration.
4. Add automated unit, browser, accessibility, and migration integration tests.
5. Add observability, privacy controls, account deletion/export, analytics, and incident tooling.
6. Evaluate a dedicated tile provider and Supabase Realtime Broadcast as traffic grows.
