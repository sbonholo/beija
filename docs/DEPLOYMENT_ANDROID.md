# Deployment — Android / Google Play

Parallel track to `docs/DEPLOYMENT.md` (iOS). Most steps share the Supabase backend; the differences are in the native build + Play Console submission.

> Can be completed independently of the Apple Developer account — useful while waiting on Apple access recovery (see `CREDENTIALS.md`).

---

## Prerequisites

| Item | Cost | Time |
|---|---|---|
| Google Play Developer Account | $25 one-time | ~15 min + 1–2 days verification |
| Google Cloud Console account | Free | 10 min (shared with iOS Google OAuth setup) |
| Java 17 + Android SDK | Free | 30 min (installed via Android Studio) |
| Android Studio | Free | 30 min download/install |
| A keystore for signing the AAB | Free | 5 min |

Software (macOS, Linux, or Windows):
- Node 20+
- Android Studio Hedgehog or newer
- Java 17 (bundled with Android Studio)
- Capacitor CLI (already in `frontend/`)

---

## Step 1 — Google Play Developer account

1. Go to https://play.google.com/console.
2. Pay the $25 one-time registration fee.
3. Identity verification (uploaded ID) — takes 1–2 days.
4. Choose **Organization** or **Individual**. For Beija, suggest Organization (Arborium or Beija Tecnologia Ltda).
5. Once verified, you can create the app entry.

---

## Step 2 — Create the app in Play Console

1. Play Console → **Create app**.
2. Default language: **Portuguese (Brazil)** — pt-BR.
3. App or game: **App**.
4. Free or paid: **Free**.
5. Declarations: not designed primarily for children; complies with US export laws; complies with Play Developer Program Policies.
6. Click **Create app**.

The app appears in the dashboard. **Application ID** matches the Capacitor `applicationId`: `io.beija.app`. This is permanent — you can't change it after the first AAB upload.

---

## Step 3 — Configure Google OAuth for Android

Reuse the Google Cloud project from `docs/DEPLOYMENT.md` § 2 (Google). Add an **Android OAuth client**:

1. Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID.
2. Application type: **Android**.
3. Package name: `io.beija.app`.
4. SHA-1 certificate fingerprint: required. Get the **debug** SHA-1:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
     -alias androiddebugkey -storepass android -keypass android
   ```
   Add **two** fingerprints: the debug one (for development) and the **upload key** SHA-1 (for release builds).
5. Save. No client secret is needed (Android OAuth doesn't use one).

This unblocks "Continuar com Google" on Android. The `VITE_GOOGLE_WEB_CLIENT_ID` you already configured for iOS still applies — Supabase uses the web client for token verification.

---

## Step 4 — Generate the upload keystore

Play Console enrolls your app in **Play App Signing**: Google holds the *signing key*, you keep the *upload key*. Losing the upload key is recoverable; losing the signing key would be catastrophic but it's Google's job.

Generate the upload keystore once and stash securely (1Password / Bitwarden):

```bash
mkdir -p ~/keystores
keytool -genkey -v \
  -keystore ~/keystores/beija-upload.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 25000 \
  -storepass "<strong-store-password>" \
  -keypass "<strong-key-password>" \
  -dname "CN=Beija, OU=App, O=Arborium, L=Sao Paulo, ST=SP, C=BR"
```

Verify:

```bash
keytool -list -v -keystore ~/keystores/beija-upload.jks
```

Save the SHA-1 fingerprint — Play Console + Google OAuth need it.

> 🚨 **Never commit the keystore to git**. The repo has `*.jks` patterns to be safe; if you ever see one staged, abort.

---

## Step 5 — Wire the keystore into Gradle

`frontend/android/app/build.gradle` reads the keystore from env vars:

```bash
export BEIJA_KEYSTORE_PATH=~/keystores/beija-upload.jks
export BEIJA_KEYSTORE_PASSWORD="<store-password>"
export BEIJA_KEY_ALIAS=upload
export BEIJA_KEY_PASSWORD="<key-password>"
export BEIJA_VERSION_CODE=1
export BEIJA_VERSION_NAME=1.0.0
```

Source this from a `.env.android` file kept outside the repo (`echo .env.android >> ~/.gitignore` for safety).

---

## Step 6 — Build the AAB

```bash
cd frontend
npm run build                # produces dist/
npx cap sync android         # copies the web bundle into android/app/src/main/assets/public

