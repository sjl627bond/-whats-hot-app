# GoHott iOS launch architecture

## Recommendation

The Phase 6 web app is now packaged with Capacitor 8. The native shell preserves the tested HTML/CSS/JavaScript and Supabase backend while providing camera, Photos, location, push, sharing, App/Universal Link, keyboard, and lifecycle bridges. The PWA remains the canonical product implementation; product logic is not forked into Swift.

`com.placeholder.gohott` is deliberately non-release configuration. It is not a recommended or reserved identifier. Replace it in `capacitor.config.json` and both Xcode build configurations only after the owner supplies and registers the final reverse-DNS Bundle ID. The Apple Development Team remains an uncommitted local Xcode selection; no signing identity, certificate, provisioning profile, App Store Connect ID, or APNs credential is committed.

## Native requirements

- Camera: `NSCameraUsageDescription` — “GoHott uses the camera when you choose to post a temporary Live Look.”
- Photos: `NSPhotoLibraryUsageDescription` — “GoHott lets you choose a photo to post as a temporary Live Look.”
- Location in use only: `NSLocationWhenInUseUsageDescription` — “GoHott uses your location to show distances and let the server assess venue proximity.” Do not request background location.
- Push: APNs entitlement, Apple push key/certificate held only by the notification backend, explicit in-app pre-prompt, per-category preferences, and no private-message text on lock screens by default.
- ATS: keep default HTTPS-only transport. Do not add broad arbitrary-load exceptions. Supabase, Vercel, map tiles, and media endpoints must use TLS.
- Universal links: add Associated Domains for the final owned production domain and publish an `apple-app-site-association` file containing the real Apple Team ID. Route `/venue/:id`, `/profile/:id`, `/live-look/:id`, and `/plan/:id`; reject malformed IDs and preserve a web fallback.
- Privacy manifest: declare only APIs actually used by the native shell/plugins. Recheck every Capacitor plugin before submission.

## Implemented native foundation

- Capacitor core/iOS and six official plugins are exactly pinned in `package.json` and `pnpm-lock.yaml`: App, Camera, Geolocation, Keyboard, Push Notifications, and Share.
- `scripts/build-web.mjs` produces the local `www` bundle without changing the deployable root PWA. `pnpm ios:sync` rebuilds and copies it into the native target.
- `ios/App/App.xcworkspace` opens the generated Swift Package Manager-based iOS project.
- `Info.plist` contains camera, Photos, and foreground-only location explanations. Background location is not requested and ATS is not weakened.
- `native-runtime.js` is a no-op in browsers and uses native APIs only in Capacitor. It handles explicit photo selection, foreground location, user-initiated notification permission, native sharing, lifecycle-aware auth refresh, and validated deep links.
- The native build vendors the exact pinned Supabase JS and Leaflet releases instead of depending on CDN availability. A cold offline launch can render GoHott's shell and truthful unavailable states; live data and map tiles still require network access.
- Simulator camera-unavailable errors fall back to the Photos picker. Location denial/restriction is normalized into the existing optional-location fallback, and reconnecting refreshes live venue data.
- The existing Supabase client continues to persist sessions inside the app's WKWebView sandbox and refreshes them only while active. Sign-out remains local-session revocation. No service-role or APNs secret is present.
- Profile → Settings & Privacy now performs an explicit destructive-action confirmation and password reauthentication before invoking the JWT-protected `delete-account` Edge Function. The function revalidates the user, accepts no account identifier, requires a token issued within ten minutes, removes only that user’s `live-looks` objects, anonymizes direct-conversation keys, and deletes the Auth user so foreign-key cascades complete account cleanup. The client clears its local session only after the server reports success.
- Password recovery uses Supabase Auth end to end. Web recovery returns to the current app origin with `?recovery=1`; iOS recovery returns through the registered `gohott://auth/recovery` URL scheme. The client validates the callback, establishes only the Supabase recovery session, and calls `auth.updateUser` after enforcing the existing six-character minimum. Before testing, add both the deployed web callback URL (for example `https://YOUR_DOMAIN/?recovery=1`) and `gohott://auth/recovery` to Authentication → URL Configuration → Redirect URLs in Supabase. Keep localhost callback URLs limited to development environments.
- `App.entitlements.example` and `PrivacyInfo.xcprivacy.example` are review templates only. They are intentionally not build-linked until the real App ID/domain and verified privacy inventory are supplied.

