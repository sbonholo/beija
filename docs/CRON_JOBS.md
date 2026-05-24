# Cron jobs

Todos os jobs são agendados via [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron),
declarados em `supabase/migrations/20260524700000_cron_jobs.sql`. Rodam no
fuso UTC do servidor Postgres do Supabase.

## Visão geral

| Job (nome em `cron.job`) | Schedule (UTC) | Função SQL | Propósito |
|---|---|---|---|
| `beija_process_deletion_requests` | `0 3 * * *` (diário 03:00) | `cron_process_deletion_requests()` | Dispara a edge function `process_pending_deletions` via `dispatch_edge` |
| `beija_mark_inactive_profiles`    | `0 4 * * *` (diário 04:00) | `cron_mark_inactive_profiles()`   | `profiles.is_inactive = true` quando `last_active_at < now() - 30 dias` |
| `beija_refresh_match_decay`       | `0 5 * * *` (diário 05:00) | `cron_refresh_match_decay()`      | `matches.is_stale` (7 dias sem msg) + `is_archived` (30 dias) |
| `beija_vacuum_notification_log`   | `0 6 * * *` (diário 06:00) | `cron_vacuum_notification_log()`  | Apaga `notification_log` com mais de 7 dias |
| `beija_cleanup_orphan_photos`     | `0 2 * * 0` (semanal dom 02:00) | `cron_cleanup_orphan_photos()` | Limpa `photos` e `storage.objects` órfãos no bucket `profile-photos` |

## Pipeline com as outras fases

```
swipe → INSERT swipes → trigger create_match_on_mutual_swipe
                              ↓
                       INSERT matches
                              ↓                              ┌────────────────────────┐
                       trg_notify_new_match → dispatch_edge  │ notify_match (FASE O)  │
                                                             └────────────────────────┘

mensagem → INSERT messages → trg_notify_new_message → dispatch_edge → notify_new_message

CRON 03:00 → cron_process_deletion_requests → dispatch_edge → process_pending_deletions
CRON 04:00 → cron_mark_inactive_profiles    → SQL apenas
CRON 05:00 → cron_refresh_match_decay       → SQL apenas
CRON 06:00 → cron_vacuum_notification_log   → SQL apenas
CRON 02:00 dom → cron_cleanup_orphan_photos → SQL + storage.objects
```

## Novas colunas (impacto no schema)

```
profiles
  last_active_at  timestamptz   (renomeado de `last_active`)
  is_inactive     bool default false

matches
  is_stale        bool default false
  is_archived     bool default false
```

E o RPC `find_potential_matches` agora filtra `is_inactive = false`. O
`MatchesList` do frontend filtra `is_archived` por padrão; um toggle
"Mostrar arquivados (N)" revela a lista completa.

## Pré-requisitos

1. **Extension**: a migration já roda `create extension if not exists pg_cron`.
2. **`dispatch_edge` settings**: o job `beija_process_deletion_requests`
   delega à edge function; precisa dos settings da FASE O:
   ```sql
   alter database postgres set "app.settings.supabase_url"     = 'https://<ref>.supabase.co';
   alter database postgres set "app.settings.service_role_key" = '<SERVICE_ROLE_KEY>';
   ```
3. **Privilégio em `storage.objects`**: o cleanup tenta `delete from
   storage.objects` direto. Em projetos Supabase gerenciados, o role do
   migration tem o privilégio; o `cron_cleanup_orphan_photos()` captura
   `insufficient_privilege` e segue logando aviso.

## Monitoramento

`pg_cron` registra execuções em `cron.job_run_details`. Queries úteis:

```sql
-- Últimas 10 execuções de qualquer job beija
select j.jobname, d.status, d.start_time, d.end_time, d.return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname like 'beija_%'
order by d.start_time desc
limit 10;

-- Jobs com falha recente
select j.jobname, d.start_time, d.return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where d.status <> 'succeeded'
  and d.start_time > now() - interval '7 days'
order by d.start_time desc;

-- Schedule atual de cada job
select jobname, schedule, active, command
from cron.job
where jobname like 'beija_%'
order by jobname;
```

Cada função SQL emite `RAISE NOTICE` com contadores; em Supabase eles caem em
`Postgres Logs` → filtrar por `cron_`.

## Rodar manualmente

Útil em dev / debug:

```sql
select cron_process_deletion_requests();
select cron_mark_inactive_profiles();
select cron_refresh_match_decay();
select cron_vacuum_notification_log();
select cron_cleanup_orphan_photos();
```

## Pausar / retomar / re-agendar

```sql
-- Pausar
update cron.job set active = false where jobname = 'beija_refresh_match_decay';

-- Retomar
update cron.job set active = true  where jobname = 'beija_refresh_match_decay';

-- Mudar o schedule (ex.: rodar a cada 6h em vez de diário)
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'beija_refresh_match_decay'),
  schedule := '0 */6 * * *'
);

-- Desinstalar permanentemente
select cron.unschedule('beija_refresh_match_decay');
```

## Trade-offs

- **Single timezone (UTC)**: todos os jobs rodam em UTC. 03:00 UTC = 00:00 BRT.
  Adequado pra hora baixa em ambos os mercados nossos (Brasil + EUA).
- **Sem retries automáticos**: pg_cron não tem retry policy. Se um job falhar
  numa janela, ele só roda de novo no próximo schedule. Para o cron de
  deletion (compliance-sensitive) montamos o backstop via GitHub Actions
  diário também — fail-safe duplo.
- **`storage.objects` direct delete**: o cleanup roda fora do path padrão de
  Supabase Storage. Em teoria, isso pula triggers de billing/quota se
  existirem — sem impacto hoje, vigiar caso Supabase mude a arquitetura.
- **Match decay automático**: 7d stale / 30d archived são chutes razoáveis.
  Se o engajamento real ficar abaixo, abaixar a janela. Por trás, o usuário
  não perde o histórico — `is_archived` só esconde da listagem.

## Custo

`pg_cron` é grátis no Supabase. O job mais pesado (`mark_inactive_profiles`)
faz um único UPDATE indexado em `profiles.last_active_at`; ~ms por job em
escala MVP. O cleanup de storage pode ficar lento se houver milhões de
objetos órfãos — colocamos em domingo de madrugada exatamente por isso.
