# GoHott

GoHott is a mobile-first nightlife discovery PWA for finding the busiest venues in Sarasota and Tampa Bay. It ranks venues using their stored baseline hot score plus crowd reports submitted during the previous two hours.

## Phase 1

- Live venue discovery and ranking for Sarasota and Tampa Bay
- Crowd check-ins with four vibe levels
- Supabase Postgres reads, inserts, and realtime check-in updates
- Installable, offline-capable PWA shell
- Responsive nightlife-focused interface
- Product navigation foundation for Discover, Map, Saved, and Profile

Map, Saved, and Profile are honest Phase 2 placeholders; they do not simulate unavailable functionality.

## Architecture

This is a dependency-light static web application that remains compatible with Vercel static hosting.

| File | Responsibility |
| --- | --- |
| `index.html` | Accessible app shell, metadata, screens, and modal markup |
| `styles.css` | Mobile-first visual system and responsive layout |
| `config.js` | Browser-safe runtime configuration |
| `supabase.js` | Supabase client, queries, mutations, and realtime subscription |
| `app.js` | UI state, hot-score calculation, rendering, navigation, and interactions |
| `manifest.json` | PWA identity and install metadata |
| `sw.js` | App-shell caching and offline fallback |

The frontend reads `venues`, loads `check_ins` from the preceding two hours, calculates a capped adjustment from `crowd_level`, and sorts the resulting `live_score`. It subscribes to inserts on `public.check_ins` and refreshes the ranking when a report arrives.

## Local development

Serve the repository root over HTTP; service workers do not work reliably from `file://` URLs.

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`. No build step is required.

## Supabase dependency and security

`config.js` contains the Supabase project URL and a publishable key. Both are intentionally visible in a browser application and are not secrets. Never add a `service_role` key, secret key, database password, or private credential to this repository.

Production security must be enforced in Supabase:

- Enable RLS on every exposed table, including `public.venues` and `public.check_ins`.
- Allow `anon` only the minimum operations needed: venue reads, recent check-in reads, and constrained check-in inserts.
- Validate inserts with a restrictive `WITH CHECK` policy and database constraints for allowed `crowd_level`/`vibe` values, valid venue IDs, and server-controlled timestamps.
- Add abuse controls (authentication, rate limiting, or a validated server endpoint) before broad production launch; a public insert policy alone cannot prevent spam.
- Keep `check_ins` free of sensitive personal data while anonymous reads are supported.
- Confirm `check_ins` is in the `supabase_realtime` publication and review Realtime authorization.

No database schema or production data is changed by this Phase 1 branch.

## Deployment

Deploy the repository root as a static Vercel project with no framework preset and no build command. The output directory is the repository root. All app-shell paths are relative, so preview and production deployments remain portable.

After deployment, verify the Supabase project's allowed origins/configuration, live reads and inserts, realtime delivery, service-worker registration, and installation on iOS and Android.

## Phase 2 roadmap

- Real map view with venue coordinates and heat visualization
- Authentication, profiles, and trusted check-in identity
- Saved venues and personalized recommendations
- Venue detail pages, operating hours, media, and directions
- Server-side anti-abuse controls and hardened RLS/database constraints
- Location-aware discovery and city modeling that does not infer Tampa Bay from “not Sarasota”
- Automated unit, integration, accessibility, and browser tests
- Realtime Broadcast evaluation for higher concurrent traffic
- Observability, analytics, moderation, and production incident tooling
