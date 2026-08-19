# GoHott iOS launch architecture

## Recommendation

Package the existing web app with Capacitor after Phase 6 approval. Capacitor preserves the tested HTML/CSS/JavaScript and Supabase backend while providing native camera, Photos, location, push, sharing, App/Universal Links, keyboard, and lifecycle bridges. Keep the PWA as the canonical web build and treat the iOS shell as a thin adapter; do not fork product logic into Swift.

Recommended bundle identifier: `com.gohott.app`, subject to Apple Developer availability and ownership confirmation. Use separate suffixes for non-production builds (`com.gohott.app.dev`). Never share production push credentials with preview builds.

## Native requirements

- Camera: `NSCameraUsageDescription` — “GoHott uses the camera when you choose to post a temporary Live Look.”
- Photos: `NSPhotoLibraryUsageDescription` — “GoHott lets you choose a photo to post as a temporary Live Look.”
- Location in use only: `NSLocationWhenInUseUsageDescription` — “GoHott uses your location to show distances and let the server assess venue proximity.” Do not request background location.
- Push: APNs entitlement, Apple push key/certificate held only by the notification backend, explicit in-app pre-prompt, per-category preferences, and no private-message text on lock screens by default.
- ATS: keep default HTTPS-only transport. Do not add broad arbitrary-load exceptions. Supabase, Vercel, map tiles, and media endpoints must use TLS.
- Universal links: add Associated Domains for the final owned production domain and publish an `apple-app-site-association` file containing the real Apple Team ID. Route `/venue/:id`, `/profile/:id`, `/live-look/:id`, and `/plan/:id`; reject malformed IDs and preserve a web fallback.
- Privacy manifest: declare only APIs actually used by the native shell/plugins. Recheck every Capacitor plugin before submission.

## TestFlight and App Store gate

1. Confirm legal entity, Bundle ID, domain, Apple Team ID, support URL, privacy-policy URL, age rating, and App Store categories.
2. Complete legal review of Privacy and Terms; publish retention periods, operator/contact details, lawful basis, export SLA, deletion SLA, and appeal process.
3. Apply and verify the approved Phase 6 migration; deploy privileged export, deletion, retention, moderation, notification, and telemetry workers.
4. Create the Capacitor project with pinned package versions and lockfile; add only maintained first-party/native plugins; inspect generated entitlements and Info.plist.
5. Configure APNs in a server environment; never place an APNs key, Supabase service-role key, or moderation credential in the app.
6. Configure universal links and verify cold start, warm start, signed-out routing, missing/deleted content, and web fallback.
7. Exercise camera/library denial, limited Photos access, location denial/revocation, offline launch, poor network, session expiry, account deletion, data export, blocks, reports, and notification privacy on physical devices.
8. Provide in-app account deletion initiation, report/block controls for user-generated content, published moderation response processes, and reviewer test credentials.
9. Produce signed Release archive, upload symbols, complete App Privacy answers from a verified data inventory, add screenshots for current iPhone sizes, and run TestFlight internal then external review.
10. Submit only after Supabase advisors, browser/native regression, accessibility, retention jobs, incident response, backups, and production observability pass.
