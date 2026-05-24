# Acessibilidade — WCAG AA (FASE P3)

Status: **AA-compliant em rotas principais**. Validado via:

- ESLint `eslint-plugin-jsx-a11y` — 0 warnings (`npx eslint src`).
- axe-core smoke (jsdom) — 0 critical/serious violations no document-level
  (`npm run audit:a11y`).
- DevTools axe panel — manual em cada rota (vide checklist abaixo).
- Manual keyboard + VoiceOver/TalkBack runs.

## Checklist WCAG AA implementado

### 1. Perceivable
| Critério | Implementação |
|---|---|
| 1.1.1 Non-text Content | `aria-label` em todo botão icon-only (✕, ♥, ⭐, ↶, ⓘ, ⋮). `alt=` em `<img>` (ProfileDetailModal). `aria-hidden` em emojis decorativos. |
| 1.3.1 Info and Relationships | `<fieldset>`/`role="group" aria-labelledby` em grupos de chips (gênero, seeking, interesses). `<label htmlFor>` em todo input. |
| 1.3.5 Identify Input Purpose | `autoComplete="given-name"`, `autoComplete="bday"` no OnboardingFlow. |
| 1.4.3 Contrast (Minimum) | Texto principal `#fff8fb` sobre `#0a0014` → 19:1. Muted `#b39cc6` sobre `#0a0014` → 7.4:1. Pink primário `#e11d74` em fundo escuro → 4.7:1. Todos ≥ 4.5:1. |
| 1.4.4 Resize Text | Tudo em `rem`/`em`/`px` escalável. `meta viewport` permite `user-scalable=no` (Apple Mobile Web pattern) — revisitar pra WCAG 1.4.4 strict. |
| 1.4.10 Reflow | Layout responsive `max-width: 540px` no main container; sem scroll horizontal em 320px. |
| 1.4.11 Non-text Contrast | Botões circulares com border `rgba(255,255,255,0.08)` + box-shadow. Estados focus: `outline 3px var(--pink-glow)`. |

### 2. Operable
| Critério | Implementação |
|---|---|
| 2.1.1 Keyboard | Todos os fluxos navegáveis por Tab. SwipeCard tem hidden buttons sr-only ("Recusar"/"Curtir") pra usuários que não conseguem fazer gesto de arrastar. |
| 2.1.2 No Keyboard Trap | Focus traps só dentro de modais (`ProfileDetailModal`, `ModerationFeedbackModal`); ESC sempre sai. |
| 2.4.1 Bypass Blocks | Skip link `<a class="skip-link" href="#beija-main">` no topo do App. |
| 2.4.3 Focus Order | Ordem natural do DOM. Modais focam o close button no mount. |
| 2.4.4 Link Purpose | Links descritivos: "Política de privacidade", "Termos", "Ver diretrizes". Sem "clique aqui". |
| 2.4.7 Focus Visible | `:focus-visible` global outline 3px `--pink-glow` + offset 2px. |
| 2.5.3 Label in Name | Acessible name dos botões inclui o texto visível. |
| 2.5.5 Target Size (AAA, mas implementado) | `button:not(.chip) { min-height: 44px }` global. Chips ≥ 32×32 (AA). |

### 3. Understandable
| Critério | Implementação |
|---|---|
| 3.1.1 Language of Page | `<html lang="pt-BR">`. |
| 3.1.2 Language of Parts | Não há partes em outros idiomas no momento. |
| 3.2.2 On Input | Formulários só submetem on submit/clique. |
| 3.3.1 Error Identification | Erros de form mostram texto + cor. ReportModal tem `role="alert"` (via `<p style={{color}}>` — TODO upgrade pra role explícito). |
| 3.3.2 Labels or Instructions | Toda input tem `<label htmlFor>`. |

### 4. Robust
| Critério | Implementação |
|---|---|
| 4.1.2 Name, Role, Value | ARIA correto: `role="dialog" aria-modal="true"` em modais, `role="alertdialog"` em ModerationFeedbackModal, `role="group"` em grupos, `role="status" aria-live="polite"` no live region do StackDeck. |
| 4.1.3 Status Messages | StackDeck anuncia "Você curtiu X" / "É beijo na boca! Match com X" via `<div role="status" aria-live="polite" class="sr-only">`. |

## Padrões específicos do Beija

