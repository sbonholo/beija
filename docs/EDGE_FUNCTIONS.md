# Edge Functions

Deno-based Supabase Edge Functions que rodam push notifications, deleção de
conta agendada e moderação automática de fotos. Fonte: `supabase/functions/`.
Config: `supabase/config.toml`. Triggers DB:
`supabase/migrations/20260524600000_function_hooks.sql`.

## Visão geral

| Função | Trigger | Quando dispara | O que faz |
|---|---|---|---|
| `notify_new_message` | `AFTER INSERT` em `messages` | Mensagem nova chega | Push pro recipient (APNs/FCM), respeita `mute_notifications`, rate-limit de 30s por sender |
| `notify_match` | `AFTER INSERT` em `matches` | Swipe mútuo (right/super) | Push pra ambos os participantes com som `match.caf` |
| `process_pending_deletions` | Cron (1×/dia) | `deletion_requests.scheduled_for <= NOW()` | Anonimiza profile, dropa fotos do storage, hard-delete `auth.users` |
| `photo_moderation_hook` | `AFTER INSERT` em `storage.objects` (bucket `profile-photos`) | Upload de foto | Modera via OpenAI omni-moderation, quarentena + report se flagged |
| `account_deletion_confirmation` | client-fire | Usuário pede deleção | Email transacional confirmando janela de 30 dias |

## Rodar local

```bash
# CLI v1.150+
brew install supabase/tap/supabase

cd /path/to/beija
supabase login
supabase link --project-ref <ref>

# servir TODAS as functions com hot reload
supabase functions serve --env-file frontend/.env.local

# servir uma só
supabase functions serve notify_new_message --env-file frontend/.env.local
```

`supabase functions serve` lê o `[functions.*]` em `supabase/config.toml`, então
o `verify_jwt=false` (necessário pra triggers DB) já vai junto.

## Deploy

```bash
# todas
for fn in notify_new_message notify_match process_pending_deletions \
          photo_moderation_hook account_deletion_confirmation; do
  supabase functions deploy "$fn" --no-verify-jwt
done

# uma só
supabase functions deploy notify_new_message --no-verify-jwt
```

> `--no-verify-jwt` é redundante com o `config.toml`, mas alguns dashboards
> resetam o flag — passar explicitamente garante.

## Configurar settings de banco (uma vez por projeto)

Sem isso a função `dispatch_edge()` no Postgres não consegue chamar as edge
functions (a migration loga aviso e segue, então não quebra).

```sql
-- via psql ou Supabase SQL Editor (precisa ser owner do DB):
alter database postgres set "app.settings.supabase_url"     = 'https://<ref>.supabase.co';
alter database postgres set "app.settings.service_role_key" = '<SERVICE_ROLE_KEY>';

-- recarrega os settings na conexão atual:
select pg_reload_conf();
```

## Env vars necessárias

Defina via `supabase secrets set` (server-side) ou `.env.local` (dev local):

