# Deployment — Beija

Step-by-step from empty environment to a TestFlight build users can install.

---

## Prerequisites

| Item | Cost | Status / Time |
|---|---|---|
| Apple Developer Account | $99/year | **✅ Already provisioned** under `info@arborium.app` (access recovery pending — see `CREDENTIALS.md`) |
| Google Cloud Console account | Free | ❌ 10 min |
| Supabase account + project | Free tier OK to start | ❌ 10 min |
| Domain `beija.app` (or your choice) | ~$15/year | ❌ 15 min |
| Email for support / legal | $0 if using Gmail aliases | ❌ 5 min |
| Designer-day for icon + screenshots | One-off | ❌ See `ASSETS_SPEC.md` |

> Apple Dev account belongs to the **Arborium** entity. The annual fee is paid; only access recovery is blocking. See the recovery checklist in `CREDENTIALS.md`.

Software:
- macOS (required for iOS submission)
- Xcode 15+
- Node 20+
- `supabase` CLI (`brew install supabase/tap/supabase`)
- `cocoapods` (`brew install cocoapods`)

---

## Step 1 — Create Supabase project

1. Go to https://supabase.com/dashboard → New project.
2. Region: closest to your audience (`sa-east-1` for Brazil).
3. Save the **project ref** and the **anon public key** (Settings → API).
4. Apply migrations:
   ```bash
   cd beija
   supabase login
   supabase link --project-ref <your-ref>
   supabase db push
   ```
5. Verify in the Dashboard → Database → Tables: 8 tables exist (profiles, photos, swipes, matches, messages, reports, blocks, deletion_requests).

### 1a — Create the storage bucket

Dashboard → Storage → New bucket:
- Name: `profile-photos`
- Public bucket: **yes**
- Allowed MIME types: `image/jpeg, image/png, image/webp`
- File size limit: 5 MB

Set RLS policies for the bucket (under Storage → Policies):
- INSERT: allow if `bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text`
- UPDATE: same
- DELETE: same
- SELECT: allow all (`true`) — photos are public-read

---

## Step 2 — Configure OAuth providers in Supabase

Dashboard → Authentication → Providers.

### Apple

1. In Apple Developer Console → Identifiers → New App ID with bundle id `io.beija.app`. Enable capabilities: Sign in with Apple, Push Notifications, Associated Domains.
2. Identifiers → New Services ID `io.beija.app.signin`. Enable Sign in with Apple, configure return URL: `https://<your-ref>.supabase.co/auth/v1/callback`.
3. Keys → New key, enable Sign In with Apple, associate to the App ID. Download the `.p8` and note the Key ID.
4. In Supabase Apple provider config: paste Services ID, Team ID, Key ID, and the .p8 contents.

### Google

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client.
2. **iOS client:** bundle id `io.beija.app`. Save the iOS client id → goes into `VITE_GOOGLE_IOS_CLIENT_ID`.
3. **Web client:** authorized redirect `https://<your-ref>.supabase.co/auth/v1/callback`. Save the web client id and secret. Web client id goes into `VITE_GOOGLE_WEB_CLIENT_ID`.
4. In Supabase Google provider config: paste Web client id + secret.

---

## Step 3 — Wire frontend env vars

```bash
cd frontend
cp .env.example .env.local
```

Fill in:
- `VITE_SUPABASE_URL=https://<ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=eyJ...`
- `VITE_GOOGLE_IOS_CLIENT_ID=...`
- `VITE_GOOGLE_WEB_CLIENT_ID=...`

Verify locally:
```bash
npm run dev
```

Sign in with Apple/Google should succeed and persist across reloads.

---

## Step 4 — App Store Connect

1. https://appstoreconnect.apple.com → My Apps → New App.
2. Bundle ID: `io.beija.app`.
3. App name: **Beija** (subtitle, keywords, etc — copy from `AppStoreMetadata.md`).
4. Age rating: 17+. Complete the rating questionnaire (see `AppStoreMetadata.md`).
5. App Privacy: declare data collection per the "Nutrition Labels" section of `AppStoreMetadata.md`. Link the privacy policy URL.

---

## Step 5 — Configure Xcode

```bash
cd frontend
npm run build
npx cap sync ios
npx cap open ios
```

In Xcode:

1. **Target → Signing & Capabilities**
   - Team: select your Apple Developer team
   - Bundle Identifier: `io.beija.app`
   - Automatically manage signing: ON for development; turn OFF and use manual profiles for distribution.
2. **+ Capability:**
   - Sign in with Apple
   - Push Notifications
   - Background Modes (optional: Remote Notifications)
