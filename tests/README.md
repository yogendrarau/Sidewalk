# SIDEWALK prototype checks

The automated suite is intentionally split between deterministic contracts and a network-free judge journey.

- `unit/i18n.test.js` verifies the seven-locale registry, namespace/key parity, interpolation parity, and non-empty catalogs.
- `unit/demoCore.test.js` proves all localized preparation questions produce the same rule decision, trace, and hash; verifies abstention and localized `$12` parsing; and hashes the bundled speech fixtures.
- `unit/integration-boundaries.test.js` checks session scoping, locale schemas, exact-hash speech fallback, RTL-safe styling, and the absence of payment, messaging, filing, or outreach provider initialization.
- `unit/marketplace-contract.test.js` checks the dedicated buyer/vendor account-role schema, closed prototype persistence record, Base44 sync gateway, exact empty-state copy, absence of commerce entities, and absence of commerce-provider initialization.
- `unit/self-service-contract.test.js` locks the required product positioning, AI Support Console framing, optional-review boundary, referral destinations, and local-only handoff language.
- `e2e/*.spec.js` blocks network calls and exercises first-run role selection, buyer/vendor persistence and role-safe routing, intentional buyer empty states, seller zero metrics, embedded verification preparation, all seven vendor-language journeys, referral routing, routine self-service, exceptional abstention, hidden internal console/proof surfaces, and 320/390/desktop overflow checks.

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
