# Play Store Metadata — Beija

Reference for Google Play Console submission. Mirrors `AppStoreMetadata.md` where the fields overlap, but Play has its own quirks (Data Safety, Content Rating via IARC, Target Audience).

---

## App identity

| Field | Value |
|---|---|
| **Application ID** | `io.beija.app` |
| **App name (Play Console)** | Beija |
| **Default language** | Portuguese (Brazil) — pt-BR |
| **Secondary languages** | English (US) — optional, recommended for global discoverability |
| **App category** | Dating |
| **Tags** | Dating, Social, Lifestyle |
| **Content rating** | Mature 17+ (IARC questionnaire — see below) |
| **Target age range** | 18+ |
| **Pricing** | Free (with future in-app purchases) |

---

## Short description (80 chars max)

```
Conexões reais sem complicação. Encontre pessoas perto de você. 18+.
```
*(67 chars)*

## Full description (4000 chars max — ~2000 recommended)

```
Beija é o app de relacionamentos feito por brasileiros, pra brasileiros.

Cansou de apps internacionais que não entendem como a gente curte conhecer alguém? O Beija foi pensado pra simplificar e tornar mais seguro o encontro de pessoas perto de você.

✨ POR QUE BEIJA?

• Foco no Brasil — cultura, cidades e linguagem locais
• Onboarding em 60 segundos — 3 telas, sem mil perguntas
• UX limpa — só o que você precisa pra encontrar alguém legal
• Segurança em primeiro lugar — denúncia em 1 toque, resposta em até 24h
• Privacidade respeitada — não vendemos seus dados, ponto

🔥 COMO FUNCIONA

1. Crie seu perfil com foto, nome e o que você procura
2. Veja pessoas compatíveis perto de você
3. Curta quem te interessa
4. Match! É hora de conversar
5. Convide pra um rolê, um café ou um encontro

💋 RECURSOS

• Login com Apple ou Google — sem precisar de senha
• Match inteligente com filtros de gênero, idade e distância
• Bloqueio e denúncia em 1 toque
• Chat em tempo real com confirmação de leitura
• Notificações de matches e mensagens
• Exclusão de conta direto no app (30 dias pra reativar)

🛡️ COMPROMISSO COM SEGURANÇA

• Exclusivo pra maiores de 18 anos
• Equipe humana respondendo denúncias em <24h
• Bloqueio instantâneo de usuários abusivos
• Sem rastreamento publicitário cross-site
• Dados criptografados em trânsito e em repouso

📱 REQUISITOS

• Android 7.0 (Nougat) ou superior
• Conexão à internet

🇧🇷 FEITO NO BRASIL

Beija é uma startup brasileira independente. Pensado em São Paulo, Rio, Belo Horizonte, Salvador, Curitiba e em todo canto do país.

Conta pra gente o que achou: support@beija.app

Termos: https://beija.app/terms
Privacidade: https://beija.app/privacy
```

## Promotional graphics

Required image assets (uploaded in Play Console → Main store listing → Graphics):

| Asset | Size | Notes |
|---|---|---|
| **App icon** | 512 × 512 PNG, 32-bit | full alpha allowed (Play rounds corners) |
| **Feature graphic** | 1024 × 500 PNG/JPG | shown at top of the store listing |
| **Phone screenshots** | min 320 px shortest side, max 3840 px; aspect 16:9 or 9:16 | min 2, max 8 |
| **7-inch tablet** | optional | min 2 if app supports tablets |
| **10-inch tablet** | optional | min 2 if app supports tablets |
| **Promo video** | YouTube URL | optional but boosts conversion ~25% |

Reuse the same 5 screenshot themes from `AppStoreMetadata.md`:
1. Hero swipe deck — "Conheça gente perto."
2. Match modal — "É beijo na boca!"
3. Chat realtime — "Converse sem complicação."
4. Profile setup — "Você no controle."
5. Onboarding speed — "Conta criada em 60 segundos."

---

## Data Safety (Play's equivalent of Apple's Nutrition Labels)

Filled out in Play Console → Policy → Data Safety. Beija submission:

### Data collected
| Category | Data type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|---|
| Personal | Name | Yes | No | Optional | App functionality, personalization |
| Personal | Email | Yes | No | Required | Authentication, account management |
| Photos & videos | Photos | Yes | No | Required | App functionality (profile) |
| Location | Approximate location | Yes | No | Optional | App functionality (matching by distance) |
| Messages | In-app messages | Yes | No | Required | App functionality |
| App activity | App interactions (swipes) | Yes | No | Required | App functionality |
| App info & performance | Crash logs | Yes | No | Optional | Analytics |

### Data handling practices
- **Data encrypted in transit:** ✅ Yes (HTTPS / TLS 1.2+)
- **Data encrypted at rest:** ✅ Yes (Supabase Postgres encryption)
- **Users can request data deletion:** ✅ Yes (in-app "Excluir conta" → 30-day cooldown)

### Data NOT collected / shared
- No advertising IDs
- No fingerprinting
- No cross-app tracking
- No data sold to third parties

---

## Content Rating (IARC questionnaire)

Play uses the International Age Rating Coalition (IARC) questionnaire. Expected answers for Beija → results in **Mature 17+** rating with the following labels:

| Question category | Answer |
|---|---|
| Violence | None |
| Profanity | User-generated content possible (acknowledge) |
| Drugs / alcohol | None |
| Gambling | None |
| Sexual content | "Mild reference" (dating context — no explicit content allowed by ToS) |
| User-generated content | Yes — photos + chat |
| Shares user location | Yes — coarse only |
| Personal info collection | Yes |
| Digital purchases | Yes (future premium tier) |

Resulting ratings:
- **IARC Generic:** 17+
- **ESRB:** Mature 17+
- **PEGI:** 18
- **USK:** 16
- **ClassInd (Brazil):** 18

---

## Target Audience and Content

Play asks two key questions:

1. **Target age:** 18+ only (we exclude children's category entirely).
2. **Appeal to children:** No.

These answers exempt the app from COPPA / Families Policy. We declare 18+ to match the in-app age gate.

---

## App access

Play asks if any parts of the app are gated (login, paywall, etc).

| Section | Restricted? | How reviewer accesses |
|---|---|---|
| All app functionality | Yes — login required | Provide demo Google account credentials |

Provide reviewers:
- **Demo Google account:** `review@beija.app` (to be created)
- **Reviewer notes:** "Sign in with Google using the credentials provided. The app will guide you through onboarding (60s). After onboarding, swipe right on any of the seeded test profiles. One profile is configured to auto-match — try Bia. Test Block/Report via the chat header ⋮ menu. Test account deletion via /profile → 'Apagar perfil'."

---

## Pricing & distribution

| Setting | Value |
|---|---|
| **App availability** | Brazil first, then expand to LATAM (Argentina, Chile, Colombia, Mexico) |
| **Countries** | At launch: Brazil only |
| **Contains ads** | No |
| **In-app purchases** | No at v1.0 (declare yes when premium tier ships) |
| **Restricted access** | None — public app |

---

## Pre-submission checklist

- [ ] **Google Play Developer Account** created ($25 one-time)
- [ ] **App created** in Play Console (`io.beija.app` reserved)
- [ ] **Service Account** for Play API access generated (for fastlane supply)
- [ ] **Upload keystore** generated and securely stored
- [ ] **Play App Signing** enrolled (Google holds the app signing key, we upload signed by upload key)
- [ ] **Privacy Policy URL** live at `https://beija.app/privacy`
- [ ] **Terms URL** live at `https://beija.app/terms`
- [ ] **Demo Google account** created with completed onboarding
- [ ] **Icon 512×512** uploaded
- [ ] **Feature graphic 1024×500** uploaded
- [ ] **5 phone screenshots** uploaded
- [ ] **Data Safety form** completed (see above)
- [ ] **Content Rating questionnaire** completed → Mature 17+
- [ ] **Target Audience** = 18+
- [ ] **App content** declarations (ads = no, IAP = no for v1)
- [ ] **AAB uploaded** to Internal testing track
- [ ] **Internal testers** added (Google groups or emails)
- [ ] **Pre-launch report** passes (Play's automated testing on real devices)
