# CI / CD

Workflows em `.github/workflows/`. Resumo + como rodar local + troubleshooting.

## Workflows

| Workflow | Trigger | Bloqueante? | Propósito |
|---|---|---|---|
| `ci.yml` | push/PR em `main` | sim | Lint + typecheck + build web + a11y smoke + Android debug + placeholder test |
| `lighthouse.yml` | push/PR em `main`, manual | **não** (info) | Performance + a11y + best practices + SEO scores |
| `release-play.yml` | manual (`workflow_dispatch`) | n/a | Play Store AAB build + upload |
| `release-testflight.yml` | manual | n/a | iOS TestFlight (skeleton — fastlane comentado) |
| `deploy-pages.yml` | push em `main` | sim | Deploy `dist/` para GitHub Pages |
| `process-deletions.yml` | cron diário | sim | Backstop pro edge fn `process_pending_deletions` |

## Jobs em `ci.yml`

```
lint  ─┬─►  build     ─►  a11y
       ├─►  test      (placeholder)
       └─►  android-debug
```

### `lint`
`tsc --noEmit` + `npx eslint . --max-warnings 0`. Mais rápido — gate pra tudo.

### `build`
`npm run build`. Mede tamanho de cada chunk, sobe `dist/` como artifact.

### `test`
Placeholder. Próxima fase: vitest + Playwright.

### `a11y`
Roda `npm run audit:a11y` (axe-core via jsdom sobre `dist/index.html`).
Detalhes em [`ACCESSIBILITY.md`](ACCESSIBILITY.md).

### `android-debug`
`npx cap sync android` + `./gradlew assembleDebug`. Empacota o APK debug
do app Capacitor + sobe como artifact pra teste interno em devices.

**Histórico**: este job estava vermelho até a FASE P6 — runner não tinha
Android SDK platform `android-36` instalado. Fix:
- `android-actions/setup-android@v3` instala `platforms;android-36`,
  `build-tools;36.0.0`, `platform-tools` antes do gradle.
- `actions/cache@v4` em `~/.gradle/caches` + `~/.gradle/wrapper` corta
  ~3 min de download por run.
- `--stacktrace` no gradle pra próximo failure ser mais legível.
- Em failure, sobe `frontend/android/app/build/reports/` como artifact.

## Rodar local

### Frontend (todos os gates do CI)
```bash
cd frontend
npm ci --legacy-peer-deps
npm run lint        # tsc --noEmit
npx eslint src --max-warnings 0
npm run build       # vite build (gera dist/)
npm run audit:a11y  # axe-core smoke
```

### Android debug build
Pré-requisito: Android SDK + JDK 17. Setup local:

```bash
# JDK 17 (macOS)
brew install --cask temurin@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Android SDK via Android Studio ou cmdline-tools
# Instale: platforms;android-36, build-tools;36.0.0, platform-tools
sdkmanager --install "platforms;android-36" "build-tools;36.0.0" "platform-tools"

# Build
cd frontend
npm ci --legacy-peer-deps
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# APK em app/build/outputs/apk/debug/app-debug.apk
```

### Lighthouse local
```bash
cd frontend
npm run build
npx vite preview --port 4173 &
npx lighthouse http://localhost:4173/ --view --form-factor=mobile
```

## Troubleshooting

### `Could not find platforms;android-36`
Falta SDK no runner. Em CI: o step `Set up Android SDK` resolve. Local:
`sdkmanager --install "platforms;android-36"`.

### `Could not resolve com.android.tools.build:gradle:8.13.0`
Bloqueio de rede pra `dl.google.com` — comum em sandboxes corporativos.
Sem fix puro de código; verificar firewall/proxy.

### `License for package Android SDK Platform 36 not accepted`
```bash
yes | sdkmanager --licenses
```
Em CI: step `Accept Android SDK licenses` faz isso defensivamente.

### `Java home is set to JDK 21 but AGP requires 17`
AGP 8.13 suporta JDK 17 e 21. Se o seu sistema usa 21 e quebra, force
JDK 17 via `JAVA_HOME=...`.

### `npx cap sync android` muda arquivos versionados
Esperado — `capacitor.build.gradle` e `capacitor.settings.gradle` são
regenerados a partir do `package.json`. Não comitar se diferenças não
intencionais (regen vai sobrescrever).

### Gradle out-of-memory
Aumentar `org.gradle.jvmargs=-Xmx2g` em `frontend/android/gradle.properties`.

## Diferenças por runner

| Runner | Quando usar | Notas |
|---|---|---|
| `ubuntu-latest` | Tudo exceto iOS | Android SDK via setup-android@v3. Atualmente Ubuntu 24.04. |
| `macos-latest` | iOS (xcodebuild + fastlane) | Pré-instalado: Xcode + Ruby. Java vem via setup-java. Custa 10× ubuntu — só usar pra iOS. |

## Secrets / vars necessários (build verde sem eles)

Todos os workflows funcionam com placeholders. Setando os reais via
**Settings → Secrets and variables → Actions**:

| Nome | Tipo | Usado por |
|---|---|---|
| `VITE_SUPABASE_URL` | var | ci, release-play, deploy-pages |
| `VITE_SUPABASE_ANON_KEY` | var | idem |
| `VITE_GOOGLE_IOS_CLIENT_ID` / `VITE_GOOGLE_WEB_CLIENT_ID` | secret | release-play, release-testflight |
| `BEIJA_KEYSTORE_BASE64` / `BEIJA_KEYSTORE_PASSWORD` / `BEIJA_KEY_ALIAS` / `BEIJA_KEY_PASSWORD` | secret | release-play |
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | secret | release-play (futuro upload) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | process-deletions |

## Status badges (README)

```md
![CI](https://github.com/sbonholo/beija/actions/workflows/ci.yml/badge.svg)
![Lighthouse](https://github.com/sbonholo/beija/actions/workflows/lighthouse.yml/badge.svg)
```
