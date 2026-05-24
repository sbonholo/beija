// Lightweight a11y smoke test — runs axe-core against the BUILT static
// index.html in jsdom. Doesn't replace a real browser audit (we can't render
// React + run the SPA in jsdom without a heavy harness), but it catches the
// document-level issues: lang, title, landmarks, head meta.
//
// For full coverage, run axe via the browser DevTools panel against each
// route — see docs/ACCESSIBILITY.md.
//
// Usage:  npm run audit:a11y

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, '..', 'dist', 'index.html');

let html;
try {
  html = readFileSync(htmlPath, 'utf8');
} catch (e) {
  console.error(`[a11y-smoke] ${htmlPath} not found. Run "npm run build" first.`);
  process.exit(1);
}

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});

dom.window.eval(axe.source);

const { window } = dom;
const result = await window.axe.run(window.document, {
  resultTypes: ['violations'],
  rules: {
    // landmark-one-main expects a <main>, which our SPA injects at runtime
    // into #beija-main. jsdom doesn't run React, so suppress here. The
    // full-app audit run in DevTools catches it.
    'landmark-one-main': { enabled: false },
    'region': { enabled: false },
  },
});

const critical = result.violations.filter((v) =>
  v.impact === 'critical' || v.impact === 'serious',
);

if (critical.length === 0) {
  console.log(`[a11y-smoke] OK — 0 critical/serious violations (${result.violations.length} minor/incomplete ignored)`);
  process.exit(0);
}

console.error(`[a11y-smoke] FAIL — ${critical.length} critical/serious violations:`);
for (const v of critical) {
  console.error(`\n  • [${v.impact}] ${v.id}: ${v.help}`);
  console.error(`    Help: ${v.helpUrl}`);
  for (const node of v.nodes.slice(0, 3)) {
    console.error(`    Target: ${node.target.join(' ')}`);
  }
}
process.exit(1);
