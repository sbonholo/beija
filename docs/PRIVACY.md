# Privacy — defesa em profundidade

Este doc descreve o threat model + os mecanismos de proteção de dados
sensíveis do usuário no Beija. Alinhado com LGPD (Brasil), App Store
Guidelines 5.1.x, e GDPR (quando o EN locale entrar em produção).

## Threat model

| Ator | Capacidade | Mitigação |
|---|---|---|
| Atacante anônimo (sem login) | Hits diretos aos RPCs | RLS bloqueia toda leitura de `profiles`, `swipes`, `matches` etc. RPCs verificam `auth.uid()`. |
| Usuário legítimo via app | Vê telas normais; engenharia social | Filtros server-side garantem que distância/idade só aparecem se a outra ponta consentiu. |
| Usuário legítimo + DevTools/proxy | Vê payload raw da API e armazenamento local | **Filtros sensíveis aplicados server-side** (RPC `get_profile_safe`) — birthdate vira NULL, distance_km vira NULL conforme prefs do alvo. Cliente nunca recebe o dado bruto. |
| Insider / supabase admin | Acesso direto ao DB | Out-of-scope desta fase. Sentry replay mascara texto/imagem; PostHog identifica por UUID-only. |

## Pipeline de dois estágios

```
                ┌─────────────────────────────────────────────────┐
                │  Layer 1: SERVER-SIDE FILTERS (canônico)         │
                │  ───────────────────────────────────             │
                │  • RLS em profiles/swipes/matches/messages       │
                │  • RPC get_profile_safe (P5) sanitiza:           │
                │      - birthdate=NULL  se show_age = false       │
                │      - distance_km=NULL se hide_distance = true  │
                │      - 0 rows se blocks ou reports               │
                │      - 0 rows se deleted_at ou is_inactive       │
                │  • RPC get_profiles_safe (batch idem)            │
                │  • RPC find_potential_matches mesmas regras      │
                └─────────────────────────────────────────────────┘
                                      │ network
                ┌─────────────────────▼───────────────────────────┐
                │  Layer 2: CLIENT RENDERS (cosmético)             │
                │  • Recebe dados já mascarados; só desenha.       │
                │  • Não há filtragem client-side de fields        │
                │    sensíveis — se o servidor mandou, é público.  │
                └─────────────────────────────────────────────────┘
```

Princípio: **a tela do app não tem privilégio acima do que o servidor já
liberou**. Mesmo abrindo Network DevTools, um atacante vê só `birthdate=null`
quando o alvo opt-out de `show_age`.

## Cobertura por opt-out

| Toggle (em `profiles`) | O que esconde | RPC que aplica |
|---|---|---|
| `hide_distance` | `distance_km` na visão do outro | `get_profile_safe`, `get_profiles_safe`, `find_potential_matches` |
| `show_age = false` | `birthdate` na visão do outro | idem |
| `mute_notifications` | Pushes APNs/FCM | `notify_new_message`, `notify_match` |
| `allow_analytics = false` | Eventos PostHog | client-side (`setAnalyticsConsent`) — não há dado sensível no server-side analytics. |
| `deleted_at` | Tudo (perfil sumido) | RLS + filter em todas RPCs |
| `is_inactive` | Perfil oculto do Discover | `find_potential_matches`, `get_profile*` |

## RPCs canônicas (P5)

### `get_profile_safe(p_target_user_id uuid)`
Retorna 1 linha ou 0. Usado por `ProfileDetailModal`. Lança
`not_authenticated` se `auth.uid()` é null. Retorna 0 linhas se o alvo é o
próprio caller, está deletado, inativo, bloqueado em qualquer direção, ou
tem report pendente.

### `get_profiles_safe(p_target_user_ids uuid[])`
Mesma sanitização, batch. Para listas (matches, likes-you, futuras feeds).
Ordem **não preservada** — caller deve reindexar por id.

