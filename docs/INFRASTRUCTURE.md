# Beija — Infrastructure

Live production setup for the Beija backend, frontend, and supporting services.
For Railway deployment steps see [`../README-DEPLOY.md`](../README-DEPLOY.md).

---

## 1. Twilio WhatsApp OTP

OTPs are delivered exclusively over WhatsApp. Production currently uses the
**Twilio WhatsApp Sandbox**, which requires every recipient to opt in before
they can receive messages.

| Field                 | Value                                                    |
| --------------------- | -------------------------------------------------------- |
| Provider              | Twilio (`WHATSAPP_PROVIDER=twilio-whatsapp`)             |
| Account SID prefix    | `AC…` (full value set in Railway)                        |
| Auth token            | set in Railway (secret)                                  |
| Sandbox FROM number   | `whatsapp:+14155238886`                                  |
| Sandbox join code     | `join built-folks`                                       |

### How a new user opts into the Sandbox

Before a user can receive an OTP, they must register their phone number with
the Twilio Sandbox **once**:

1. Save `+1 415 523 8886` as a WhatsApp contact.
2. Send the message `join built-folks` to that number from WhatsApp.
3. Twilio replies with a confirmation. The number is now allow-listed for
   24 hours of inactivity, after which the user must rejoin.

Until the user does this, `POST /api/auth/request-otp` will appear to succeed
on our side but Twilio will silently drop the outbound message.

### Migration plan (before public launch)

The Sandbox is **not viable for real users** — the manual join step kills
onboarding. Pick one of:

- **Twilio Verify** — managed OTP product, pre-approved WhatsApp templates,
  no join step. Cleanest migration; same Twilio account.
- **Twilio Production WhatsApp Sender** — register a Brazilian business
  number through Twilio + Meta. Requires a Meta Business verification
  (1–2 weeks).
- **Meta WhatsApp Business Cloud API (direct)** — skip Twilio entirely.
  Cheapest at scale, more setup overhead.

Tracking item: see *Security TODO* at the bottom of this file.

---

## 2. Cloudflare R2 photo storage

Profile photos are uploaded to a Cloudflare R2 bucket so we pay zero egress
fees (Railway egress would cost ~$0.10/GB).

| Field                 | Value                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| Account ID            | `f0e6000dc3ba6b67624eac637a8d3762`                                     |
| Bucket name           | `beija-photos`                                                         |
| Location              | Eastern North America (ENAM)                                           |
| S3 API endpoint       | `https://f0e6000dc3ba6b67624eac637a8d3762.r2.cloudflarestorage.com`    |
| Public Development URL| `https://pub-91733f18126942e491edd476cc212d14.r2.dev`                  |
| API token name        | `beija-backend` (Object Read & Write on `beija-photos`)                |
| Access key ID         | set in Railway (secret)                                                |
| Secret access key     | set in Railway (secret)                                                |

### Notes on the Public Development URL

The `*.r2.dev` URL is **rate-limited by Cloudflare and not intended for
production traffic**. Cloudflare may throttle or block it under load. Before
launch we need to attach a custom domain (e.g. `cdn.beija.app`) routed to
the bucket via Cloudflare DNS + R2 Public Access. After that, set
`R2_PUBLIC_URL` to the custom domain and existing photo URLs in the DB
remain valid (the `*.r2.dev` host stays resolvable, but new uploads use the
custom domain).

### Local development fallback

If any of the `R2_*` env vars is missing, the backend falls back to writing
photos to the local `uploads/` directory (or `$DATA_DIR/uploads` on Railway
with the persistent volume). This keeps `npm run dev` working without R2
credentials.

---

## 3. Redis (Socket.io adapter)

Socket.io uses the Redis adapter so multiple backend instances can broadcast
events to clients connected to other instances. Without it, a reaction sent
by user A connected to instance 1 wouldn't reach user B on instance 2.

