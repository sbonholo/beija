# Beija 💋

Event-based connection app for Brazilian nightlife — check in to a rolê,
see who else is there, send a reaction, match, chat.

## Stack

- **Backend** — Express + Socket.io + better-sqlite3 (`backend/`)
- **Frontend** — React + Vite SPA (`frontend/`)
- **Photos** — Cloudflare R2 (zero egress)
- **OTP** — WhatsApp via Twilio
- **Hosting** — Railway (backend + Redis), Railway/Vercel (frontend)

## Quick start

```bash
# Backend
cd backend && cp .env.example .env && npm install && npm run seed:dev && npm run dev

# Frontend (separate terminal)
cd frontend && cp .env.example .env && npm install && npm run dev
```

The default `.env` runs entirely on local fallbacks — no Twilio or R2
credentials needed. OTP codes are returned in the API response and logged
to stdout (`DEV_RETURN_OTP=true`).

Backend on http://localhost:4000, frontend on http://localhost:5173.

## Documentation

- [`docs/INFRASTRUCTURE.md`](./docs/INFRASTRUCTURE.md) — production
  infrastructure: Twilio WhatsApp, Cloudflare R2, Redis, Railway env vars,
  local-dev fallbacks, security TODO list.
- [`README-DEPLOY.md`](./README-DEPLOY.md) — step-by-step Railway deploy.
