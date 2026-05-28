# Railway redeploy from `main` (Supabase stack)

The new canonical `main` branch is the Supabase/Postgres app. Railway is
**no longer the primary deployment target** — Vercel hosts the SPA, and
Supabase hosts the database + edge functions.

However, the legacy Express backend (`backend/`) is still in the repo for
the migration window. If you want to keep a Railway deployment running for
backward compatibility (legacy mobile clients, or as a rollback target),
follow this guide.

## Recommended: shut down Railway

If no clients are pinned to the legacy backend, the cleanest path is:

1. Verify no one is hitting the Railway domain (`railway logs` for 7 days
   of traffic)
2. Stop the Railway service: Dashboard → Project → Settings → Danger
   Zone → Remove service
3. Keep the project + volume around for 30 days in case of rollback
4. After 30 days: delete the project entirely

If you do this, **skip the rest of this document.** The new stack is
Vercel + Supabase; see `docs/DEPLOY.md`.

## If you want Railway to keep running

The legacy backend still builds clean on the new `main` (`backend/src/`
is unchanged from the audit point). You just need to set env vars.

### Required env vars on Railway

```
# Server
PORT=4000
NODE_ENV=production

# Auth (CRITICAL — generate a new value, don't reuse staging)
JWT_SECRET=<generate with: openssl rand -base64 64>
OTP_TTL_SECONDS=300
DEV_RETURN_OTP=false                     # MUST be false in production

# Persistence
DATA_DIR=/app/data                       # matches the Railway volume mountPath

# Public origin (auto-filled from RAILWAY_PUBLIC_DOMAIN if unset)
PUBLIC_URL=https://api.beija.app         # or whatever the public domain is

# CORS
FRONTEND_URL=https://beija.app           # the Vercel deploy URL
CORS_ORIGINS=https://beija.app,capacitor://localhost,https://localhost

# SMS provider
SMS_PROVIDER=twilio-whatsapp             # or zenvia-whatsapp, or mock for dev
TWILIO_ACCOUNT_SID=<from Twilio console>
TWILIO_AUTH_TOKEN=<from Twilio console>
TWILIO_FROM=whatsapp:+14155238886        # or your verified WhatsApp sender

# Optional: alternative SMS via Zenvia
# ZENVIA_TOKEN=
# ZENVIA_FROM=

# Photo storage — Cloudflare R2 (legacy backend uses R2; new stack uses Supabase Storage)
R2_ACCOUNT_ID=<from Cloudflare dashboard>
R2_BUCKET=beija-photos
R2_PUBLIC_URL=https://pub-XXXX.r2.dev    # or your CDN-fronted custom domain
R2_ACCESS_KEY_ID=<from R2 API Tokens>
R2_SECRET_ACCESS_KEY=<from R2 API Tokens>

# Redis (only needed if running >1 backend instance with Socket.io)
# REDIS_URL=redis://default:password@host:port

# Smart event sync (optional — leave unset to disable external events sync)
# TICKETMASTER_API_KEY=
# EVENTBRITE_TOKEN=
# SYNC_LAT=-23.5505                      # São Paulo center
# SYNC_LNG=-46.6333
# SYNC_RADIUS_KM=100
# DISABLE_EVENT_SYNC=false

# Admin bootstrap — comma-separated E.164 phone numbers granted is_admin=1
# Example: ADMIN_PHONES=+5511987654321,+18329281897
# ADMIN_PHONES=
```

### Critical security env vars (must rotate before relaunch)

These were in the previous Railway deployment and **must be rotated** if
this is going to be exposed to traffic again:

- `JWT_SECRET` — generate fresh value (used to sign all session tokens)
- `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` — rotate in Cloudflare R2
- `TWILIO_AUTH_TOKEN` — rotate in Twilio console
- `ADMIN_PHONES` — verify list is current

### Deploy steps

```bash
# 1) Trigger a manual deploy from main
railway up

# OR connect the GitHub repo to Railway and let it auto-deploy on push to main
# Dashboard → Project → Settings → Service → Source → GitHub
```

The Railway service points at `backend/`. The `railway.toml` and
`Dockerfile` in that folder describe how to build + start the service.

### Verifying the deploy

```bash
curl https://<your-railway-domain>/health
# expected: {"ok":true}

curl -X POST https://<your-railway-domain>/api/auth/request-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"+5511999999999"}'
# expected: {"ok":true,"phone":"+5511999999999"}
# (no devCode field — DEV_RETURN_OTP must be false in prod)
```

## What to add in Railway dashboard (checklist)

When you open Railway dashboard → Project → Variables, paste these one
per line. Items marked **REQUIRED** must have real values; **OPTIONAL**
can stay commented out.

```
REQUIRED:
  PORT=4000
  NODE_ENV=production
  JWT_SECRET=<fresh openssl rand -base64 64>
  OTP_TTL_SECONDS=300
  DEV_RETURN_OTP=false
  DATA_DIR=/app/data
  FRONTEND_URL=<your Vercel URL>
  CORS_ORIGINS=<Vercel URL>,capacitor://localhost
  SMS_PROVIDER=twilio-whatsapp
  TWILIO_ACCOUNT_SID=<from Twilio>
  TWILIO_AUTH_TOKEN=<from Twilio — rotate from staging>
  TWILIO_FROM=whatsapp:+<your verified number>
  R2_ACCOUNT_ID=<from Cloudflare>
  R2_BUCKET=beija-photos
  R2_PUBLIC_URL=<your R2 public URL>
  R2_ACCESS_KEY_ID=<from R2 — rotate from staging>
  R2_SECRET_ACCESS_KEY=<from R2 — rotate from staging>

OPTIONAL (only set if used):
  REDIS_URL=<if running >1 instance>
  TICKETMASTER_API_KEY=<for external event sync>
  EVENTBRITE_TOKEN=<for external event sync>
  ADMIN_PHONES=<comma-separated E.164 list>
```

## Note: the new Supabase backend doesn't use Railway

The Supabase architecture is server-less. There are no env vars to set on
Railway for it. Instead:

- **Frontend env vars** → Vercel dashboard (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, etc.). See `frontend/.env.example`.
- **Edge function secrets** → set via `supabase secrets set KEY=VALUE`.
  See the bottom of `frontend/.env.example` for the full list (APNs,
  FCM, Sightengine, OpenAI, Sentry edge DSN).
- **Database connection** → Supabase manages it; no env var needed.

If you ditch Railway entirely (recommended at 10K users), the only
infrastructure to provision is:

1. Supabase Pro project ($25/mo)
2. Vercel Hobby/Pro ($0–20/mo)
3. Twilio WhatsApp for OTP (if keeping phone auth) — but the new stack
   uses Apple/Google sign-in instead, so this may not be needed
