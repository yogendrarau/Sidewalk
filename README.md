# SIDEWALK — v3 (one standalone app)

A merchant operating system for NYC street vendors (~23,000 people, 96% immigrants), built for the
2026–27 licensing expansion. It helps one narrowly defined merchant go from uncertain and cash-only
to informed, protected, discoverable, and paid. Everything with legal consequence is computed by a
**deterministic rule engine over a versioned, citation-bearing Rulebook**; models only do bounded
jobs: transcribe, synthesize speech, extract untrusted inputs into schemas, translate merchant-approved
catalog content, and narrate rule outputs under an entailment gate.

Built to `SIDEWALK_BUILD_MASTER_APP_SPONSOR.md` v3.0: **one installable app, no channel adapters**
(invariant 10 — no messaging-channel SDKs ship in this build, ever), merchant-first commerce
(Street Storefront + the graded paper-trail loop) on a Shopify-shaped rail.

## Quick start

```bash
npm install
cp .env.example .env        # optional — everything works with zero keys (see Fallback tiers)
npm run demo                # builds app + console, serves everything on one LAN port (:4477)
npm run seed                # in another shell: demo tenants, storefronts, props → DEMO_RUNBOOK.md
```

Then:
- **Merchant app:** `http://localhost:4477` → `/app/today` (installable PWA; scan the printed LAN QR from a phone)
- **Shopper surface:** `/shop/{slug}` · `/discover` · `/order/{token}` — anonymous, sanitized projections only
- **Partner console:** `http://localhost:4477/console` — token `amara-clinic`
- **MCP server:** `POST http://localhost:4477/mcp` with `Authorization: Bearer amara-clinic`

Dev mode with hot reload (three processes): `npm run dev` → server :4477, app :5173, console :5174.

## One app, three role-scoped surfaces (§3.1)

| Surface | Routes | User | Job to be done |
|---|---|---|---|
| Merchant app | `/app/today` `/app/case` `/app/guard` `/app/store` `/app/profile` | Street vendor | Know today's next step, stay safe, launch/manage the store, fulfill pickups, build a durable record |
| Shopper storefront | `/shop/{slug}` `/discover` `/order/{token}` | Customer, anonymous | Discover an opted-in vendor, buy quickly, collect by pickup code |
| Partner console | `/console/*` (+ hidden platform proof route) | Granted caseworker | Resolve blockers, inspect provenance and rule traces, approve outreach, see merchant outcomes |

**Today** shows one highest-value action — unblock the license, publish the store, accept an order,
or mark it ready. **My Store** is the commerce loop: menu photo → structured draft → large-type price
confirmation → publish (confirm-gated) → cart QR → shopper checkout → HMAC-verified webhook → the
order lands on the merchant's screen in realtime → exactly one grade-A evidence row. Voice cash logs
land as grade B beside it and can never be upgraded.

## The three demo flows

The runbook with the live-verified summons numbers, storefront slugs, and device notes is written to
`DEMO_RUNBOOK.md` at seed time.

1. **Merchant access.** Cold open → Spanish onboarding → *"¿Puedo obtener una licencia si vendo
   comida?"* → a **spoken, cited** answer (2,200 supervisory licenses/yr through 2031, Intro 1251)
   and the honest critical path (state tax certificate, 4–6 weeks). Every legal sentence carries a
   § chip and is entailment-checked before it's spoken.
