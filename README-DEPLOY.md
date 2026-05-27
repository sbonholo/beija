# Deploy Beija to Railway

Beija ships as two Railway services in the same project:

- **`beija-backend`** — Express + Socket.io + SQLite API (rooted at `backend/`).
- **`beija-frontend`** — Vite-built React SPA served by `serve` (rooted at `frontend/`).

The backend persists SQLite to a Railway volume. Photos are stored on **Cloudflare R2**
(zero-egress CDN) when configured, or fall back to the Railway volume for local dev.

## One-time setup

1. **Push the repo to GitHub** (or fork this one). You need both `backend/` and
   `frontend/` on the deploy branch, plus this file and `railway.json`.

2. **Create a new Railway project** at <https://railway.app/new> → *Deploy from
   GitHub repo* → pick the repository.

3. Railway will detect `railway.json` and offer the two services. If it doesn't,
   add them by hand (next two sections).

## Backend service (`beija-backend`)

- **Source**: this repo, **root directory** = `backend`
- **Builder**: Nixpacks (auto-detected via `backend/nixpacks.toml`)
- **Start command**: `npm run seed && npm start`
  - This compiles to `dist/`, runs `node dist/seed.js` to insert the sample
    Brazilian events on first boot, then runs `node dist/index.js`.
- **Volume**: mount path `/app/data` (declared in `backend/railway.toml`). This
  is where `beija.db` and `uploads/` live.

### Environment variables

| Variable                | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| `JWT_SECRET`            | long random string — generate with `openssl rand -hex 32`                |
| `NODE_ENV`              | `production`                                                             |
| `DATA_DIR`              | `/app/data` (matches the mounted volume)                                 |
| `FRONTEND_URL`          | the public URL of the frontend service (fill in after step 4)            |
| `DEV_RETURN_OTP`        | `false` for production                                                   |
| `WHATSAPP_PROVIDER`     | `mock` \| `twilio-whatsapp` \| `zenvia-whatsapp`                         |

#### Cloudflare R2 (photos — strongly recommended for production)

Create a bucket in Cloudflare R2, enable public access (or add a custom domain),
then set all five variables below. If any is missing the app falls back to local disk.

| Variable              | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| `R2_ACCOUNT_ID`       | your Cloudflare account ID                             |
| `R2_ACCESS_KEY_ID`    | R2 API token → *Access Key ID*                         |
| `R2_SECRET_ACCESS_KEY`| R2 API token → *Secret Access Key*                     |
| `R2_BUCKET`           | bucket name (e.g. `beija-photos`)                      |
| `R2_PUBLIC_URL`       | public base URL (e.g. `https://pub-xxx.r2.dev`)        |

#### Twilio WhatsApp

Set `WHATSAPP_PROVIDER=twilio-whatsapp`.

| Variable             | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| `TWILIO_ACCOUNT_SID` | from Twilio Console                                       |
| `TWILIO_AUTH_TOKEN`  | from Twilio Console                                       |
| `TWILIO_FROM`        | your WhatsApp-enabled number (e.g. `+14155238886`) — no `whatsapp:` prefix |

#### Zenvia WhatsApp (Brazilian provider — cheaper alternative to Twilio)

Set `WHATSAPP_PROVIDER=zenvia-whatsapp`.

| Variable       | Value                              |
| -------------- | ---------------------------------- |
| `ZENVIA_TOKEN` | API token from Zenvia dashboard    |
| `ZENVIA_FROM`  | WhatsApp sender ID / number        |

`PORT` and `RAILWAY_PUBLIC_DOMAIN` are injected by Railway automatically — the
backend reads `RAILWAY_PUBLIC_DOMAIN` to build absolute upload URLs.

After this service deploys, **copy its public URL** (e.g.
`https://beija-backend-production.up.railway.app`) — you'll plug it into the
frontend below.

## Frontend service (`beija-frontend`)

- **Source**: same repo, **root directory** = `frontend`
- **Builder**: Nixpacks (auto-detected via `frontend/nixpacks.toml`)
- **Start command**: `npx serve -s dist -l $PORT` (set automatically by
  `frontend/railway.toml`)

### Environment variables

| Variable        | Value                                                |
| --------------- | ---------------------------------------------------- |
| `VITE_API_URL`  | the backend public URL from the step above           |

Vite envs are baked in at build time, so **every time you change `VITE_API_URL`
you need to redeploy the frontend** (Railway → *Deployments* → *Redeploy*).

## Finishing the loop

1. Backend deploys → grab its public URL.
2. Frontend service → set `VITE_API_URL` to that backend URL → redeploy.
3. Backend service → set `FRONTEND_URL` to the frontend public URL → restart
   (this lets the backend allow CORS / Socket.io from the right origin).
4. Open the frontend URL on your phone, send yourself an OTP, check into an
   event, and start beijando.

## Local development

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env
npm install
npm run seed:dev        # one-time: insert sample events
npm run dev             # http://localhost:4000

# Terminal 2 — frontend
cd frontend
cp .env.example .env    # leave VITE_API_URL empty to use the Vite proxy
npm install
npm run dev             # http://localhost:5173
```

In dev mode the backend accepts the wildcard OTP `000000` for any phone number,
so you don't need a real SMS provider to iterate.
