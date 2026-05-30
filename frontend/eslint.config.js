import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import js from '@eslint/js';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'ios/**', 'android/**', 'public/**', '*.config.ts', '*.config.cjs'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', navigator: 'readonly',
        crypto: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        Image: 'readonly', Blob: 'readonly', FormData: 'readonly', File: 'readonly', FileReader: 'readonly',
        HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly',
        HTMLDivElement: 'readonly', HTMLImageElement: 'readonly', HTMLButtonElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        PointerEvent: 'readonly',
        KeyboardEvent: 'readonly', GeolocationPosition: 'readonly', alert: 'readonly', confirm: 'readonly',
        atob: 'readonly', btoa: 'readonly', Uint8Array: 'readonly', AbortController: 'readonly',
        process: 'readonly',
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: { react: { version: '18.3' } },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      ...jsxA11y.flatConfigs.recommended.rules,
      // Modal backdrops (div with onClick→close) and message-bubble context
      // menus are legitimate UI patterns here: every modal ships an explicit
      // close button + ESC handler, every long-press context menu has a
      // mouseup-anywhere dismiss. Keyboard paths are covered, just not by
      // these elements. See docs/ACCESSIBILITY.md.
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
    },
  },
  // Node scripts (test smoke, tooling) — need Node globals + relaxed unused.
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.{js,mjs}', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
