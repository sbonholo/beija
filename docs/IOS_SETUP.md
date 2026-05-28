# iOS Build Setup (Capacitor)

This guide picks up where the in-repo Capacitor scaffold leaves off. The web
side is configured (Capacitor packages, `capacitor.config.ts`, platform
wrappers for geolocation/haptics/status bar/splash). The remaining steps must
be run on a **Mac with Xcode 15+** because Capacitor's `add ios` command
requires CocoaPods and the iOS SDK.

## Prerequisites on Mac

```bash
# Xcode 15 or newer from the App Store
xcode-select --install
sudo gem install cocoapods   # or: brew install cocoapods
```

Apple Developer Program enrollment ($99/yr) is required before TestFlight or
App Store submission — you can scaffold the project without it.

## One-time iOS scaffold

```bash
cd frontend
npm install                  # installs Capacitor (already in package.json)
npm run build                # produces dist/
npx cap add ios              # creates frontend/ios/ — generates Xcode project
npx cap sync ios             # copies dist/ into the native bundle + installs pods
```

After `cap add ios`, commit the entire `frontend/ios/` folder. Capacitor
projects keep the native shell in source control.

## Subsequent builds

```bash
# After any web code change:
npm run ios:build            # builds web + syncs to iOS
npm run cap:open:ios         # opens the project in Xcode

# In Xcode:
# 1. Select your Apple Developer team under Signing & Capabilities
# 2. Pick a device (or simulator)
# 3. Cmd+R to run, or Product > Archive to ship to TestFlight
```

## API URL — critical

In a native iOS build the app loads from `capacitor://localhost`. Relative API
paths will not reach the backend. Build with an absolute URL:

```bash
VITE_API_URL=https://your-prod-backend.up.railway.app npm run ios:build
```

The backend CORS allowlist must include `capacitor://localhost` for native
builds. Add it to `CORS_ORIGINS` env var on Railway:

```
CORS_ORIGINS=https://your-frontend.com,capacitor://localhost
```

## What's still missing (next commits will add)

- `Info.plist` usage strings for camera, location, photo library
- `PrivacyInfo.xcprivacy` manifest (required by iOS 17+)
- App icon set (1024×1024 source + asset catalog)
- Launch screen storyboard
- Sign in with Apple capability + backend route
- Push notification capability + APNs backend
- Universal Links + Associated Domains entitlement
- Age gate hardening