3. **Info.plist — usage descriptions** (in PT-BR):
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>O Beija usa a câmera pra você tirar sua foto de perfil.</string>
   <key>NSPhotoLibraryUsageDescription</key>
   <string>O Beija acessa suas fotos pra você escolher uma de perfil.</string>
   <key>NSLocationWhenInUseUsageDescription</key>
   <string>O Beija usa sua localização pra mostrar pessoas perto de você.</string>
   ```
4. **URL Types** — add a CFBundleURLSchemes entry for the Google reversed iOS client id (e.g. `com.googleusercontent.apps.000000000000-xxxxxxxx`).
5. Run on a connected device to verify the full flow.

---

## Step 6 — Push Notifications (APNs key)

1. Apple Developer → Keys → New, enable APNs.
2. Download the .p8 and note the Key ID + Team ID.
3. In Supabase (or wherever your edge function dispatches push) → upload the key.
4. Test by sending a push via the Apple push test endpoint to make sure the device receives.

(The push edge function itself is still a placeholder — see `docs/API.md`.)

---

## Step 7 — Archive + upload to TestFlight

### Manual (first time)

In Xcode:
1. Product → Scheme → Edit Scheme → Run → Build Configuration: **Release**.
2. Product → Archive (Generic iOS Device).
3. Window → Organizer → Distribute App → App Store Connect → Upload.
4. Wait 10–20 min for processing in App Store Connect.
5. TestFlight tab → enable internal testing → invite testers by email.

### Automated (via fastlane, future)

Once `release-testflight.yml` is enabled:
1. Push to `main` (or trigger workflow manually).
2. Workflow runs `fastlane beta` which archives + uploads.
3. TestFlight processes and pushes to enrolled testers.

See `fastlane/Fastfile` for the (currently commented) lane definitions.

---

## Step 8 — Submit for review

1. TestFlight tab → Beta build → "Submit for Review" (for internal testers, no review needed; for external, Apple reviews TestFlight builds quickly).
2. For App Store proper: App Store tab → version → Add the build → fill metadata (use `AppStoreMetadata.md`) → upload screenshots (use `ASSETS_SPEC.md` Section 5).
3. **Demo account** — Apple will sign in with the credentials you provide. Create a real test Apple ID, complete onboarding so reviewers land on a working `/discover`.
4. Submit. First review takes 1–3 business days typically.

---

## Step 8.5 — Deploy edge functions + scheduled cron

Four edge functions live in `supabase/functions/`. Deploy each:

```bash
cd beija
supabase functions deploy notify_new_message
supabase functions deploy notify_match
supabase functions deploy account_deletion_confirmation
supabase functions deploy process_pending_deletions
```

Set the secrets these functions need (use `supabase secrets set KEY=value`):

| Function | Required env vars |
|---|---|
| `notify_new_message`, `notify_match` | `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` (full .p8 PEM), `APNS_BUNDLE_ID` (= `io.beija.app`), optionally `APNS_PRODUCTION=true` for prod servers. For Android: `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT` (raw JSON of the service-account key). |
| `account_deletion_confirmation` | `RESEND_API_KEY`, `RESEND_FROM` (e.g. `"Beija <noreply@beija.app>"`) |
| `process_pending_deletions` | none beyond the built-in `SUPABASE_*` |

Without these set, each function logs a TODO and returns success — safe to deploy before keys arrive.

### Schedule the cron

The `.github/workflows/process-deletions.yml` workflow runs daily at 03:10 UTC. Add these repo secrets to enable it:

- `SUPABASE_FUNCTIONS_URL` — `https://<project-ref>.functions.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API → `service_role` JWT

Until both are set the workflow runs but skips the invocation (logs a warning). Manual run: Actions tab → "Process pending deletions" → Run workflow.

---

## Step 9 — Post-launch

- Monitor crash-free rate (Sentry/Crashlytics — TODO).
- Watch report inflow in the `reports` table; ensure 24h SLA holds.
- Process `deletion_requests` via cron (see `docs/API.md` — future).
- Bump migrations as schema evolves; never edit applied migrations.

---

## Rollback plan

If a release breaks production:
1. Roll back the Storage bucket / DB? Generally not needed — RLS prevents data corruption.
2. App version: submit a hot-fix build, expedite Apple review (Expedited Review request is free, 1 per week).
3. Until a fixed build is approved, point users to the web version (`https://beija.app`) which can be deployed in minutes via `frontend/dist/` to any static host.

---

## Estimated total time

- Apple Dev signup + verification: **already done** ✅ (only access recovery needed for `info@arborium.app`)
- Steps 1–6: **1 day** of focused work
- First archive + TestFlight upload: **2–4h**
- Apple review of TestFlight: **0** for internal testers, **≤24h** for external; full App Store: **1–3 business days**

Realistic: **1–2 calendar days from Apple access recovered to first external TestFlight invite**.