### `find_potential_matches(p_user_id uuid, p_max_distance_km int)`
Atualizada na mesma migration (FASE P5) pra aplicar `show_age` masking +
`hide_distance` masking — antes só filtrava `is_inactive`/blocks/reports.

## Por que SECURITY DEFINER

Todas as 3 RPCs são `SECURITY DEFINER` (rodam como o owner do banco). Isso
permite:
- Ler `profiles.location` do caller pra calcular distância (RLS impediria).
- Ler `blocks` e `reports` em ambas direções pra validar visibilidade.

Mitigações:
- `set search_path = public` — evita SQL injection via schema poisoning.
- `auth.uid()` é checado antes de qualquer leitura — quem não está logado
  vê 0 linhas.
- Argumentos são UUID-tipados — `p_target_user_id uuid` rejeita texto
  malformado.
- Execute permission revogada do `public`, granted apenas a `authenticated`.

## Validação SQL (smoke)

Roteiro manual (via SQL Editor do Supabase, com 2 usuários A e B logados
em sessões separadas):

```sql
-- 1) Crie 2 profiles, um deles com show_age = false
update profiles set show_age = false where id = '<UUID-A>';

-- 2) Logue como B; valida que A.birthdate vem NULL
select id, name, birthdate, distance_km from get_profile_safe('<UUID-A>');
-- Esperado: birthdate = NULL, distance_km = real

-- 3) Logue como A; hide_distance = true
update profiles set hide_distance = true where id = '<UUID-A>';

-- 4) Logue como B; distance_km vem NULL
select id, name, birthdate, distance_km from get_profile_safe('<UUID-A>');
-- Esperado: birthdate = NULL, distance_km = NULL

-- 5) Block scenario: B bloqueia A
insert into blocks (blocker_id, blocked_id) values ('<UUID-B>', '<UUID-A>');

-- 6) Logue como B; A retorna 0 rows
select * from get_profile_safe('<UUID-A>');
-- Esperado: 0 rows

-- 7) Logue como A; tentar ver B retorna 0 rows (block em qualquer direção)
select * from get_profile_safe('<UUID-B>');
-- Esperado: 0 rows
```

Cobertura automatizada planejada na FASE de testes E2E (pgTAP ou
Playwright + Supabase service role).

## LGPD compliance

- **Coleta**: somente o estritamente necessário (`profiles` schema).
- **Consentimento**: TOS aceito no signin; `allow_analytics` opt-out
  imediato em Settings; deleção sob demanda com janela de 30 dias.
- **Acesso do titular**: usuário vê o próprio profile completo (RLS
  `select using (id = auth.uid())`).
- **Portabilidade**: roadmap — export JSON via edge function pending.
- **Eliminação**: `DeleteAccountFlow` + cron `process_pending_deletions`
  (FASE O+R).
- **Mascaramento em logs**: Sentry Replay com `maskAllText` +
  `blockAllMedia`; PostHog com `person_profiles='identified_only'`.

## App Store / Apple Review trail

Pontos a destacar nas Review Notes:
1. Toggles de privacidade em Settings → Privacidade (`hide_distance`,
   `show_age`, `allow_analytics`).
2. `Settings → Conta → Deletar conta` aplica janela de 30 dias (HIG 5.1.1v).
3. Reportar / Bloquear acessível em qualquer card via ⋯ (HIG 1.2).
4. Diretrizes de comunidade em rota pública `/community-guidelines` (HIG 1.2).
5. Pipeline de moderação two-stage em `docs/PHOTO_MODERATION.md`.
6. Filtros server-side em `docs/PRIVACY.md` (este arquivo) — pré-FASE 5
   o filtragem era client-side, hoje (FASE P5) é canônico server-side.

## Histórico

| Phase | Marco |
|---|---|
| Initial | RLS básico em todas as tabelas. |
| P1 | Pre-upload Sightengine moderation. |
| P2 | Sentry replay com maskAllText; PostHog opt-out. |
| **P5 (esta)** | `get_profile_safe` + `get_profiles_safe` + `find_potential_matches` sanitizando server-side. |
