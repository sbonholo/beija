# Photo moderation pipeline

Beija atende **Apple Guideline 1.2** ("Safety – User Generated Content") com
dois estágios independentes de moderação automática + revisão humana de casos
limítrofes. Conformidade aplicável também à LGPD e ao ECA.

## Arquitetura

```
   Usuário tenta enviar foto
            │
            ▼
   ┌───────────────────────────┐
   │ Stage 1: PRE-UPLOAD       │  ← src/lib/storage.ts → moderatePhotoPreUpload
   │  edge fn moderate_photo   │
   │  → Sightengine API        │
   │  → photo_moderation_log   │
   └───────────────────────────┘
            │
       approved? ───── NO ──► ModerationFeedbackModal (PT-BR) → /community-guidelines
            │ YES
            ▼
   ┌───────────────────────────┐
   │ Supabase Storage upload   │
   │  (profile-photos bucket)  │
   └───────────────────────────┘
            │
            ▼
   ┌───────────────────────────┐
   │ Stage 2: POST-UPLOAD      │  ← supabase/functions/photo_moderation_hook
   │  Storage webhook          │
   │  → OpenAI omni-moderation │
   │  → quarantine bucket      │
   │  + report row (nsfw_auto) │
   └───────────────────────────┘
            │
       casos limítrofes → revisão humana via reports queue
```

A foto só fica visível pra outros usuários se passar **nas duas etapas**.

## Stage 1 — Sightengine (pre-upload)

Edge function: [`supabase/functions/moderate_photo/index.ts`](../supabase/functions/moderate_photo/index.ts).

Modelos chamados: `nudity-2.1`, `weapon`, `recreational_drug`, `medical`,
`gore`, `offensive`, `minor`, `scam`.

### Thresholds atuais

| Categoria | Score | Ação |
|---|---|---|
| `nudity.sexual_activity` | > 0.5 | reject |
| `nudity.sexual_display` | > 0.5 | reject |
| `nudity.erotica` | > 0.7 | reject |
| `minor.prob` | > 0.3 | reject (tolerância zero) |
| `gore.prob` | > 0.5 | reject |
| `weapon.classes.*` (qualquer) | > 0.5 | reject |
| `recreational_drug.prob` | > 0.6 | reject |
| `scam.prob` | > 0.7 | reject |
| `offensive.*` (qualquer chave) | > 0.5 | reject |

Sintonize editando `evaluate()` em `moderate_photo/index.ts`. Mantenha o
threshold de `minor` baixo — é a categoria mais sensível ao Apple Review.

### Auditoria

Toda decisão é logada em `photo_moderation_log` (migration
`20260525000000_photo_moderation_log.sql`):

```sql
select decision, count(*), avg((scores->>'minor')::float) as avg_minor
from photo_moderation_log
where created_at > now() - interval '7 days'
group by decision;
```

Usuários veem só os próprios logs via RLS (`select using user_id = auth.uid()`).
Service role escreve.

### Rate limit

**10 requisições / minuto / usuário**. Excedeu → 429 + log com
`decision='rate_limited'`. A janela é calculada via `SELECT count() FROM
photo_moderation_log WHERE created_at > now() - 60s`.

### Fail-open

Se o Sightengine cair, a edge function retorna `approved=true` com flag
`provider_error=true`. Isso permite que o app continue funcionando — a
camada 2 (OpenAI) ainda inspeciona o arquivo depois do upload.

## Stage 2 — OpenAI omni-moderation (post-upload)

Já estava no projeto desde a FASE O. Doc:
[`docs/EDGE_FUNCTIONS.md`](EDGE_FUNCTIONS.md#photo_moderation_hook).

Categorias zero-tolerance: `sexual/minors`, `violence/graphic`, `sexual`,
`violence`. Flag → move pro bucket `quarantine` + insere em `reports` com
`reason='nsfw_auto'`.

## UX do reject

Quando rejeitado, o usuário vê o **ModerationFeedbackModal** (lazy-loaded,
`role="alertdialog"`, focus trap, ESC fecha) com:

1. Lista PT-BR dos motivos (`MODERATION_REASON_LABELS_PT` em
   `frontend/src/lib/moderation.ts`).
2. Link "Ver diretrizes" → `/community-guidelines`.
3. Botão "Entendi" — fecha sem ressubmit.

A foto **não** é enviada ao Supabase Storage, então não consome quota.

## Env vars

Setadas via `supabase secrets set` (não comitar):

```
SIGHTENGINE_USER=...
SIGHTENGINE_SECRET=...
```

Se ausentes: a edge function loga `unconfigured` e retorna `approved=true`
(behavior fail-open conforme padrão). Dev local funciona sem chaves.

## Como o Apple Review pode testar

Roteiro pra adicionar nas Review Notes da App Store Connect:

1. Crie conta de teste / use credencial fornecida.
2. No onboarding, tente subir foto:
   - **OK**: qualquer selfie limpa — passa.
   - **Reject**: foto com nudez/violência (fornecemos URL de teste em
     <https://sightengine.com/demo>) — modal "Não conseguimos publicar
     esta foto" aparece com motivo.
3. Em `/community-guidelines` leia as regras + email de contato.
4. Em qualquer card do Discover, **⋯ → Reportar** abre formulário de
   denúncia.
5. Em qualquer card, **⋯ → Bloquear** corta contato.

## Ajustando thresholds em produção

1. Rode em prod por 1 semana, colete dados:
   ```sql
   select unnest(reasons) as reason, count(*) as rejections
   from photo_moderation_log
   where decision = 'rejected' and created_at > now() - interval '7 days'
   group by reason order by 2 desc;
   ```
2. Identifique categorias com muitos false positives → suba threshold em
   `moderate_photo/index.ts`.
3. Identifique categorias com false negatives reportadas via
   `reports.reason = 'nsfw_auto'` → desça threshold.
4. Re-deploy: `supabase functions deploy moderate_photo`.

## Custo

- Sightengine: ~US$0.001 por imagem (após free tier de 500/mês).
- OpenAI omni-moderation: grátis na escala atual (jan/2026).
- Supabase Storage: cobrado normalmente, mas rejeições pre-upload **não**
  ocupam storage — economia direta.

## Contato moderação

`moderacao@beija.app` — SLA 48h respostas, 6h pra casos urgentes (menor,
golpe, ameaça).
