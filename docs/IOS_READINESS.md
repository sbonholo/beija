# Beija — iOS App Store Readiness

Living checklist tracking gaps between the current web MVP and an iOS App Store submission. Severities: **BLOCKER** (Apple will reject), **MAJOR** (high risk), **MINOR** (polish).

Last updated: 2026-05-27.

---

## Status legend

- [ ] Not started
- [~] In progress
- [x] Done

---

## BLOCKERS

- [ ] **1. Native iOS shell (Capacitor).** Frontend is a pure Vite SPA today. Wrap in Capacitor (`@capacitor/core`, `@capacitor/ios`, plus geolocation/camera/push/haptics plugins). Bundle ID `app.beija.ios`, deployment target iOS 15.0, display name "Beija". Scaffold lives in `frontend/capacitor.config.ts` + `frontend/ios/` after `npx cap add ios` runs on a Mac. See `APP_STORE_SUBMISSION.md` for the full submission checklist.
- [x] **2. Remove hardcoded universal OTP bypass `654321`.** Verified removed from `backend/src/routes/auth.ts`. Only remaining bypass is `000000`/`0000`, gated behind `config.devReturnOtp` which is `false` in production. `INFRASTRUCTURE.md` "Security TODO #2" is stale and will be updated.
- [ ] **3. WhatsApp Sandbox onboarding incompatible with App Review.** Reviewers will not complete the `join built-folks` opt-in step. Must migrate to Twilio Verify production (already started — see Twilio Verify service `VA486a0329c9217958bb1ff4918c24380e`) or a real WhatsApp Business sender. Demo account must not require the join step.
- [ ] **4. Sign in with Apple (conditional on Guideline 4.8).** WhatsApp OTP as sole auth method is likely fine, but Apple sometimes treats WhatsApp (Meta) as third-party SSO and asks for parity. Be ready to add Sign in with Apple if requested; consider pre-empting.
- [ ] **5. iOS privacy declarations.** Required at runtime in `Info.plist`: `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`. Plus `PrivacyInfo.xcprivacy` manifest (mandatory since May 2024) declaring data collection categories and tracking domains. Both files to be created under `frontend/ios/App/App/` once Capacitor scaffolds.
- [ ] **6. R2 custom domain.** Production uses the rate-limited `*.r2.dev` dev URL. Attach `cdn.beija.app` to the R2 bucket via Cloudflare DNS + Public Access, then set `R2_PUBLIC_URL` accordingly in Railway. Existing photo URLs in DB remain valid.

---

## MAJOR

- [x] **7. JWT_SECRET rotation guard.** `backend/src/config.ts` throws on startup in production if the default secret is used. **Action item for owner:** verify the live Railway secret was rotated to a fresh value (`openssl rand -hex 32`) after the original leak referenced in `INFRASTRUCTURE.md` Security TODO #1.
- [ ] **8. Content moderation pipeline.** No automated NSFW/abuse moderation on photo upload (R2) or text fields (bio, nickname, chat). Apple Guideline 1.2 expects proactive moderation for social-discovery apps. Recommend: Sightengine or AWS Rekognition on photo upload, OpenAI moderation API on text fields.
- [ ] **9. App Review demo account.** Provide a working test phone+OTP path that does not require the WhatsApp Sandbox opt-in. Either a real Twilio Verify–enabled number we control, or a reviewer-only login feature flag.
- [ ] **10. Location pre-prompt UX.** Events page auto-reports GPS on load. iOS requires an in-app explainer screen before the system permission prompt fires, plus a graceful denied state.
- [ ] **11. Background location confirmation.** The 5-minute density-room ping must only run when the app is foregrounded. If it runs in background, `UIBackgroundModes: [location]` is required and Apple scrutinizes this heavily.
- [ ] **12. Account deletion cascade verification.** `Profile.tsx` calls `activeApi.deleteMe()`. Confirm the backend cascade deletes user record, R2 photos, reactions, matches, messages, blocks, reports, and audit logs (Guideline 5.1.1(v)). Also expose a web-accessible deletion path (best practice).
- [ ] **13. Ticketmaster + Eventbrite TOS compliance.** Add visible "Powered by Ticketmaster / Eventbrite" attribution wherever their events appear. Confirm caching and redistribution limits comply with each provider's developer terms.
- [ ] **14. App Store Connect record.** Create bundle ID, app entry, screenshots (6.7" + 6.5"), age rating (17+ expected), App Privacy questionnaire, support URL, marketing URL.
- [ ] **15. Push notifications via APNs.** Socket.io covers in-app real-time; APNs needed for closed-app match/message notifications. Capacitor `@capacitor/push-notifications` plugin + APNs key in Apple Developer + backend integration.
- [ ] **16. Automated test coverage.** No test framework in either `package.json`. Recommend Vitest + a smoke test on the OTP flow, delete-account flow, block/report flow.

---

## MINOR

- [ ] **17. Accessibility audit.** WCAG AA contrast check on the new neon palette; VoiceOver labels on key actions.
- [ ] **18. iOS icon set from FlameHeartLogo.tsx.** Generate 1024 marketing + adaptive set, opaque background (Apple rejects transparency).
- [ ] **19. Launch screen / splash.**
- [ ] **20. Marketing copy.** App Store title (≤30), subtitle (≤30), description, keywords, "What's New". Draft in `APP_STORE_SUBMISSION.md`.
- [ ] **21. Mock-mode banner guard.** Verify iOS production build never ships with `isMockMode = true`.

---

## Owner-only actions (cannot be automated)

1. Enroll in Apple Developer Program ($99/year).
2. Reserve bundle ID `app.beija.ios` in the Apple Developer portal.
3. Generate signing certificates and provisioning profiles.
4. Create App Store Connect record.
5. Complete App Privacy questionnaire (draft answers in `APP_STORE_SUBMISSION.md`).
6. Complete W-8BEN tax forms.
7. Run `npx cap add ios && npx cap sync ios` on a Mac, commit the generated `ios/App/App.xcodeproj` + `Podfile`.
8. Upload build via Xcode (or EAS/Codemagic CI using your Apple credentials).
9. Set up TestFlight, invite internal testers.
10. Verify Railway `JWT_SECRET` was rotated after the leak referenced in `INFRASTRUCTURE.md`.

---

## References

- `APP_STORE_SUBMISSION.md` — reviewer demo account spec, privacy questionnaire draft answers, `Info.plist` usage-string copy in PT and EN.
- `INFRASTRUCTURE.md` — Twilio, R2, Redis, Railway env vars.
- `README-DEPLOY.md` — Railway deploy steps.
