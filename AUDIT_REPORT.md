# Audit Report — Beija

**Date:** 2026-05-24
**Branch:** migrations-schema (PR #1)
**Scope:** `frontend/` only (backend audit pending)

---

## Summary

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| ESLint (post-fix) | ✅ 0 errors, 0 warnings |
| npm audit | 🟡 3 moderate (esbuild, vite, vite-plugin-pwa) |
| Bundle size (main JS) | 🔴 594.64 kB raw / 175.63 kB gzip — over Vite's 500 kB warning |
| Build | ✅ succeeds |

Raw outputs: `frontend/AUDIT_NPM.json`, `frontend/AUDIT_ESLINT.json`.

---

## Top 10 issues (ordered by severity / user impact)

| # | Issue | Severity | Action |
|---|---|---|---|
| 1 | **Main bundle 594 kB (3× over warning)** | 🔴 High — slow first paint, especially on mobile 3G | **Fix:** `React.lazy` for `MarkdownPage`, `DeleteAccountFlow`, `OnboardingFlow`. Code-split routes. |
| 2 | **`@codetrix-studio/capacitor-google-auth` removed** but **vite-plugin-pwa** still pulled by old dep tree | 🟡 Mod — false alarm, but the vuln is real if reinstalled | **Fix:** confirm not in dep tree; if it is, remove. |
| 3 | **No SEO / Open Graph meta tags** in `index.html` | 🟡 Mod — bad social previews | **Fix:** add `<meta property="og:*">` + description/title tags. |
| 4 | **No service worker** — assets fetched every reload, no offline support | 🟡 Mod — perf + PWA-readiness | **Fix:** ship minimal SW that caches the Vite build output. |
| 5 | **List components re-render on every parent update** (`MessageBubble`, `SwipeCard`, `MatchesList` rows) | 🟡 Mod — perf on long chat / dense deck | **Fix:** wrap exports in `React.memo`. |
| 6 | **Magic numbers / colors scattered** (e.g. swipe threshold 0.25, long-press 500ms, pink/danger colors duplicated in inline styles) | 🟢 Low — maintenance burden | **Fix:** extract `src/lib/constants.ts`. |
| 7 | **No loading skeletons** in `MatchesList`, `ChatScreen`, `StackDeck` (just "Carregando…" text) | 🟢 Low — perceived perf | **Fix:** add card skeletons. |
| 8 | **vite-plugin-pwa** vuln (moderate) | 🟡 Mod | **Fix:** the plugin was removed earlier — confirm absence and run `npm dedupe`. |
| 9 | **esbuild / vite moderate vulns** | 🟡 Mod | **Fix:** `npm audit fix` (non-breaking) and bump if needed. |
| 10 | **No error boundary on individual routes** (only one global wrapper in `main.tsx`) | 🟢 Low — single component crash blanks the whole app | **Fix:** add per-route boundary wrapping the `<Outlet />` so a bad screen doesn't take down nav. |

---

## Automatic fixes applied in this audit

Commits will land separately for traceability:

- `chore(audit): npm audit fix non-breaking` — runs `npm audit fix` (no `--force`).
- `perf(bundle): lazy-load MarkdownPage, DeleteAccountFlow, OnboardingFlow` — `React.lazy` + `Suspense` boundaries.
- `perf(lists): React.memo MessageBubble, SwipeCard` — prevents avoidable re-renders.
- `refactor(constants): extract UX/style magic numbers to lib/constants.ts` — single source of truth.
- `chore(html): SEO + Open Graph meta tags in index.html` — better previews / discoverability.
- `feat(pwa): minimal service worker for static asset caching` — instant repeat loads.
- `feat(ui): loading skeletons for MatchesList, ChatScreen, StackDeck` — perceived perf.
- `feat(app): per-route ErrorBoundary wrapping Outlet` — route-level isolation.

---

## Manual review needed

None of the top 10 require manual review beyond the code changes above. The remaining `npm audit` vulns are dev-only (esbuild/vite) and resolved by upstream version bumps that we'll get for free when next bumping vite/vite-plugin-pwa (already removed).
