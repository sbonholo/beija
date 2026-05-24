# Deploy (web)

Beija hoje tem **2 caminhos** de deploy web, prontos pra dispararem em push:

| Host | URL pattern | Workflow | Quando usar |
|---|---|---|---|
| **Vercel** | `beija-<hash>.vercel.app` (preview) / domínio próprio (prod) | `.github/workflows/deploy-vercel.yml` | Smoke testing pra usuários reais, links pra QR code no celular |
| **GitHub Pages** | `https://sbonholo.github.io/beija/` | `.github/workflows/deploy-pages.yml` | Backup gratuito, mas com base path `/beija` |

Os 2 podem coexistir. Vercel é o canal principal pra testes (URL bonita,
preview por PR, SSL automático, headers customizáveis).

## Quick start — Vercel (5min)

### 1. Criar o projeto no Vercel

1. Vá em <https://vercel.com/new> e importe o repo `sbonholo/beija`.
2. **Framework Preset**: deixe `Other` — o `vercel.json` do repo já define
   tudo.
3. **Root Directory**: `./` (raiz do repo, NÃO `frontend/`).
4. Build/Output são lidos do `vercel.json`; não precisa configurar.
5. Clique **Deploy**. O primeiro build vai falhar OU mostrar a
   "MissingConfigScreen" — passa pro passo 2.

### 2. Configurar environment variables

Em **Settings → Environment Variables** do projeto, adicione (Production +
Preview + Development):

| Nome | Valor | Obrigatório? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | **sim** |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` (anon key) | **sim** |
| `VITE_SENTRY_DSN` | DSN do Sentry | recomendado prod |
| `VITE_POSTHOG_KEY` | `phc_...` | recomendado |
| `VITE_POSTHOG_HOST` | `https://eu.posthog.com` (default) | opcional |
| `VITE_GOOGLE_WEB_CLIENT_ID` | OAuth client web | só pra Google Sign In funcionar |

Encontre as 2 obrigatórias em:
**supabase.com/dashboard → projeto → Settings → API**

- Project URL → `VITE_SUPABASE_URL`
- anon public → `VITE_SUPABASE_ANON_KEY`

Depois clique **Redeploy** (Deployments → ⋯ → Redeploy) ou faça um novo
push.

### 3. Habilitar deploy automático via GitHub Action

A ação `.github/workflows/deploy-vercel.yml` faz push deploys (production
em `main`, preview em PRs) usando a CLI do Vercel — independente da
auto-conexão do dashboard. Setup:

1. Gere um token pessoal em <https://vercel.com/account/tokens>
   (escopo: full account).
2. No projeto Vercel, **Settings → General → Project ID** → copie.
3. **Settings → General → Team ID** (ou Personal Account ID) → copie.
4. No repo GitHub: **Settings → Secrets and variables → Actions → New
   repository secret**:
   - `VERCEL_TOKEN` = token do passo 1
   - `VERCEL_ORG_ID` = team/account id
   - `VERCEL_PROJECT_ID` = project id

Sem esses 3 secrets, o job não quebra — só pula com aviso no log.

### 4. Testar no celular

1. Após o primeiro deploy bem-sucedido, copie a URL do Vercel (algo
   tipo `https://beija-abc123.vercel.app`).
2. Gere um QR code (ex: <https://www.qrcode-monkey.com/>) com a URL.
3. Aponte a câmera do celular e abra. Login com Apple/Google funciona
   no Safari/Chrome mobile sem precisar do app nativo.

## GitHub Pages (alternativo / backup)

Já configurado em `.github/workflows/deploy-pages.yml`. Roda automático
em push pra `main`. URL: `https://sbonholo.github.io/beija/`.

Pré-requisitos:
- Repo público OU plano GitHub Pro.
- **Settings → Pages → Source**: GitHub Actions.
- Secrets: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (e os opcionais).

Diferenças vs Vercel:
- URL termina em `/beija/` (base path) — o workflow seta
  `VITE_BASE_PATH=/beija` automaticamente.
- Sem rewrites server-side — refresh em rota tipo `/discover` cai num
  404.html que faz redirect client-side (já existe em `public/404.html`).

## Variáveis de ambiente — referência completa

`frontend/.env.example` lista todas. Resumo:

| Var | Build-time? | Cliente expõe? | Obrigatória? |
|---|---|---|---|
| `VITE_*` | sim | **sim** (vai pro JS) | algumas |
| `SUPABASE_SERVICE_ROLE_KEY` | só pra `npm run db:seed` local | nunca | não (dev) |
| `SIGHTENGINE_USER/SECRET` | edge function (server) | não | recomendada |
| `SENTRY_DSN_EDGE` | edge function (server) | não | recomendada |

⚠️ Nunca coloque secrets server-side com prefixo `VITE_` — eles **viram
público** no bundle do navegador.

## Fallback gracioso

Se você fizer deploy SEM `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`,
o app **não crasha**. Renderiza `MissingConfigScreen` com instruções
amigáveis em PT-BR e link de volta pra esta doc.

Implementação: `src/components/MissingConfigScreen.tsx`, gated por
`SUPABASE_CONFIGURED` em `src/lib/supabase.ts`.

## Headers de segurança (vercel.json)

- **HSTS** 2 anos com preload
- **X-Frame-Options: DENY** (sem iframing)
- **X-Content-Type-Options: nosniff**
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy**: só geolocation/camera (self), microphone OFF
- **CSP-Report-Only** inicial — não bloqueia nada, só observa. Quando o
  app rodar uma semana sem violations no console, virar pra
  `Content-Security-Policy` enforcing.
- **Cache imutável** em `/assets/*` (1 ano) — vite gera hash no nome.
- **No-cache em `/sw.js`** — service worker sempre fresco.

## Custom domain (opcional)

1. No Vercel: **Settings → Domains → Add** → digite o domínio.
2. Aponte os DNS A/AAAA ou CNAME conforme o painel mostrar.
3. SSL automático via Let's Encrypt em ~5min.

## Rollback

```bash
# Via dashboard
Deployments → último deploy bom → ⋯ → Promote to Production

# Via CLI
vercel rollback <deployment-url> --token=$VERCEL_TOKEN
```

## Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| Tela branca + console "missing VITE_SUPABASE_URL" | Env vars não setadas no Vercel | Settings → Environment Variables, **redeploy** após salvar |
| 404 em rotas tipo `/discover` | rewrites não pegaram | Confirme `vercel.json` na raiz do repo (não em `frontend/`) |
| `vercel: command not found` no Actions | falta setup | Workflow instala `vercel@latest` global, não precisa ação extra |
| Preview URL não comenta no PR | Job pulou (secrets faltando) | Veja warning no log; configure VERCEL_* secrets |
| CSP bloqueando algum domínio | Domínio não em `connect-src` | Edite `vercel.json → headers → CSP-Report-Only`, mantém em report-only até validar |

## Próximos passos pré-launch

- [ ] Vercel projeto criado + env vars setadas
- [ ] VERCEL_* secrets adicionados ao repo
- [ ] Primeiro deploy verde — URL anotada
- [ ] QR code gerado pra testar no celular
- [ ] CSP virou enforcing depois de 1 semana sem violations
- [ ] Custom domain configurado (opcional)
- [ ] Sentry capturando errors em produção
- [ ] PostHog vendo eventos do funil
