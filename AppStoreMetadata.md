# App Store Metadata — Beija

Reference document for App Store Connect submission. Update when copy or assets change.

---

## App Identity

| Field | Value |
|---|---|
| **App name** | Beija |
| **Subtitle** | Encontre matches no Brasil |
| **Bundle ID** | io.beija.app |
| **Primary category** | Lifestyle |
| **Secondary category** | Social Networking |
| **Age rating** | 17+ |
| **Primary locale** | Portuguese (Brazil) |
| **Secondary locale(s)** | English (US) — optional, recommended for App Store global discoverability |
| **Pricing** | Free (with future in-app purchases) |

### Why 17+

The app facilitates connections between adults and includes:
- Frequent/intense mature/suggestive themes
- User-generated content (photos, bios, messages) with the potential for adult-oriented references
- Profiles that may include implied romantic/sexual interest

Per Apple's age rating guidance, dating apps require **17+**. We are not requesting "Unrestricted Web Access" or "Gambling".

---

## Keywords

App Store keywords field has a 100-character limit. Use commas, no spaces between (Apple ignores spaces but they count toward the 100).

### PT-BR (primary)
```
namoro,relacionamento,match,encontros,paquera,conhecer,pessoas,brasileiro,app,solteiros
```
*Count: 96 characters.*

### EN (secondary, if enabling English locale)
```
dating,match,brazilian,relationships,singles,romance,social,meet,people,love
```
*Count: 78 characters.*

---

## Descriptions

### Short description / Subtitle (30 chars max — App Store displays under name)
```
Encontre matches no Brasil
```
*(25 chars)*

### Promotional text (170 chars — editable without resubmission)
```
O app de relacionamentos feito pra brasileiros. Conheça pessoas perto, faça matches e converse sem complicação. 18+. Segurança e privacidade em primeiro lugar.
```
*(170 chars)*

### Description (up to 4000 chars; ~2000 recommended)

```
Beija é o app de relacionamentos feito por brasileiros, pra brasileiros.

Cansou de apps internacionais que não entendem como a gente curte conhecer alguém? O Beija foi pensado pra simplificar e tornar mais seguro o encontro de pessoas perto de você.

✨ POR QUE BEIJA?

• Foco no Brasil — eventos, cidades e cultura local entendidos de verdade
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

• Sign in com Apple ou Google — sem precisar de senha
• Match-on-mutual-swipe inteligente, com filtros de gênero, idade e distância
• Bloqueio e denúncia em 1 toque
• Chat com confirmação de leitura
• Notificações em tempo real de matches e mensagens
• Excluir conta direto no app (30 dias de janela pra reativar)

🛡️ COMPROMISSO COM SEGURANÇA

• 100% maior de 18 anos
• Verificação automática de foto (em desenvolvimento)
• Equipe humana respondendo denúncias em <24h
• Bloqueio instantâneo de usuários abusivos
• Sem rastreamento publicitário cross-site

📱 REQUISITOS

• iOS 14 ou superior
• iPhone, iPad
• Conexão à internet

🇧🇷 FEITO NO BRASIL

Beija é uma startup brasileira independente. Pensado em São Paulo, Rio, Belo Horizonte, Salvador, Curitiba e em todo canto do país. Sua opinião importa — nos escreva em support@beija.app.

Termos: https://beija.app/terms
Privacidade: https://beija.app/privacy
```

### What's New (release notes — example for v1.0)
```
🎉 Bem-vindo ao Beija!

A primeira versão do app de relacionamentos feito pra brasileiros.

• Crie seu perfil em 60 segundos
• Encontre pessoas perto de você
• Match e converse em 1 toque
• Segurança e privacidade respeitadas

Conta pra gente o que achou: support@beija.app
```

---

## URLs

| Field | Value |
|---|---|
| **Support URL** | https://beija.app/support |
| **Marketing URL** | https://beija.app |
| **Privacy Policy URL** | https://beija.app/privacy |
| **EULA** | Use Apple's standard EULA (no custom one required at v1.0) |

---

## Screenshots

