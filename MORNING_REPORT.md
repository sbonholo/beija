# Beija — Morning Report

**Branch:** `migrations-schema` (PR [#1](https://github.com/sbonholo/beija/pull/1))
**Último commit:** `d309780` — "feat: Phase 1 complete - Auth, Storage, Push, Moderation setup"

---

## ✅ Feito nessa sessão

### Frontend — refactor de arquitetura
- **Removida auth por celular** (Login, VerifyOtp deletados).
- Profile virou landing (`/`):
  - Sem perfil → `CreateProfile` (foto, nick, identidade, seeking, checkbox 18+).
  - Com perfil → `Profile` editável (todos os campos + apagar conta).
- `AuthContext` simplificado: perfil persistido em `localStorage` (`beija_profile`), sem token.
- Onboarding e PhotoGate foram absorvidos pelo `CreateProfile`.

### Frontend — UX
- BottomNav rebuild (gradient bar no topo da tab ativa, glow no ícone, fix do problema do CSS mirar `button` em vez de `a`).
- MatchModal mostra os dois ícones de reação (seu + dela) + subtítulo "É beijo na boca!".
- Regra de match generalizada: qualquer combinação de ícones triggera match (não só `kiss → Bia`).
- Telefone removido do header do Profile.
- "Salvar" no Profile navega pra `/events`.

### Frontend — dados mock
- `mockedApi.updateMe` mutates `mockUser` e respeita o seeking real do usuário (lido de localStorage).
- `listPeople` aplica filtro mútuo (eu quero ela + ela me quer).
- Bia tem `receivedReaction: 'kiss'` no seed → reagir nela sempre dá match.
- Mensagens otimistas no Chat (append local na hora do send).

### Plataformas nativas — Capacitor
- `@capacitor/core` + `@capacitor/cli` instalados.
- `cap init beija io.beija.app --web-dir=dist` rodado.
- `cap add ios` → projeto Xcode em `frontend/ios/` (precisa Mac pra abrir).
- `cap add android` → projeto Gradle em `frontend/android/`.
- Plugins extras instalados: `@capacitor/app`, `@capacitor/push-notifications`.

### Backend / dados
- Branch `migrations-schema` criada a partir de `main`.
- `supabase/migrations/20260523000000_initial_schema.sql` criado com schema base (users, events, people_at_event, reactions, matches, messages + RLS habilitado).

### Moderação (compliance App Store)
- `frontend/src/components/Moderation/ReportModal.tsx` — modal de denúncia com 6 razões em PT-BR + textarea opcional + estado submitted. **Ainda não plugado em nenhum lugar do app.**

### Dependências instaladas
- `@supabase/supabase-js` ^2.106.1
- `@capacitor/app` ^8.1.0
- `@capacitor/push-notifications` ^8.1.1

---

## ⚠️ Pendências dessa sessão (heredocs cortaram)

Esses arquivos foram pedidos mas o conteúdo não chegou via UI:

- `frontend/src/lib/auth.ts`
- `frontend/src/lib/storage.ts`
- `frontend/src/lib/pushNotifications.ts`
- `supabase/migrations/20260524000000_complete_schema.sql`
- `IMPLEMENTATION_SPEC.md`

Pra desbloquear: mandar conteúdo como texto normal (não `cat <<EOF`).

---

## 🔴 Conhecidos do schema atual

`20260523000000_initial_schema.sql` tem inconsistências com o frontend:

1. `create extension "pgjson"` — extensão não existe (vai falhar no push). Provável intenção: `pgcrypto` ou `pg_jsonschema`.
2. `phone_number text unique not null` — frontend não coleta mais celular.
3. `gender check ('M', 'F', 'Other', 'Prefer not to say')` — frontend usa `'man'|'woman'|'non-binary'|'other'`.
4. `seeking text check ('M', 'F', 'Both')` — frontend é array de Gender.

Schema precisa alinhar com `User` type do TS antes do `supabase db push`.

---

## 🎯 Próximos passos sugeridos (do diagnóstico App Store)

**Bloqueadores duros pra review:**
1. Ligar backend real (Supabase setup + RLS policies) — schema é o primeiro passo, faltam policies.
2. Auth real: Sign in with Apple + Google (substitui o localStorage anônimo).
3. Storage de fotos (Supabase Storage bucket).
4. Push notifications: APNs + backend hook.
5. Privacy Policy + Terms (linkar no CreateProfile e Profile).
6. **Plugar o ReportModal** em PersonSheet e Chat.
7. Botão "Bloquear" em PersonSheet e Profile do outro.
8. Account deletion no backend (não só localStorage).
9. Moderação automática de fotos no upload.

**Gaps técnicos:**
10. Capacitor: ícones reais (1024px), splash screen, Info.plist permissions (camera, photo library, geolocation, notifications).
11. Geolocation permission strings (PT-BR).
12. Crash reporting (Sentry).
13. Reconnect handler no socket (re-emit `event:join` após drop).
14. Heartbeat / TTL no check-in.

**UX pra produção:**
15. Check-in explícito (não auto ao abrir `/events/:id`).
16. Undo de reação (API tem, UI não expõe).
17. Read receipts + typing indicator no Chat.
18. Foto cropping + compressão antes do upload.
19. Selfie verification opcional.

---

## 📋 Como retomar

```bash
# pra continuar local
cd /home/user/beija
git checkout migrations-schema
git pull
cd frontend
npm install   # se precisar
npm run dev   # frontend em http://localhost:5173

# pra rodar nativo (precisa Mac pra iOS)
npm run build
npx cap sync
npx cap open ios     # ou: npx cap open android
```