2. **Guard.** Type the fabricated ticket (verified absent from the city's OATH file at seed time) →
   the not-found script with the data-publication timestamp and a scam warning. Then the real ticket
   → its true hearing date, live from `jz4z-kudi`. Paste *"Te consigo la licencia por $2,000"* →
   advance-fee warning ($50 is the real fee).
3. **Commerce with merchant consequence.** Imperfect menu photo → draft (the unpriced item stays
   price-blank — never guessed) → confirm → publish → a cold judge scans the cart QR, sees the
   localized catalog, and checks out in ≤45 s → the HMAC-signed `orders/create` webhook writes
   exactly one order and one grade-A row → **the order appears on Rosa's screen without refresh**.
   Cash by voice lands as grade B beside it. The live demo order is never pre-seeded.

## What's inside

```
rulebook/      rulebook.v1.json (content-hashed) + vocabulary.{es,bn,ar,zh} + prices
server/        Base44-shaped substrate: entity layer (RLS/FLS), deterministic engine,
  src/engine.ts        pure evaluate() — no model calls, byte-identical traces (property-tested)
  src/gate.ts          per-sentence entailment gate (deterministic + optional model NLI)
  src/functions/       function-per-file backend: assistant_route, verify_summons/broker,
                       provision_storefront, catalog_item_upsert, create_checkout,
                       shopify_webhook, update_order_status, discover_storefronts, …
  src/realtime.ts      SSE bus (orders, catalog, notifications — the no-refresh demo beat)
pwa/           Vite React SPA — merchant surfaces (Today/My Case/Guard/My Store/Profile)
               + anonymous shopper surfaces (/shop, /discover, /order)
console/       Vite React SPA — queue, evidence+trace, commerce panel, Guard map,
               correction/feedback queue, Autopilot, eval tab
evals/         qa50 + docs30 + commerce20 + injection40 + wer40 + ux12 + pass^5 → proof slide
scripts/       seed_demo (idempotent, live-verifies props, writes DEMO_RUNBOOK.md), print_rights_card
```

## Invariants (17 — the contract; see `CLAUDE.md`)

Rules decide, models explain. Extraction returns `null`, never a guess. **No immigration-status field
exists anywhere.** RLS on every vendor entity, FLS on sensitive fields, signed expiring document URLs,
deletion honored. Every legal sentence is entailment-checked; every city-data answer carries the
dataset's publication timestamp. Filing a packet, provisioning a storefront, publishing/changing a
price, and cancelling an order **physically block** without explicit human confirmation (tested).
SIDEWALK is one app — no channel adapters, ever. The vendor is the primary user and merchant; shopper
and caseworker features exist only to serve merchant effort, trust, demand, and outcomes. Shopify is
source of truth for products, checkout, payment, and orders — SIDEWALK never handles card data and
never fabricates commerce state. Merchant copy is plain, action-led, ~grade-7. Craft is
release-blocking.

## Tests & evals

```bash
npm test                    # unit + property + gate tests: RLS/Gate-0, engine property + Gate-1,
                            # Guard/Gate-3, gate-bypass (§14), commerce loop, cross-tenant isolation
npm run evals               # full battery → EvalRun rows
npm run evals -- --report   # the proof-slide table
```

| Suite | What it proves | Value |
|---|---|---|
| qa50 (5 languages) | accuracy, citation precision/recall, ambiguous-subset abstention (abstain = correct) | run `npm run evals -- --report` |
| **SLO — legal replies cited-or-abstained** | ≥95% target with 5% error budget | run `npm run evals -- --report` |
| docs30 | per-field extraction F1, nulls-as-success, per tier | partial — see `BLOCKERS.md` |
| commerce20 | storefront provisioning idempotency; price/publication/cancel confirm gates physically block; valid/invalid/replayed webhooks; exactly-one order→grade-A evidence; cash stays grade B; zero shopper PII | run `npm run evals -- --report` |
| injection40 | attack success (system vs naive baseline), zero destructive tool actions, OWASP LLM01/02/06 | run `npm run evals -- --report` |
| wer40 | per-language word error rate | n/a (browser ASR tier) — see `BLOCKERS.md` |
| ux12 | 6 merchant + 6 shopper/caseworker tasks on a mid-range phone | human-run checklist: `evals/ux12.jsonl` |
| pass^5 | byte-identical traces across ≥25 headless runs, bootstrap CI | run `npm run evals -- --report` |

CI rule: any diff in `server/src/functions/`, `server/src/entities.ts`, `prompts/`, or the Shopify
handlers reruns qa50 + injection40 + commerce20 + RLS tests.

## Fallback tiers (works with zero keys — `BLOCKERS.md`)

Every external is behind a fallback so the demo never depends on a live account onstage. Add keys in
`.env` to upgrade quality without code changes:

| Capability | With key | Zero-key fallback |
|---|---|---|
| Explanation | Gateway LLM (Claude) under the NLI gate | deterministic rule-engine templates (the spec's final tier) |
| Document/menu extraction | Anthropic vision + constrained decode | sha-matched fixture gold → manual (null) |
| ASR / TTS | managed Whisper / ElevenLabs | browser `SpeechRecognition` / `speechSynthesis` (es works on macOS/iOS) |
| Entailment | DeBERTa-class NLI endpoint | deterministic citation + verbatim-number check (always on) |
| Shopify | real dev store: catalog + hosted checkout + webhook order mirror | simulated storefront/checkout firing the **same real HMAC-signed** `orders/create` webhook at our own verify path |

NYC Open Data (Socrata) works with **no token**; a token only raises the rate limit. Live queries are
captured to `fixtures/socrata/` so the verifiers still work offline.

## Live NYC datasets used

`jz4z-kudi` OATH hearings (summons verifier) · `w7w3-xahh` business registry (broker verifier) ·
`ptev-4hud` license applications (status polling) · `erm2-nwe9` 311 (placement risk note) ·
`tvpp-9vvx` permitted events. All queried live; each answer carries the dataset's publication timestamp.

## Language tiers

T1 gold (es, bn, ar, zh, en): reviewed templates + vocabulary; all demo flows. T2/T3: full
functionality with the machine-translation honesty line — never a silent downgrade. **T2 → T1
promotion:** a native reviewer signs the template pack in `templates.ts` + 10 WER clips measured.
MCP ships with per-org bearer tokens today; the OAuth upgrade is a drop-in on the `/mcp` route.

## TODO(law) / TODO(data) — awaiting human transcription

Placement distances and cart dimensions (Admin Code §§), cart-recovery deadlines, the restricted-street
list, DOHMH commissary list + fee benchmarks. Each has the abstain path wired: the engine emits a
physical checklist + referral and never guesses a statutory number.

## Base44 mapping

This repo emulates the Base44 substrate 1:1 per the settled build-target decision (`CLAUDE.md`;
port is mechanical): `server/src/entities.ts` = Base44 entities (RLS/FLS declared in schema, enforced
in the data layer), `server/src/functions/*.ts` = Base44 TypeScript backend functions
(schema-validated I/O `{ok, data|error, timing_ms}`), `server/src/realtime.ts` (SSE) = Base44
realtime subscriptions, `AutomationRun` rows + interval runners = Base44 scheduled/event automations,
`server/src/modelgw.ts` = Base44 Invoke LLM / AI Gateway. Secrets stay server-side; the SPA is the
custom React frontend the spec asks to keep.
