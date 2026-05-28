# Beija — App Store Submission Pack

Single source of truth for the App Store Connect submission: reviewer demo account, App Privacy questionnaire draft, `Info.plist` usage strings (PT and EN), marketing copy drafts, and the support/marketing URLs.

Cross-references:
- `IOS_READINESS.md` — full gap checklist with severities and status
- `INFRASTRUCTURE.md` — backend infrastructure (Twilio, R2, Redis)

Last updated: 2026-05-27.

---

## 1. App Store Connect record (to be created)

| Field | Value |
| --------------- | --------------------------------------------------------- |
| App name | Beija |
| Subtitle | Conexões no rolê |
| Bundle ID | `app.beija.ios` |
| SKU | beija-ios-001 |
| Primary category| Social Networking |
| Secondary | Lifestyle |
| Age rating | 17+ (unrestricted web access, social networking, location)|
| Pricing | Free |
| Availability | Brazil first; expand later |

### Required URLs (owner to host on `beija.app`)
- Support URL: https://beija.app/support
- Marketing URL: https://beija.app
- Privacy Policy URL: https://beija.app/privacy (already live)
- Terms of Service URL: https://beija.app/terms (already live)
- EULA: standard Apple EULA, unless we host a custom one

---

## 2. App Privacy questionnaire (draft answers)

Apple's App Privacy section. All answers reflect the current implementation.

### Data linked to user

| Data type | Collected | Purpose | Linked to identity | Tracking |
| ----------------- | --------- | ----------------------------- | ------------------ | -------- |
| Phone number | Yes | Authentication (OTP) | Yes | No |
| Photos | Yes | Profile picture (R2) | Yes | No |
| Coarse location | Yes | Event discovery, density rooms| Yes | No |
| User-generated content (bio, nickname, chat) | Yes | App functionality | Yes | No |
| Device ID | No | — | — | — |
| Contacts | No | — | — | — |
| Browsing history | No | — | — | — |
| Search history | No | — | — | — |
| Health & fitness | No | — | — | — |
| Financial info | No | — | — | — |
| Sensitive info | No | — | — | — |
| Other usage data | Yes (`last_active` timestamp) | Engagement metrics | Yes | No |

**Third parties that receive data:**
- Twilio (phone number — OTP delivery via WhatsApp)
- Cloudflare R2 (profile photos — storage)
- Ticketmaster / Eventbrite (no user data sent; we only read events)

**Tracking:** None. We do not use IDFA, do not share data with data brokers, do not run cross-app/site analytics.

---

## 3. Info.plist usage strings

### Portuguese (`Localizable.strings` pt-BR fallback inline)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>O Beija usa sua localização para mostrar rolês perto de você e te conectar com quem está no mesmo lugar.</string>

<key>NSCameraUsageDescription</key>
<string>O Beija acessa sua câmera para você tirar uma foto de perfil.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>O Beija acessa sua galeria para você escolher uma foto de perfil.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>O Beija salva fotos na sua galeria apenas se você pedir.</string>
```

### English (for non-pt locales)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Beija uses your location to show events near you and connect you with people at the same venue.</string>

<key>NSCameraUsageDescription</key>
<string>Beija uses your camera so you can take a profile photo.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Beija accesses your photo library so you can choose a profile photo.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Beija saves photos to your library only when you ask.</string>
```

### Critical reviewer-facing notes
- Strings must be specific, user-facing, and explain *why* the data is needed. Generic strings like "needed for the app to work" get rejected.
- Background location is **not** requested. The density-room ping runs only while the app is foregrounded. If we later add background location, we must add `NSLocationAlwaysAndWhenInUseUsageDescription` and justify it heavily in App Review notes.

---

## 4. PrivacyInfo.xcprivacy manifest

Mandatory since May 2024. Lives at `frontend/ios/App/App/PrivacyInfo.xcprivacy`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhoneNumber</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeCoarseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserContent</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

---

## 5. Reviewer demo account spec

App Review needs a working credential that bypasses the WhatsApp Sandbox opt-in. Two options:

### Option A — Twilio Verify production (preferred)
Once Twilio Verify is in production, provision a test phone number (Brazilian DDI for realism) and pre-allowlist it. Provide:
- Phone: `+55 11 9XXXX-XXXX` (real Twilio-controlled number we own)
- The reviewer requests an OTP and receives it via WhatsApp Verify — no join step needed.
- Provide screenshots in App Review notes showing where to tap.

