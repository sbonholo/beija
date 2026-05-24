# Beija — Credentials & External Accounts

Single source of truth for **who owns which external service** for the Beija app. This is not a secret store (no keys / passwords here). Use this to know which account to log into, who to ask, and what state each provider is in.

> ⚠️ Never paste secrets here. Use the deployment platform's secret manager (GitHub Actions secrets, Supabase env vars, etc).

Last updated: 2026-05-24

---

## Apple Developer Program

| Field | Value |
|---|---|
| **Status** | ✅ Account provisioned — ⛔ access temporarily unavailable |
| **Login email** | `info@arborium.app` |
| **Entity** | Arborium (parent / holding) |
| **Bundle ID for Beija** | `io.beija.app` |
| **Annual fee** | Paid via the Arborium account |
| **Next action** | Recover access (password reset + 2FA recovery via Apple ID account recovery) |

Once access is restored, see `docs/DEPLOYMENT.md` § 2 (Apple) + § 5 (Xcode capabilities) + § 6 (APNs key) for the configuration steps.

---

## Google Cloud Console

| Field | Value |
|---|---|
| **Status** | ❌ not created yet |
| **Login email** | TBD — should match Apple owner or use a dedicated `dev@arborium.app` |
| **Project name (suggested)** | `beija-prod` |
| **OAuth clients needed** | iOS (bundle `io.beija.app`) + Web (Supabase callback) |

Step-by-step in `docs/DEPLOYMENT.md` § 2 (Google).

---

## Supabase

| Field | Value |
|---|---|
| **Status** | ❌ not created yet |
| **Login email** | TBD |
| **Project ref** | TBD |
| **Region** | `sa-east-1` (São Paulo) — recommended for BR latency |
| **Plan** | Free tier OK for early TestFlight; bump to Pro before public launch |

Step-by-step in `docs/DEPLOYMENT.md` § 1.

---

## Domain

| Field | Value |
|---|---|
| **Domain** | `beija.app` (not registered yet) |
| **Registrar (suggested)** | Namecheap, Cloudflare, or Registro.br for `.com.br` if preferred |
| **Status** | ❌ not registered |
| **Required for** | Privacy / Terms hosting, App Store listing URLs (support, marketing, privacy), email aliases |

Until registered, App Store metadata can use temporary placeholders, but they must be live by the final submission.

---

## Email aliases

These are referenced in `PrivacyPolicy.md`, `TermsOfService.md`, and `AppStoreMetadata.md`. Need to be configured (Google Workspace or simple forwards):

| Address | Used for | Status |
|---|---|---|
| `support@beija.app` | App Store support URL, user-facing support | ❌ not configured |
| `privacy@beija.app` | DPO / privacy contact (LGPD) | ❌ not configured |
| `legal@beija.app` | Terms / legal disputes | ❌ not configured |
| `security@beija.app` | Security vulnerabilities | ❌ not configured |
| `review@beija.app` | App Store reviewer demo account | ❌ not configured |

---

## Push Notifications

| Provider | Status | Notes |
|---|---|---|
| **APNs** (iOS) | ❌ key not generated yet | Generate from Apple Developer after access recovery |
| **FCM** (Android) | ❌ Firebase project not created | Optional for v1 if shipping iOS-only first |

---

## CI / Deployment

| Service | Status | Notes |
|---|---|---|
| **GitHub** repo `sbonholo/beija` | ✅ live | Branch protection rules: TBD |
| **GitHub Actions** | ✅ `ci.yml` runs on PR / push | `release-testflight.yml` is skeleton |
| **App Store Connect API Key** (`.p8`) | ❌ not generated | Required for fastlane CI uploads |
| **fastlane match repo** (optional) | ❌ | Alternative: manual signing in Xcode |

---

## Recovery checklist (Apple Developer)

When you regain access to `info@arborium.app`:

1. ✅ Verify two-factor auth still works on the trusted device.
2. ✅ Visit https://developer.apple.com → confirm enrollment is active and not expired.
3. ✅ Note the **Team ID** (10-character) and the **Apple ID** that owns the team — needed for `fastlane/Appfile` and Xcode signing.
4. ✅ App Identifiers → confirm or create `io.beija.app` with capabilities: Sign in with Apple, Push Notifications, Location.
5. ✅ Identifiers → Services IDs → create `io.beija.app.signin` for Sign in with Apple web flow.
6. ✅ Keys → generate APNs Key (.p8) + Sign in with Apple Key (.p8). Download both.
7. ✅ App Store Connect → My Apps → create new app `Beija`, bundle `io.beija.app`, primary language `Portuguese (Brazil)`.

After that, follow `docs/DEPLOYMENT.md` from § 2 onward.

---

## Why this doc exists

- **Audit trail:** when a service is set up, who has the credentials.
- **Onboarding:** a new collaborator can read this and know what to ask for.
- **Recovery:** if anyone loses access, this lists what to recover and where.

Update this file whenever an external account is created, transferred, or has access changed.