| Field        | Value                                          |
| ------------ | ---------------------------------------------- |
| Provider     | Railway-managed Redis                          |
| Connection   | `REDIS_URL` (set in Railway, includes password)|

Set automatically by Railway when you provision the Redis plugin. The backend
detects `REDIS_URL` at startup; if absent, Socket.io runs in-memory (fine for
a single instance).

---

## 4. Railway environment variables

All variables for the `beija-backend` service. Values marked **secret** must
only live in Railway — never commit them, never log them.

### Core

| Variable                  | Visibility | Description                                                          |
| ------------------------- | ---------- | -------------------------------------------------------------------- |
| `NODE_ENV`                | public     | `production` on Railway, `development` locally                       |
| `PORT`                    | public     | Injected by Railway; defaults to `4000` locally                      |
| `DATA_DIR`                | public     | `/app/data` (matches the Railway volume mount path)                  |
| `DATABASE_FILE`           | public     | Local-dev override when `DATA_DIR` is empty                          |
| `UPLOAD_DIR`              | public     | Local-dev override when `DATA_DIR` is empty                          |
| `PUBLIC_URL`              | public     | Backend's absolute public URL; auto-filled from `RAILWAY_PUBLIC_DOMAIN` |
| `RAILWAY_PUBLIC_DOMAIN`   | public     | Injected by Railway automatically                                    |

### Auth

| Variable             | Visibility | Description                                                          |
| -------------------- | ---------- | -------------------------------------------------------------------- |
| `JWT_SECRET`         | **secret** | 32+ byte random hex string; set in Railway                           |
| `OTP_TTL_SECONDS`    | public     | OTP code lifetime, default `300` (5 min)                             |
| `DEV_RETURN_OTP`     | public     | `true` returns OTP in the API response (for dev only); `false` in prod |

### WhatsApp (Twilio Sandbox)

| Variable             | Visibility | Description                                                          |
| -------------------- | ---------- | -------------------------------------------------------------------- |
| `WHATSAPP_PROVIDER`  | public     | `twilio-whatsapp` in production, `mock` locally                      |
| `TWILIO_ACCOUNT_SID` | public-ish | Identifier starting `AC…`; treat as low-sensitivity                  |
| `TWILIO_AUTH_TOKEN`  | **secret** | set in Railway                                                       |
| `TWILIO_FROM`        | public     | `+14155238886` (sandbox); `whatsapp:` prefix is added by the backend |

### R2 (photos)

| Variable                | Visibility | Description                                              |
| ----------------------- | ---------- | -------------------------------------------------------- |
| `R2_ACCOUNT_ID`         | public     | `f0e6000dc3ba6b67624eac637a8d3762`                       |
| `R2_BUCKET`             | public     | `beija-photos`                                           |
| `R2_PUBLIC_URL`         | public     | `https://pub-91733f18126942e491edd476cc212d14.r2.dev`    |
| `R2_ACCESS_KEY_ID`      | **secret** | set in Railway                                           |
| `R2_SECRET_ACCESS_KEY`  | **secret** | set in Railway                                           |

### Redis

| Variable     | Visibility | Description                                                           |
| ------------ | ---------- | --------------------------------------------------------------------- |
| `REDIS_URL`  | **secret** | Provisioned by the Railway Redis plugin; contains the password inline |

### CORS

| Variable        | Visibility | Description                                                                |
| --------------- | ---------- | -------------------------------------------------------------------------- |
| `FRONTEND_URL`  | public     | Public URL of the deployed frontend; auto-added to allowed origins         |
| `CORS_ORIGINS`  | public     | Comma-separated extra origins (rarely needed if `FRONTEND_URL` is set)     |

### Frontend (`beija-frontend` service)

| Variable           | Visibility | Description                                                            |
| ------------------ | ---------- | ---------------------------------------------------------------------- |
| `VITE_API_URL`     | public     | Backend public URL; baked in at build time, redeploy after changing it |
| `VITE_SOCKET_URL`  | public     | Optional override; defaults to `VITE_API_URL`                          |