### Option B — Reviewer feature flag (fallback)
Add a server-side allowlist of phone numbers that skip OTP entirely and return a fixed test token. Gate by both env-var and per-number allowlist:

```ts
// backend/src/routes/auth.ts (sketch)
const REVIEWER_PHONES = (process.env.APPLE_REVIEWER_PHONES || '').split(',').filter(Boolean);
if (REVIEWER_PHONES.includes(phone)) {
  // skip OTP, mint token directly
}
```

**Security:** the env var ships empty by default; set it only for the App Review submission window. Remove after each review cycle.

### App Review notes (Portuguese for clarity, English for reviewers)
> Test account: +55 11 9XXXX-XXXX. Tap "Receber código no WhatsApp" — the OTP arrives automatically via Twilio Verify, no opt-in needed. After verifying, you'll land on the profile creation screen. Pick any nickname and gender. To test location features, allow "While Using the App". To test reactions, tap any event card to enter the room. To test matching, tap a person card and send any reaction; the test peer "Reviewer Bot" is pre-configured to reciprocate within 30 seconds. Account deletion: Profile → "Apagar perfil" → confirm.

---

## 6. Marketing copy

### App Store title (≤30 chars)
> Beija — Conexões no rolê (24 chars)

### Subtitle (≤30 chars)
> Conheça gente no mesmo lugar (28 chars)

### Promotional text (≤170 chars, updatable without re-review)
> Beija conecta você com quem está no mesmo rolê agora. Faça check-in num show, festa ou bar — veja quem tá ali, manda um beijo, e role o papo. 🔥

### Description (Portuguese — primary market)
> O Beija é o jeito mais simples de conhecer alguém num rolê: você faz check-in no evento (festa, show, bar, balada), vê quem mais está ali agora, manda um beijo, fogo ou coração, e se rolar match, a conversa começa.
>
> **Como funciona:**
> - Entre no app e veja os rolês perto de você.
> - Faça check-in num evento — só quem está no mesmo lugar consegue te ver.
> - Reaja com 💋, ❤️ ou 🔥 a quem te interessar.
> - Match? Bora conversar.
>
> **Por que é diferente:**
> - Conexões reais, no presente. Sem swipe infinito de gente longe de você.
> - Foco no momento: só quem está no rolê aparece.
> - Privado: ninguém te vê fora dos eventos onde você fez check-in.
>
> Beija é para maiores de 18 anos. Tolerância zero a abuso — bloqueio, denúncia e moderação em todos os perfis.

### Keywords (≤100 chars, comma-separated)
> conexão, rolê, evento, festa, show, balada, conhecer, pessoas, brasil, beijar, match, namoro, social

### What's New (≤4000 chars)
> Versão 1.0 — primeira versão do Beija na App Store! Descubra rolês perto de você, mande beijos, e conheça gente no mesmo lugar. 🔥

---

## 7. Screenshots required

iPhone 6.7" (1290×2796) and 6.5" (1284×2778). Five screenshots each, captured on a real device or simulator:

1. **Login** — flame+heart logo, "Conexões no rolê" tagline
2. **Events list** — adaptive-radius header, two real events visible
3. **Event room** — people grid with reactions overlaid
4. **Match toast** — "Match com Ana ✨" celebratory state
5. **Profile** — your card with bio, identity, seeking chips

iPad screenshots: not required if we declare iPhone-only.

---

## 8. Pre-submission checklist (final pass)

- [ ] All BLOCKERS in `IOS_READINESS.md` resolved
- [ ] TestFlight build runs cleanly on 3 real iPhones (different iOS versions)
- [ ] OTP flow completes end-to-end without WhatsApp Sandbox opt-in
- [ ] Photo upload completes against R2 custom domain (not `*.r2.dev`)
- [ ] Location permission prompt fires with the explainer screen before
- [ ] Block flow tested: blocked user cannot see or be seen
- [ ] Report flow tested: report lands in Admin dashboard
- [ ] Delete account tested: confirm all data cascades (DB + R2)
- [ ] Demo account credentials work on a clean install
- [ ] App Review notes drafted and uploaded
- [ ] App Privacy questionnaire submitted
- [ ] Screenshots uploaded for both required device sizes
- [ ] Age rating set to 17+
- [ ] Export compliance: standard HTTPS only (no proprietary crypto), select "Uses encryption: Yes, but exempt"
