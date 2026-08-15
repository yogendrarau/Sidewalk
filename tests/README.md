# SIDEWALK prototype checks

The automated suite is intentionally split between deterministic contracts and a network-free judge journey.

- `unit/i18n.test.js` verifies the seven-locale registry, namespace/key parity, interpolation parity, and non-empty catalogs.
- `unit/demoCore.test.js` proves all localized preparation questions produce the same rule decision, trace, and hash; verifies abstention and localized `$12` parsing; and hashes the bundled speech fixtures.
- `unit/integration-boundaries.test.js` checks session scoping, locale schemas, exact-hash speech fallback, RTL-safe styling, and the absence of payment, messaging, filing, or outreach provider initialization.
- `e2e/*.spec.js` blocks network calls and exercises each language in clearly visible sample mode, including Ask, Check, My Sales, Arabic RTL, console independence, persistence, and target viewport widths.

Run locally with:

```sh
npm run test:unit
npx playwright install chromium
npm run test:e2e
```

The offline browser suite requires no Base44 token or external-provider secret and never fakes a live result. An opt-in OATH rehearsal is available against a real deployed demo session:

```sh
LIVE_BASE_URL=https://your-deployed-app.example \
LIVE_DEMO_SESSION_ID=YOUR_SESSION npm run test:e2e:live
```

Microphone/device ASR remains a manual venue-device rehearsal for the locales marked `liveSpeechValidated`; it is deliberately not presented as a reliable headless-browser assertion.