---

## Local development

You do **not** need Twilio or R2 credentials to run Beija locally.

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run seed:dev   # one-time, seeds sample events
npm run dev        # http://localhost:4000

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev        # http://localhost:5173
```

The default `.env` ships with `DEV_RETURN_OTP=true`, which:

- Returns the OTP code in the `POST /api/auth/request-otp` JSON response
  (the frontend auto-fills it in dev).
- Accepts wildcard codes `000000` and `0000` in addition to the real code.
- Also accepts the universal bypass code `654321` (works in production too —
  see *Security TODO* below).
- Logs the OTP to stdout in `WHATSAPP_PROVIDER=mock` mode.

Photos written without R2 land in `./uploads` and are served by the Express
process at `/uploads/<filename>`.

---

## Security TODO (before public launch)

The following are **known security debt** from setup; address before opening
signups to real users.

1. **Rotate `JWT_SECRET`** — the current value was visible in a screenshot
   during initial setup. Generate a new one (`openssl rand -hex 32`),
   update it in Railway, and redeploy. All existing sessions invalidate.

2. **Remove the universal bypass code `654321`** in `backend/src/routes/auth.ts`.
   It was added for production smoke-testing and must come out before
   public launch.

3. **Migrate off Twilio WhatsApp Sandbox** to Twilio Verify, a production
   WhatsApp sender, or Meta WABA direct (see section 1 above). The
   "join built-folks" opt-in step is a non-starter for real onboarding.

4. **Attach a custom domain to the R2 bucket** and update `R2_PUBLIC_URL`.
   The `*.r2.dev` URL is rate-limited and not for production.

5. **Rotate any credentials that were ever pasted into chat, screenshots,
   or commits** (Twilio auth token, R2 keys) as a precaution.
---

## Status update (2026-05-27) — App Store readiness pass

The original "Security TODO" list above is now partially out of date. Current status:

1. **JWT_SECRET rotation guard — RESOLVED in code.** `backend/src/config.ts` throws on startup in production if the default secret is in use. **Owner action still required:** verify the live Railway `JWT_SECRET` value was rotated to a fresh `openssl rand -hex 32` after the original screenshot leak. The startup guard prevents accidental use of the default, but it cannot detect whether the originally-leaked production value was replaced.

2. **Universal bypass code `654321` — RESOLVED.** Removed from `backend/src/routes/auth.ts`. The only remaining bypass codes are `000000` and `0000`, and both are gated behind `config.devReturnOtp`, which is forced to `false` whenever `NODE_ENV=production`. Safe in production.

3. **Migrate off Twilio WhatsApp Sandbox — IN PROGRESS.** Twilio Verify service `VA486a0329c9217958bb1ff4918c24380e` is provisioned. Backend integration and Railway env-var swap still needed before App Review submission. See `IOS_READINESS.md` item #3 and `APP_STORE_SUBMISSION.md` section 5.

4. **Attach a custom domain to the R2 bucket — NOT STARTED.** Still on the `*.r2.dev` rate-limited URL. Owner needs to add a Cloudflare DNS record for `cdn.beija.app` and enable R2 Public Access, then update `R2_PUBLIC_URL` in Railway. See `IOS_READINESS.md` item #6.

5. **Rotate any credentials pasted in chat/screenshots/commits — OWNER ACTION.** Cannot be verified from code. Treat as a pre-submission hygiene checklist item.

---

## App Store readiness

For the iOS App Store submission gap analysis, action items, and submission pack, see:

- [`IOS_READINESS.md`](./IOS_READINESS.md) — full gap checklist with severities (BLOCKER / MAJOR / MINOR) and status tracking
- [`APP_STORE_SUBMISSION.md`](./APP_STORE_SUBMISSION.md) — App Privacy questionnaire draft, `Info.plist` usage strings (PT + EN), `PrivacyInfo.xcprivacy` template, reviewer demo account spec, marketing copy