| Var | Função | O que é |
|---|---|---|
| `SUPABASE_URL` | todas | URL do projeto (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | todas | service_role secret (Settings → API) |
| `SUPABASE_ANON_KEY` | notify_*, photo_moderation | anon public key (usada nos paths legacy com user JWT) |
| `FCM_PROJECT_ID` | notify_* | Firebase project id |
| `FCM_SERVICE_ACCOUNT` | notify_* | JSON do service account do Firebase (string única) |
| `APNS_TEAM_ID` | notify_* | Team ID Apple Dev (10 chars) |
| `APNS_KEY_ID` | notify_* | Key ID do .p8 |
| `APNS_PRIVATE_KEY` | notify_* | Conteúdo do .p8 (PEM com BEGIN/END) |
| `APNS_BUNDLE_ID` | notify_* | default `io.beija.app` |
| `APNS_PRODUCTION` | notify_* | `true` em prod, default sandbox |
| `OPENAI_API_KEY` | photo_moderation_hook | Chave OpenAI; sem ela a função no-op com log |
| `PHOTO_QUARANTINE_BUCKET` | photo_moderation_hook | default `quarantine` |
| `EMAIL_FROM` / `RESEND_API_KEY` | account_deletion_confirmation | email transacional |

Setar tudo no projeto:

```bash
supabase secrets set --env-file path/to/secrets.env
```

## Storage buckets

Crie os dois buckets antes do primeiro upload:

```bash
supabase storage create-bucket profile-photos --public
supabase storage create-bucket quarantine            # privado
```

## Testando com curl

### `notify_new_message` (legacy client path)

```bash
SUPABASE_URL="https://<ref>.supabase.co"
USER_JWT="<jwt-do-supabase.auth>"

curl -X POST "$SUPABASE_URL/functions/v1/notify_new_message" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"match_id":"<uuid-do-match>","preview":"oi!"}'
```

### `notify_new_message` (DB trigger path — simula o pg_net)

```bash
SERVICE_KEY="<service_role>"

curl -X POST "$SUPABASE_URL/functions/v1/notify_new_message" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "type":"INSERT","table":"messages",
        "record":{"id":"<msg-uuid>","match_id":"<uuid>","sender_id":"<uuid>","content":"oi!"}
      }'
```

### `notify_match`

```bash
curl -X POST "$SUPABASE_URL/functions/v1/notify_match" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "type":"INSERT","table":"matches",
        "record":{"id":"<match-uuid>","user1_id":"<uuid>","user2_id":"<uuid>"}
      }'
```

### `process_pending_deletions`

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process_pending_deletions" \
  -H "Authorization: Bearer $SERVICE_KEY"
```

Resposta esperada com fila vazia:
```json
{"ok":true,"processed":0,"errors":[]}
```

### `photo_moderation_hook` (simulando webhook do Storage)

```bash
curl -X POST "$SUPABASE_URL/functions/v1/photo_moderation_hook" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "type":"INSERT",
        "record":{"bucket_id":"profile-photos","name":"<userId>/<filename>.jpg","owner":"<userId>"}
      }'
```

## Logs estruturados

Toda função emite linhas JSON (`{ level, fn, ts, ... }`). Procure no Supabase
log explorer por `fn="notify_new_message"`, `fn="photo_moderation_hook"`, etc.
Ferramentas como `jq` funcionam direto:

```bash
supabase functions logs notify_new_message --tail | jq 'select(.level=="error")'
```

## Schedule do cron

Use o agendador nativo do Supabase (`Edge Functions → Schedules`) ou um cron
externo (GitHub Actions, `cron-job.org`, etc.) chamando:

```
POST https://<ref>.supabase.co/functions/v1/process_pending_deletions
Authorization: Bearer <SERVICE_ROLE_KEY>
```

1×/dia às 04:00 UTC é o padrão sugerido (baixa concorrência).

## Trade-offs e gotchas

- **Rate limit de mensagens** vive na tabela `notification_log`. Custa 1 INSERT
  por mensagem-em-rate-limit, mas evita push duplicado quando um chat tá em
  ritmo de digitação rápida.
- **`mute_notifications`** é per-user, não per-chat. Mute por chat exigiria
  outra tabela; deixei pra fase futura.
- **`photo_moderation_hook`** depende de `OPENAI_API_KEY`. Sem ela: no-op com
  log, fotos passam direto. Considere ligar **antes** de abrir o app pra
  produção.
- **Triggers no `storage.objects`** podem precisar de privilégio extra em
  self-hosted; a migration captura `insufficient_privilege` e segue. O
  fallback é cadastrar uma Storage Webhook no dashboard apontando pra
  `/functions/v1/photo_moderation_hook`.
- **Custo OpenAI**: omni-moderation é grátis no momento (jan/2026). Confirme
  na sua conta antes de hot-deploy.

## Checklist pós-deploy

- [ ] `alter database postgres set app.settings.*` rodado
- [ ] Buckets `profile-photos` (public) + `quarantine` (private) criados
- [ ] Secrets configurados via `supabase secrets set`
- [ ] Schedule diário do `process_pending_deletions` ligado
- [ ] Storage webhook (ou trigger via migration) apontando pra
      `photo_moderation_hook`
- [ ] Smoke-test cada função com os curls acima