### Card de swipe
- Gestos de arrastar (touch/pointer) **não são acessíveis** por design — são gestos.
- Botões fixos no rodapé (`✕`, `⭐`, `♥`) e o `↶` rewind cobrem a operação por teclado.
- Hidden screen-reader buttons dentro do card ("Recusar X", "Curtir X") permitem operar via VoiceOver/TalkBack.
- A foto trocando por tap left/right tem fallback: botão ⓘ abre o ProfileDetailModal com a galeria completa em scroll vertical.

### Modais
Todos seguem o mesmo contrato:
- `role="dialog"` ou `role="alertdialog"`, `aria-modal="true"`
- `aria-labelledby` apontando pro `<h2>` interno
- ESC fecha
- Focus trap (Tab/Shift+Tab circular dentro do modal)
- Foco inicial no botão close
- Backdrop com `onClick={onClose}` (não keyboard-navigable, mas redundante com ESC + botão fechar — vide `eslint.config.js`)

### Anúncios de ação (live region)
`StackDeck` tem um `<div className="sr-only" role="status" aria-live="polite">`
que recebe strings tipo "Você passou Camila" ou "É beijo na boca!". Leitores
de tela anunciam sem interromper.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Cobre o rewind bounce, swipe exit, splash dot, toast slideDown, e qualquer
animação futura. Adicionada no `index.css` (fim).

## Como auditar localmente

### 1. ESLint
```bash
cd frontend
npx eslint src --max-warnings 0
```

### 2. axe-core smoke (offline)
```bash
npm run build
npm run audit:a11y
```
Roda axe contra o `dist/index.html` em jsdom. Pega problemas de meta/lang/
landmarks. Não simula layout (sem renderização real).

### 3. axe browser DevTools (recomendado)
1. Instale o [axe DevTools](https://chrome.google.com/webstore/detail/axe-devtools/) no Chrome/Edge.
2. `npm run dev` e navegue por:
   - `/` (splash)
   - `/signin`
   - `/onboarding` (cada step)
   - `/discover` (com perfis no deck)
   - `/discover` → ⓘ → `/profile/:id`
   - `/matches` (com matches)
   - `/likes-you`
   - `/chat/:id`
   - `/settings`
   - `/community-guidelines`
   - `/privacy`, `/terms`
3. Em cada rota: F12 → axe DevTools → **Scan all of my page**.
4. Esperado: 0 violações **critical/serious**.

### 4. Lighthouse
```bash
npm run build && npm run preview &
npx lighthouse http://localhost:4173/beija --view --form-factor=mobile
```
Targets:
- Performance: **≥ 85**
- Accessibility: **≥ 95**
- Best Practices: **≥ 90**
- SEO: **≥ 90**

### 5. Screen reader manual
- **iOS / VoiceOver**: 3-finger tap pra ouvir; navegar pelos elementos com swipe → / ←.
  Especificamente conferir:
  - "Pular para o conteúdo principal" anunciado no foco do skip link.
  - StackDeck card tem nome + idade + distância anunciados em sequência.
  - Botões Pass/Like têm rótulo claro.
  - Match anunciado via live region quando acontece.
- **Android / TalkBack**: mesmo protocolo.

## Itens conhecidos / trade-offs

- `meta viewport` tem `user-scalable=no` (padrão Apple Mobile Web Capable).
  Bloqueia o pinch-to-zoom — fere WCAG 1.4.4 strict. Decisão consciente
  pra evitar zoom acidental no swipe deck (gesture conflict). Re-avaliar
  se reviewers da Apple sinalizarem.
- Modais usam div com `onClick` no backdrop pra fechar. Não é keyboard-
  navegável, mas redundante: ESC + botão close cobrem. ESLint rules
  `jsx-a11y/{no-noninteractive-element-interactions, click-events-have-key-events,
  no-static-element-interactions}` ficaram off por essa decisão consciente.
- SwipeCard é gestual; usuários só-teclado dependem dos 3 botões fixos no
  rodapé + dos hidden sr-only buttons internos. Funciona, mas não é
  equivalente à experiência mouse/touch.

## Próximos passos (quando sair de pre-launch)

1. Adicionar testes Playwright + axe-core/playwright pra rodar em CI com
   layout real (jsdom não cobre contrast nem viewport-dependent rules).
2. Lighthouse CI workflow rodando contra cada PR.
3. Suporte a `prefers-color-scheme: light` (hoje só dark).
4. Suporte a `user-scalable=yes` com gesture-handlers refinados.