### Required device classes (Apple as of 2026)
1. **6.7" / 6.9" iPhone display** (1290 × 2796) — iPhone 15 Pro Max class
2. **6.5" iPhone display** (1284 × 2778) — iPhone 11 Pro Max / 14 Plus class
3. **5.5" iPhone display** (1242 × 2208) — iPhone 8 Plus class (legacy, still recommended)
4. **iPad** screenshots are optional unless the app supports iPad

### Set composition (5 screenshots minimum, 10 max per locale)

Pre-launch screenshot specs — use Figma or Xcode simulator to generate:

| # | Screen | Headline overlay (PT-BR) | What to show |
|---|---|---|---|
| 1 | **Swipe deck** | "Conheça gente perto." | Top card with photo, name, age, NOPE/LIKE peek indicators visible |
| 2 | **Match modal** | "É beijo na boca!" | Confetti + two photos with gold borders + "Vocês deram match!" |
| 3 | **Chat** | "Converse sem complicação." | Conversation with another user — clean message bubbles, your own message + theirs |
| 4 | **Profile / discovery filters** | "Você no controle." | Profile setup with photo grid 2×3, age slider, distance slider |
| 5 | **Sign in screen** | "Entre em segundos." | Apple + Google buttons, Beija logo gradient prominent |

Use the dark theme (matches the app). Brand colors only — no fake App Store frames or device mockups inside screenshots.

### Optional 6th screenshot
| 6 | **Block / Report** | "Sua segurança primeiro." | Report modal mid-flow with reason options |

---

## App Privacy "Nutrition Labels" (Apple privacy section)

Apple requires declaring data collection per category. Beija submission:

### Data Used to Track You
**None.** We do not use ad networks, cross-site trackers, or data brokers.

### Data Linked to You
- **Identifiers:** User ID
- **Contact info:** Email (only if user opts in via Apple Private Email or Google)
- **Location:** Coarse location (city / approximate)
- **User content:** Photos, messages, profile info (bio, interests)
- **Usage data:** Product interaction (swipes, matches)
- **Diagnostics:** Crash logs

### Data Not Linked to You
- Aggregated, anonymized analytics for product improvement.

---

## Apple Sign In requirement

Per guideline **4.8**, if we offer third-party login (Google), we **must** also offer **Sign in with Apple**. We comply: both are offered with equal prominence on the sign-in screen.

---

## Account Deletion (guideline 5.1.1(v))

Compliant. Users can delete their account in-app via Settings → "Excluir conta", with:
- 3-step confirmation
- 30-day cooldown window
- Full data deletion after the window
- Soft-delete (hide from app) effective immediately

---

## Demo account for App Review

Apple reviewers will need to test core flows. Provide:

- **Demo Apple ID:** (to be created — review@beija.app)
- **Demo Google account:** (to be created)
- **Pre-seeded test data:** at least 5 mock profiles in São Paulo area to enable swipe testing
- **Reviewer notes:**
  > "Beija is a dating app for Brazilian adults. Sign in with the provided Apple ID. The app will guide you through onboarding (60s). After onboarding, swipe right on any profile to test the match flow — one of the test profiles is configured to auto-match. Test the Block and Report flows via the profile detail screen. Test account deletion via Settings → Excluir conta."

---

## Pre-submission checklist

- [ ] App icon 1024×1024 (PNG, no transparency, no rounded corners)
- [ ] Splash screens for all device classes
- [ ] All 5+ screenshots rendered for required device classes, both locales
- [ ] Privacy Policy hosted at https://beija.app/privacy
- [ ] Terms of Service hosted at https://beija.app/terms
- [ ] Support page hosted at https://beija.app/support with contact form
- [ ] Demo account created and tested end-to-end
- [ ] Push Notifications APNs key uploaded to App Store Connect
- [ ] Sign in with Apple capability enabled in Xcode + provisioning profile
- [ ] Build uploaded via Xcode and selected in App Store Connect
- [ ] Age rating questionnaire completed (17+)
- [ ] App Privacy questionnaire completed (see "Nutrition Labels" above)
- [ ] In-app purchase products defined (if shipping v1.0 with premium tier — otherwise skip)
- [ ] Beta testing via TestFlight completed with at least 25 external testers
- [ ] Crash-free rate >99% over last 7 days of TestFlight
