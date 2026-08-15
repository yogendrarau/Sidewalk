# SIDEWALK — agent contract

Build master: `../sidewalk aiden/SIDEWALK_BUILD_MASTER_APP_SPONSOR.md` (v3.0 · standalone-app ·
merchant-first · sponsor-aligned). One app, no channel adapters. Local repo emulates the Base44
substrate 1:1 (mapping below) per the settled build-target decision.

## Invariants (§2 — violations are release-blocking)

1. Rules decide; models explain. No model call inside eligibility, placement, sequencing, fee, or deadline computation.
2. Extraction outputs `null` for anything unreadable. Never a plausible guess.
3. No immigration-status data: no field, no question, no log. Volunteered statements are not persisted.
4. Row-level security (RLS) on every vendor-scoped entity; field-level security (FLS) on sensitive fields; signed expiring URLs on documents; deletion on request honored.
5. Every legal-consequence sentence is entailment-checked against its cited rule before send; fail → regenerate once → fall back to the rule engine's template.
6. Every city-data answer carries the dataset's publication timestamp. Negative OATH results say "not in the city's file as of the last data publication."
7. `TODO(law)` protocol: statutory values enter only by human transcription from the source, with the § citation inline. Never invent statutory numbers, fees, distances, or dataset IDs.
8. Displayed confidence comes only from calibrated log-probabilities or conformal thresholds. Never ask a model how confident it is.
9. Filing a packet, provisioning a storefront, publishing/changing a price, and cancelling an order require explicit human confirmation, and each gate must physically block (tested).
10. SIDEWALK is one app. No messaging-channel SDKs, adapter layer, or external chat dependency ships in this build.
11. Untrusted content (documents, forwarded messages, letters) is processed only by tool-less, schema-constrained extraction functions; its raw text never enters the planning agent's context.
12. Settled decisions in build master §20.1 are not reopened.
13. The vendor is the primary user and merchant. Shopper and caseworker features ship only when they serve merchant effort, trust, demand, or outcomes.
14. Shopify is source of truth for products, checkout, payment, and orders. SIDEWALK never handles card data and never fabricates commerce state.
15. Base44 owns auth, entities, RLS/FLS, functions, secrets, automations, realtime, hosting (emulated locally; port is mechanical). No second backend.
16. Merchant-facing copy is plain, scannable, translatable, action-led, ~grade-7 reading level. Guide; do not prescribe. No jargon, dark patterns, or unexplained confidence scores.
17. Craft is release-blocking: mobile-first, WCAG-aware, fast on a mid-range phone, coherent empty/loading/error states, consistent terminology, no exposed debug UI or fake data on live demo routes.

## Commands (§15)

```
npm run dev          # server :4477 + app :5173 + console :5174
npm run demo         # build everything, serve on one LAN port (:4477)
npm run seed         # scripts/seed_demo.ts (idempotent; live-verifies summons props)
npm test             # unit + property + gate tests (vitest)
npm run evals        # full battery → EvalRun rows
npm run evals -- --report   # emits the proof-slide table
```

CI rule: any diff in `server/src/functions/`, `server/src/entities.ts`, `prompts/`, or the Shopify
handlers reruns qa50 + injection40 + commerce20 + RLS tests.

## Local shape → Base44 mapping

- `server/src/entities.ts` = Base44 entities (RLS/FLS declared in schema, enforced in the data layer)
- `server/src/functions/*.ts` = Base44 TypeScript backend functions (schema-validated I/O `{ok, data|error, timing_ms}`)
- `server/src/realtime.ts` (SSE) = Base44 realtime subscriptions
- `AutomationRun` rows + interval runners in `index.ts` = Base44 scheduled/event automations
- `server/src/modelgw.ts` = Base44 Invoke LLM / AI Gateway (Anthropic key or fallback tiers)
- Blocked externals → fallback tier + entry in `BLOCKERS.md` (§0.4)

## Surfaces (§3.1)

- Merchant app: `/app/today` `/app/case` `/app/guard` `/app/store` `/app/profile` (pwa/ SPA)
- Shopper: `/shop/{slug}` `/discover` `/order/{token}` (same SPA, anonymous, sanitized projections only)
- Console: `/console/*` (+ hidden `/console/platform` proof route)