## Local commands

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm ios:sync
pnpm ios:open
```

Full Xcode is required. Command Line Tools alone cannot resolve/build the iOS target or run a simulator. After installing Xcode, run `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer` if needed, accept the license/components, then open `ios/App/App.xcworkspace`.

## TestFlight and App Store gate

1. Confirm legal entity, Bundle ID, domain, Apple Team ID, support URL, privacy-policy URL, age rating, and App Store categories.
2. Complete legal review of Privacy and Terms; publish retention periods, operator/contact details, lawful basis, export SLA, deletion SLA, and appeal process.
3. Apply and verify the approved Phase 6 migration; deploy privileged export, deletion, retention, moderation, notification, and telemetry workers.
4. Replace the explicit placeholder Bundle ID, select the real Apple team in Xcode, and inspect the generated entitlements and Info.plist.
5. Configure APNs in a server environment; never place an APNs key, Supabase service-role key, or moderation credential in the app.
6. Configure universal links and verify cold start, warm start, signed-out routing, missing/deleted content, and web fallback.
7. Exercise camera/library denial, limited Photos access, location denial/revocation, offline launch, poor network, session expiry, account deletion, data export, blocks, reports, and notification privacy on physical devices.
8. Deploy and validate the reviewed `delete-account` Edge Function with JWT verification enabled. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function environment; the secret must never be copied into client configuration. Exercise success, stale-session, Storage failure/retry, and cross-user isolation with disposable non-production accounts. Also provide published moderation response processes and reviewer test credentials.
9. Produce signed Release archive, upload symbols, complete App Privacy answers from a verified data inventory, add screenshots for current iPhone sizes, and run TestFlight internal then external review.
10. Submit only after Supabase advisors, browser/native regression, accessibility, retention jobs, incident response, backups, and production observability pass.

## Owner input still required

- Apple Developer Team ID and the Xcode team to use for automatic or manual signing.
- Final registered Bundle ID and whether separate development/TestFlight identifiers are desired.
- The owned canonical HTTPS domain for Universal Links. After confirmation, enable Associated Domains and publish `/.well-known/apple-app-site-association` with the real Team ID + Bundle ID.
- APNs key strategy and private notification-provider/backend configuration. APNs keys and device tokens must never be committed or logged; the app currently registers only after a user taps notification settings and does not upload a token.
- App Store Connect app record, legal entity/seller name, SKU, support URL, privacy-policy URL, contact information, category, age rating, reviewer account, privacy questionnaire answers, and export-compliance determination.
- Final app icon/launch artwork and screenshots. The generated Capacitor placeholder artwork is not release artwork.

## Account deletion data handling

Before removing the Auth user, the worker inventories `live_looks.storage_path` for the verified user, rejects any path outside that user’s UUID prefix, and removes those objects through the Storage API. It anonymizes direct-conversation keys while preserving messages authored by the other participant. Hard Auth deletion then uses existing foreign keys to remove the profile, saved venues, venue claims, deletion/export requests, push-device rows, location evidence, Live Looks and reports, follows, blocks, conversation participation, messages authored by the deleted user, plans, reactions, received notifications, and reports submitted by that user.

Check-ins and sanitized client-error rows are retained with `user_id` set to null. Venue owner/verifier references, moderation audit actors, and notification actors are also set to null. Moderation reports submitted by other users and references inside content owned by other users may be retained for safety, integrity, and abuse review; they are not exposed as deleted-user profile data. Supabase backups remain subject to the operator’s documented backup-retention period.

Storage removal happens before Auth deletion because Supabase refuses to delete users who still own Storage objects. A required cleanup failure returns an error, keeps the request retryable, and never reports success. Logs contain a random operation ID and failure stage only—not credentials, user IDs, message bodies, media paths, or other private content.
