# Observability — Sentry + PostHog (FASE P2)

Pipeline de observability pré-launch: **Sentry** captura erros + replays,
**PostHog** mede o funil (`abrir app → swipe → match → mensagem`).

Os SDKs são fail-safe: sem keys, tudo é no-op. Dev rola normalmente.

## Arquitetura

```
                       ┌────────────────────────────────┐
   Frontend            │ src/lib/sentry.ts (init)       │  → Sentry SaaS
   (React + Vite)      │ src/lib/analytics.ts (PostHog) │  → PostHog SaaS / self-host
                       │ src/lib/vitals.ts (web-vitals) │  → PostHog (event: web_vital)
                       └────────────────────────────────┘
                              ▲                                      ▲
                              │                                      │
                       VITE_SENTRY_DSN               VITE_POSTHOG_KEY + HOST

   Edge functions      ┌────────────────────────────────┐
   (Deno)              │ supabase/functions/_shared/    │ → Sentry SaaS
                       │   sentry.ts → withSentry()     │
                       └────────────────────────────────┘
                              ▲
                              │
                       SENTRY_DSN_EDGE
```

## Setup

### 1. Sentry

1. Crie projeto em https://sentry.io → React (browser).
2. Pegue o DSN em **Settings → Client Keys**.
3. Adicione em `frontend/.env.local`:
   ```bash
   VITE_SENTRY_DSN=https://<key>@sentry.io/<project>
   ```
4. Build/run normalmente — Sentry liga só quando o DSN está setado.

Para edge functions:
```bash
supabase secrets set SENTRY_DSN_EDGE=https://<key>@sentry.io/<project>
supabase functions deploy --no-verify-jwt
```

### 2. PostHog

1. Crie projeto em https://eu.posthog.com (host EU — LGPD-friendly).
2. Pegue a key em **Project Settings → Project API Key**.
3. Adicione em `frontend/.env.local`:
   ```bash
   VITE_POSTHOG_KEY=phc_xxxxxxxxxx
   VITE_POSTHOG_HOST=https://eu.posthog.com
   ```

## Eventos do funil

Disparados em `track()` no frontend. Veja `src/lib/analytics.ts` pra
implementação e `src/lib/vitals.ts` pra performance.

| Evento | Disparado em | Props |
|---|---|---|
| `app_opened` | `main.tsx` boot | — |
| `signup_started` | SignInScreen — clique provider | `provider: apple\|google` |
| `signup_completed` | OnboardingFlow — submit final | — |
| `onboarding_step_completed` | OnboardingFlow auto-advance | `step: identity\|preferences` |
| `profile_setup_completed` | OnboardingFlow final | — |
| `first_card_viewed` | StackDeck deck enche 1ª vez | — |
| `swipe_left` / `swipe_right` / `swipe_super` | StackDeck handleSwipe | `card_index` |
| `rewind_used` | StackDeck handleRewind | `remaining` |
| `match_created` | StackDeck — match modal mostrado | `direction` |
| `message_sent` | ChatScreen.send | `length_bucket: short\|medium\|long` |
| `photo_upload_attempted` | storage.uploadProfilePhoto | `slot` |
| `photo_upload_blocked` | ModerationError thrown | `slot, reasons[]` |
| `photo_upload_success` | storage upload OK | `slot` |
| `settings_opened` | SettingsScreen mount | — |
| `settings_changed` | SettingsScreen toggle | `setting_name, value` |
| `profile_detail_opened` | ProfileDetailModal mount | `source: direct_url` |
| `likes_you_viewed` | StackDeck → /likes-you | `source: discover_chip\|empty_deck_cta` |
| `app_error` | ErrorBoundary catch | `error_boundary: true, message, name` |
| `web_vital` | web-vitals callbacks | `name: LCP\|INP\|CLS\|FCP\|TTFB, value, rating, delta, nav_type` |

## Funnel principal

Configure em PostHog → **Insights → New funnel** com a sequência:

1. `app_opened`
2. `signup_started`
3. `signup_completed`
4. `first_card_viewed`
5. `swipe_right`
6. `match_created`
7. `message_sent`

Gap percentual entre cada etapa = oportunidade de reduzir cliques.

## Sample rates

- `tracesSampleRate: 0.2` — 20% das transações vão pro Sentry (perf).
- `replaysSessionSampleRate: 0.1` — 10% das sessões gravam replay.
- `replaysOnErrorSampleRate: 1.0` — 100% das sessões COM erro gravam.

Replay mascara **todo texto e inputs** + bloqueia mídias (LGPD).

## LGPD / GDPR

- **Consent**: `profiles.allow_analytics` (migration
  `20260525100000_analytics_opt_out.sql`). Default `true` (consent implícito
  via TOS), com toggle "Compartilhar dados anônimos para melhorias" em
  **Settings → Privacidade**.
- **Opt-out**: ao desligar o toggle → `posthog.opt_out_capturing()` é
  chamado imediatamente + flag cacheada em `localStorage` pra próxima
  sessão.
- **PII**: nenhum evento envia nome, email, foto ou conteúdo de chat. Só
  hashes/buckets agregados.
- **PostHog EU**: host default `eu.posthog.com` (dados em Frankfurt, fora
  de jurisdição US).
- **Sentry**: replays mascarados, user context = só `id` (UUID).

## Filtragem de noise

`src/lib/sentry.ts` ignora:
- ResizeObserver loop warnings
- Falhas de rede transientes (`Network request failed`)
- Stack frames originados em browser extensions

Adicione padrões em `IGNORE_MESSAGE_PATTERNS` conforme surge ruído real.

## Edge functions

`supabase/functions/_shared/sentry.ts` exporta `withSentry(fnName, handler)`:

```ts
Deno.serve(withSentry('notify_match', async (req) => {
  // ... handler
}));
```

Catches any uncaught error, envia ao Sentry com tag `edge_function`, e
retorna `500 { error: 'internal_error' }`. Logs estruturados sempre saem
(stdout) pro Supabase Log Explorer mesmo sem DSN.

Functions já wrappadas:
- `moderate_photo`
- `notify_new_message`
- `notify_match`
- `process_pending_deletions`
- `photo_moderation_hook`

## Como inspecionar em produção

### Sentry
- **Issues** → erros agrupados por fingerprint, com Replay vinculado.
- **Performance** → transações com p50/p95.
- **Releases** → tag automática `beija@<version>` (lida do `package.json`
  via `vite-plugin-define` no `vite.config.ts`).

### PostHog
- **Persons** → usuário identificado pelo `userId` Supabase.
- **Events** → live feed.
- **Insights → Funnel** → conversão entre os passos do funil principal.
- **Web Vitals → "by quartile"** → distribuição de LCP/INP/CLS.

## Custo

- Sentry: free tier inclui 5K errors/mês + 10K replays/mês.
- PostHog: free tier inclui 1M eventos/mês (caso vire restritivo, migrar
  pra self-host).

## Como Apple Reviewers podem ver opt-out

Roteiro:
1. Login normal.
2. **Settings → Privacidade** → desligue "Compartilhar dados anônimos
   para melhorias".
3. Continue usando o app — nenhum evento `track()` sai daquele momento em
   diante (validar via Network DevTools: chamadas pra `eu.posthog.com`
   param).
4. Religue o toggle pra retomar.