cd android
./gradlew bundleRelease      # outputs app/build/outputs/bundle/release/app-release.aab
```

Sanity check:

```bash
ls -lh app/build/outputs/bundle/release/app-release.aab
```

Typical size: 6–10 MB.

---

## Step 7 — Upload to Internal testing track

In Play Console:

1. **Testing → Internal testing → Create new release**.
2. **App bundles:** drag in `app-release.aab`.
3. **Release name:** auto-fills as `1 (1.0.0)`.
4. **Release notes** (per language — at least pt-BR):
   ```
   Primeira versão interna do Beija — conexões reais sem complicação.
   ```
5. Save → Review → **Rollout to internal testing**.

Add testers under **Testers**:
- Create a Google Group with the testers' Gmail/Workspace emails, OR
- Paste emails directly (max 100 per list).

Each tester opens the **opt-in URL** that Play generates (1-click) → 2h–48h until the build shows up in their Play Store app.

---

## Step 8 — Fill the rest of the listing

Most of these are required before you can promote from Internal testing to a public track:

| Section | Status reference |
|---|---|
| Main store listing (PT-BR) | `PlayStoreMetadata.md` — short description, full description |
| Graphics | `PlayStoreMetadata.md § Promotional graphics` |
| App access | `PlayStoreMetadata.md § App access` — provide demo account |
| Privacy policy URL | https://beija.app/privacy |
| Ads | No |
| Data Safety | `PlayStoreMetadata.md § Data Safety` |
| Content rating | Take the IARC questionnaire — expect Mature 17+ |
| Target audience | 18+ only |
| News apps | No |
| COVID-19 contact tracing | No |
| Government apps | No |
| Financial features | No |

When all sections show green, the app can be promoted to **Closed testing**, **Open testing**, and finally **Production**.

---

## Step 9 — Promote through testing tracks

Recommended ramp:

1. **Internal testing** (up to 100 testers, no review) — week 1
2. **Closed testing** (up to 200 testers via Google Group, automated review ~1 hour) — week 2
3. **Open testing** (any user can opt in via Play link, automated review ~1 day) — week 3-4
4. **Production** (~1–7 day review on first submission, faster on updates) — when ready

Each track expects a separate "Create release" with the same AAB (or a newer one).

---

## Step 10 — Automated releases with fastlane

`fastlane/Fastfile` has stub `android` lanes (commented). To enable:

1. Play Console → API access → link a Google Cloud project → create a **service account** with **Service Account User** + **Release Manager** roles.
2. Download the service account JSON. Save as `fastlane/play-store-key.json` (gitignored).
3. In `fastlane/Appfile`, uncomment `json_key_file` to point at it.
4. In `fastlane/Fastfile`, uncomment the android `playstore` lane.
5. Run locally:
   ```bash
   cd fastlane
   bundle exec fastlane android playstore
   ```

For CI: add the service-account JSON as `PLAY_STORE_SERVICE_ACCOUNT_JSON` secret and decode in `release-play.yml`.

---

## Step 11 — Pre-launch report (Play's automated tests)

Play runs your AAB on a battery of real devices for 15 minutes, looking for crashes, performance, accessibility, and security issues. The report appears in **Testing → Pre-launch report** ~1 hour after each upload.

Check that:
- No crashes
- All permissions are exercised cleanly
- No accessibility blockers
- No insecure SSL configurations

Fix anything red before promoting to higher tracks.

---

## Timeline estimate

- Play Console account + verification: **1–2 days**
- Steps 2–7: **1 day** focused
- Internal testing live with testers: **+ 2h to 48h** for the build to propagate
- Closed/Open testing review: **1 hour to 1 day**
- Production review (first submission): **1–7 days**

**Realistic: from zero to production-ready AAB in ~3–5 working days, plus Google's review time.**

---

## Rollback plan

- **Bad release in Internal/Closed:** create a new release with a fixed AAB; testers get it on next sync.
- **Bad release in Production:** Play Console → Releases → **Halt rollout**, then create a new release. Users who already downloaded the bad version stay on it until they update; Play won't let you "un-publish" a downloaded build.
- **Compromised keystore:** Play App Signing allows you to upload a new upload key + revoke the old one. Coordinate with Google support.

---

## Differences from iOS at a glance

| Concern | iOS | Android |
|---|---|---|
| Dev account cost | $99/year | $25 one-time |
| Identity verification | Apple ID + 2FA | Government ID upload |
| Submission format | IPA via Xcode/Transporter | AAB via Play Console / fastlane supply |
| Signing | Apple-managed via Provisioning Profiles | You-managed via upload key + Play App Signing |
| Push notifications | APNs (.p8 key) | FCM (Service Account JSON) |
| Reviewer turnaround | 1–3 days first; <24h updates | 1–7 days first; <1 day updates |
| Age rating system | Apple internal questionnaire → 17+ | IARC questionnaire → Mature 17+ |
| Privacy declarations | App Privacy "Nutrition Labels" | Data Safety form |
