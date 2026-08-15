# SIDEWALK — How the Whole App Works

*A plain-language + technical walkthrough of everything in this repo: what was built, why it's shaped this way, and how each piece functions. Built to `SIDEWALK_BUILD_MASTER_APP_SPONSOR.md` v3.0 for the Base44 × Shopify hackathon.*

---

## 1. What SIDEWALK is

NYC has ~23,000 street vendors (96% immigrants). For forty years the general vending license was capped at 853 with a closed waitlist. New local laws open the system up: 2,200 supervisory food licenses per year through 2031, and ~10,500 general licenses starting 2027. The city office running this expansion is months old and has no public casework software. Vendors are multilingual, cash-heavy, and heavily targeted by "license broker" scams.

SIDEWALK is a **merchant operating system** for one vendor — call her Rosa. It takes her from *uncertain and cash-only* to *informed, protected, discoverable, and paid*:

1. **Today (merchant home)** — an installable, voice-first web app that always shows one clear next action across licensing and commerce, answers legal questions with citations, reads government letters, photographs documents, and tracks deadlines.
2. **Guard (fraud shield)** — photograph or type a summons number → verified against the city's *live* court records in seconds; paste a broker pitch → checked against the city business registry; every answer stamped with the data's publication date.
3. **Street Storefront (commerce)** — photograph a menu → review a structured draft → confirm → a published microstore with a physical QR. Shoppers scan, browse in their language, pay by card; the order appears on Rosa's screen **in real time**. Card orders become **grade-A** evidence, spoken cash logs become **grade-B** — a graded business ledger that supports her license casework.
4. **Caseworker console** — for the legal clinic serving vendors: case queue, document provenance, decision traces, commerce panel, scam radar, correction queue, live eval numbers.

## 2. The core idea: rules decide, models explain

Everything with **legal consequence** is computed by a deterministic rule engine over a versioned, citation-bearing **Rulebook** (`rulebook/rulebook.v1.json`, identified by content hash). AI models never decide anything legal. They do five bounded jobs:

- transcribe speech (ASR)
- synthesize speech (TTS)
- extract untrusted images into strict JSON schemas (documents, summonses, letters, menus)
- translate merchant-approved content
- **narrate** rule-engine output — and every narrated sentence passes a per-sentence **entailment gate** against its cited rule before it's spoken; a failed sentence gets one regeneration, then falls back to a deterministic template

This means the model is replaceable and the answers are reproducible: the same facts produce **byte-identical decision traces** (property-tested; that's the `pass^5 = 1.0` metric).

Seventeen invariants in `CLAUDE.md` enforce this contract. The load-bearing ones:

- Extraction returns `null` for anything unreadable — never a plausible guess (so a menu item with no printed price stays price-less until Rosa types one).
- **No immigration-status data exists anywhere** — no field, no question, no log; the entity layer throws if any code even tries to write one.
- Every city-data answer carries the dataset's publication timestamp; a negative result says "not in the city's file **as of the last data publication**," never "this is fake."
- Statutory numbers enter the Rulebook only by human transcription with the § citation inline; where the law hasn't been transcribed yet (`TODO(law)`), the engine **abstains** and emits a physical checklist instead of guessing.
- Filing a packet, provisioning a storefront, publishing/changing a price, and cancelling an order each require explicit human confirmation, and each gate **physically blocks** (tested — the server 403s any request missing the literal confirmation).

## 3. Repo map

```
sidewalk/
  CLAUDE.md            the 17 invariants + commands (the agent contract)
  BLOCKERS.md          every fallback taken, honestly logged
  DEMO_RUNBOOK.md      regenerated at seed time: props, devices, 3-minute script
  rulebook/            rulebook.v1.json (content-hashed) + prices + es/bn/ar/zh vocabulary
  prompts/             agent_system / extractor / explainer / guard / translate (files, never inlined)
  config/lang_tiers.json  T1 gold languages / T2 auto-translated / T3 best-effort
  server/src/
    entities.ts        the data layer: 18 entities, RLS/FLS, public projections
    engine.ts          pure evaluate() — eligibility, sequencer, docs, fees; no I/O, no clock
    rulebook.ts        loads + content-hashes the rulebook; uncited rules are dropped
    gate.ts            per-sentence entailment gate (deterministic + optional model NLI)
    modelgw.ts         AI gateway: Anthropic narration/vision/NLI or fallback tiers
    extraction.ts      quarantined schema-constrained extraction chain (vlm→fixture→manual)
    templates.ts       deterministic reply templates, 5 languages, [n] citation markers
    socrata.ts         NYC Open Data client with live→fixture fallback + dataset timestamps
    identity.ts        device credential → stable vendor id (Base44 Auth stand-in)
    realtime.ts        SSE bus (Base44 realtime stand-in)
    facts.ts           bi-temporal vendor memory (contradictions invalidate, never overwrite)
    mcp.ts             read-only MCP server for org tooling (RLS-scoped)
    index.ts           the Express host: every route below
    functions/         25 backend functions, each {ok, data|error, timing_ms} + telemetry
  pwa/                 ONE React SPA: merchant app + shopper storefront
  console/             caseworker console SPA (served at /console)
  evals/               qa50, injection40, commerce20, pass^5, ux12 + runner → proof slide
  scripts/seed_demo.ts idempotent demo seed (live-verifies its own props)
  fixtures/            captured Socrata rows, document/menu props, extraction gold
```

## 4. The data layer (Base44-shaped entities)

`server/src/entities.ts` is a one-file emulation of Base44's entity system, and the **only** thing that touches SQL. Every read/write passes a `Ctx`:

- `{kind:"vendor", vendor_id}` — sees only its own rows (**row-level security**)
- `{kind:"org", org_id, grants:[...]}` — a caseworker org sees only vendors that granted it access
- `{kind:"system"}` — backend functions only

Sensitive fields (e.g. `base44_user_id`, order `fulfillment_code_hash`) are stripped for non-admin readers (**field-level security**). Document images are served only through **signed, expiring URLs**. `POST /api/delete_me` purges every row for a vendor. Creating any field matching `/immigration|citizenship|visa_status/` throws.

Key entities: `Vendor`, `CaseFile`, `DocumentImage` (+ quarantine state), `ExtractedField` (+ calibrated confidence + human corrections), `RuleEvaluation` (the decision traces), `VerificationCheck`, `Fact` (bi-temporal memory), `Deadline`, `AppNotification`, `Storefront`, `CatalogItem`, `CommerceOrder`, `EvidenceRecord` (grade A/B), `GuardEvent`, `AreaSignal` (aggregates only, no vendor refs), `MerchantFeedback`, `WebhookReceipt` (replay ledger), `AutomationRun`, `Org`, `OutreachDraft`.

**Public shopper projections**: anonymous reads (`/api/shop/*`, `/api/discover`, `/api/order/:token`) never see entity rows — they see allowlist projections (`publicStorefront` = 7 fields, `publicItem` = 7, `publicOrder` = 8). Anything not named in the allowlist is dropped, so future fields **fail closed**. Tests enumerate the returned keys.

## 5. The Rulebook and the engine

The Rulebook has six record types — `eligibility`, `sequence`, `document_requirement`, `fee`, `placement`, `price`, `vocabulary` — each carrying a human-transcribed `citation` and `last_verified` date. A rule without a citation is treated as absent (the engine abstains rather than use it).

`evaluate(rulebook, facts)` is a **pure function**:

- **Eligibility**: matches facts against `if` conditions → track assignment (food → `supervisory_food`, 2,200/yr through 2031, cite Intro 1251; merchandise → `general_2027`, ~10,500). A missing fact produces a *typed abstention naming the fact*, which drives the assistant's clarifying question.
- **Sequencer**: topological sort of `sequence` records filtered by completed steps → "today's next step" with duration ranges and the honest total timeline. The NYS sales-tax certificate is the critical path (4–6 weeks), which is why it's always first.
- **Documents**: required vs. present → missing list (with the explicit note that a **foreign passport is accepted** as identity).
- **Fees**: $50/2yr with the veteran waiver surfaced automatically.
- **Placement**: all distance/dimension values are `TODO(law)` → the engine returns a partial verdict + a physical measuring checklist + referral, never an invented number.

Every evaluation writes a `RuleEvaluation` row: `rules_fired` (rule id → inputs → outcome → citation) — the trace the console renders.

## 6. The assistant loop (what happens when Rosa talks)

`POST /api/inbound` → `assistant_route`:

1. **Persist** the message (unless guard flags it as sensitive — then `[withheld]`).
2. **guard_screen** classifies for injection / scam pattern / PII oversharing / immigration mention. The planner receives **labels only** — flagged raw text never becomes instructions.
3. **Intent classification** — an ordered deterministic regex table over 14 intents (eligibility, docs, summons, broker, placement, status, storefront, catalog update, store open/closed, order status, cash log, letter, smalltalk, unknown). Deterministic-first keeps evals reproducible.
4. **Dispatch** to the right backend function; compose the reply through `explain_reply`:
   - LLM narration (when a key exists) from the rule trace + cited texts → **per-sentence entailment gate** (citation markers valid? numbers verbatim in the cited corpus? optional NLI) → regenerate once → deterministic template fallback. Zero-key mode goes straight to templates — same citations, same numbers.
5. Reply returns text + sentences + citations + freshness stamp + TTS audio (or browser speech).

**Commerce by voice never bypasses gates**: *"se acabaron los tamales"* → the assistant finds the Tamales item and returns a `propose: set_availability` action; the app shows a confirm card; only the tap hits the gated write endpoint.

**Untrusted images are quarantined** (invariant 11): summonses, letters, documents, and menus go through `extraction.ts` — tool-less, schema-constrained, nullable-typed. Chain: Anthropic vision with constrained decoding → sha-matched fixture gold (the zero-key demo tier) → manual (all nulls, human fills in console). Only schema fields ever reach the planner. Displayed confidence comes from a calibration file measured on labeled evals — the model is never asked how confident it is.

## 7. Guard (the fraud shield)

- **Summons verifier**: normalize the ticket (alphanumeric, ≥7 chars — real OATH tickets look like `26N02358`) → live SoQL query against `jz4z-kudi` (OATH hearings). Found → hearing date, status, penalty context, what to bring, and the hearing is filed as a `Deadline`. Not found → the scripted honest answer: *"not in the city's file as of {publication date}; city inspectors never collect money on the street; every real civil fine goes to an OATH hearing"* + nearest referral partner. Criminal-looking instrument → explain civil-vs-criminal (Local Law 122 of 2025) + legal referral only. Unclear photo → ask for a clearer one, never guess a digit.
- **Broker verifier**: name normalization → exact + trigram fuzzy match on `w7w3-xahh` (business registry) → registration verdict + advance-fee check against the real $50 fee → teaching reply + `GuardEvent`.
- **Scam Radar**: a scheduled job aggregates GuardEvents into `AreaSignal` by neighborhood (NTA) and pattern — **counts only, no vendor references**. Count ≥ 3 within a window and no notice in 72h → in-language area warning to opted-in vendors.

All Socrata queries carry `dataset_as_of` (the dataset's own `rowsUpdatedAt`), and fall back to captured fixtures offline — still timestamped.

## 8. The commerce loop (Shopify is source of truth)

**Provisioning** (`POST /api/storefront`, schema requires `confirm: true` literal): creates the storefront — stable public slug (`antojitos-rosa-ca23`), open state, discovery opt-in, pickup note, QR pointing at the shopper page. With Shopify credentials it creates real products via the Admin API; without, products get simulated ids so the loop still runs end to end.

**Catalog** (`POST /api/store/draft` then `/api/store/item`): menu photo → quarantined extraction into `{items:[{title, price_usd|null}]}` → editable draft (null prices highlighted, never prefilled) → big-type price confirmation → gated write. A price is **never inferred**; publishing requires an explicit number plus `confirm: true`.

**Checkout** (`POST /api/shop/:slug/checkout`): the server **re-prices every line from its own catalog** — client-sent prices are ignored (tested with tampered carts). Sold-out items and closed stores are rejected. With Shopify: returns the hosted cart permalink (SIDEWALK never touches card data). Without: the simulated card step fires the **same HMAC-signed `orders/create` webhook at our own endpoint**, so the verification path is identical.

**Webhook** (`POST /webhooks/shopify`): raw-body HMAC verification (timing-safe) → **replay protection** (a `WebhookReceipt` per delivery id; replays write nothing) → idempotency (same order id under a new delivery id also writes nothing new) → exactly one minimal `CommerceOrder` mirror (no shopper PII — Shopify keeps buyer contact/payment) + exactly one **grade-A** `EvidenceRecord` + realtime events + an in-app notification. An invalid signature produces a 401 and **zero writes**.

**Order lifecycle**: `new → accepted → ready → picked_up` via `POST /api/store/order/:id/status`; cancellation additionally requires `confirm_cancel: true` (403 otherwise). Every transition publishes to the merchant's SSE topic and the shopper's order-token topic, so Rosa's board and the shopper's tracking page both move without refresh. The shopper's receipt is a 4-digit pickup code (stored hashed on the order; shown on the token-capability order page).

**The graded ledger**: card orders are grade **A (card-verified)**; a spoken *"vendí cuarenta dólares en efectivo"* parses the spoken amount (word-numbers included) and writes grade **B (self-reported)**. B can never become A — there is no upgrade path, and a test proves it. SIDEWALK never presents sales history as a license requirement unless a cited rule says so (none does).

**Realtime** (`server/src/realtime.ts`): a small SSE bus standing in for Base44 realtime subscriptions. Topics: `vendor:{id}`, `order:{token}`, `org:*`. Measured publish→flush latency shows on the console's Platform tab. This powers the demo's climax: a judge pays on their phone and the order lands on Rosa's screen ~15 ms later.

## 9. The three surfaces

**Merchant app** (`pwa/`, installable PWA, mobile-first, RTL for Arabic):
- `/app/today` — greeting, store open/closed toggle, **one** primary next-action card (no store → publish it; else the sequencer's next step; else a new order), urgent deadline, latest order, progress ring.
- `/app/case` — track, ordered checklist, documents, deadlines, cited answers, packet export (filing itself is human-gated behind a typed phrase + header, and even then only marks READY — no automatic submission exists).
- `/app/guard` — photograph a summons / paste a pitch → verdict cards + feedback chips.
- `/app/store` — launch flow (photo → draft → confirm → QR) or manage view (catalog with gated availability toggles, live orders board, voice cash log, A/B ledger).
- `/app/profile` — language tiers, privacy + deletion, discovery opt-in, feedback history.
- A persistent voice/camera button floats above the nav and opens the assistant as a sheet: hold to speak, release to review the transcript, confirm before anything consequential.
- Onboarding: seven taps (language → food/merch → years → cart → documents → borough → *launch a store now?*) ending in a useful spoken, cited answer — not a dashboard.

**Shopper surface** (same SPA, anonymous): `/shop/{slug}` opens from the cart QR in the shopper's language — story, open state, pickup note, translated catalog, cart, checkout in ≤45 s cold; `/order/{token}` shows the live status timeline + pickup code; `/discover` searches opted-in open vendors only.

**Console** (`console/`, token `amara-clinic`): Queue (34 cases, blocking defects, hearings this week) · Case detail (extracted field ↔ source image with calibrated confidence and inline human correction) · **Commerce** (per-store ledger, orders, expandable webhook provenance) · **Corrections** (merchant feedback → reviewed/fixed) · Guard (radar map, checks) · Autopilot (agent-drafted outreach a human approves) · Evals (live numbers) · a hidden **⌁ Platform** tab with the four substrate proofs (identity + grants, RLS entity count + allowlisted projections, latest automation runs, realtime latency). Role boundaries are entity security, not frontend filtering — a rogue token gets 401s, an ungranted vendor is simply invisible.

## 10. Languages

`config/lang_tiers.json`: **T1 gold** (es, bn, ar, zh, en) — native-reviewed templates + vocabulary, all demo flows. **T2 silver** (ru, ht, ko, ur, fr, pl) — fully functional but every reply carries *"responses in {lang} are automatically translated and not yet reviewed by a person."* **T3** — best effort, same honesty line. Never a silent downgrade; the UI badges the tier.

## 11. Security architecture

- **Control-flow integrity** (CaMeL pattern): the planner operates over structured state; raw untrusted text (documents, pasted messages, letters) is confined to quarantined extraction and can never become instructions. This is the *primary* defense — the guard classifier is defense-in-depth.
- **Instruction hierarchy** in every prompt; tool outputs are data.
- **Identity/authorization**: device credential → vendor id; org bearer tokens → granted rows only; the UI is never the security boundary.
- **The four confirmation gates** physically block (403) without literal confirmation values an agent cannot fabricate on its own.
- **Commerce walls**: HMAC + replay ledger + idempotency + server-side re-pricing + no card data + no shopper PII.
- **Injection suite** (`injection40.jsonl`): 4 OWASP-mapped families × 10 (direct, pasted, poisoned document, injected tool output). Result: **0% attack success** vs a 92.5% naive instruction-follower baseline, 0 destructive tool actions.

## 12. Evals (the demo's spine)

`npm run evals -- --report` prints the proof slide and stores an `EvalRun` row the console displays:

| Suite | What it measures | Frozen result |
|---|---|---|
| qa50 (5 languages) | answer accuracy vs the Rulebook | **100%** |
| — citation recall | right § cited | 97.9% |
| — ambiguous subset | abstain = correct | 85.7% |
| **SLO** | legal replies cited-or-abstained | **98%** (target ≥95%) ✅ |
| injection40 | attack success (ours vs naive baseline) | **0%** vs 92.5% |
| — destructive actions | across all attacks | **0** |
| **commerce20** | gates, walls, projections, idempotency | **20/20** ✅ |
| — cold QR → checkout | shopper latency | ~5 ms |
| pass^5 | byte-identical traces, 30 runs | **1.0**, CI [1,1] |
| unit/gate tests | vitest | **72/72** |

## 13. Zero-key fallback tiers

Every external dependency has a fallback so the demo never depends on a live account onstage (each one logged in `BLOCKERS.md`). Filling `.env` upgrades tiers with **no code changes**:

| Capability | With key | Zero-key fallback |
|---|---|---|
| Explanation | Claude narration under the NLI gate | deterministic cited templates |
| Doc/menu extraction | Claude vision + constrained decode | sha-matched fixture gold → manual nulls |
| ASR / TTS | managed Whisper / ElevenLabs | browser SpeechRecognition / speechSynthesis |
| Entailment | DeBERTa-class NLI endpoint | deterministic citation+number check (always on) |
| Shopify | dev store, Admin API, hosted checkout | simulated store + **real HMAC-signed** local webhook |
| NYC Open Data | token (higher rate limit) | works tokenless; captured fixtures offline |

## 14. How this was built (the two passes)

**Pass 1 — "Version B" (v2 spec)**: the deterministic casework core — entity layer with RLS, rulebook + engine + sequencer, extraction chain, entailment gate, Guard verifiers on live city data, PWA with the Spanish voice loop, console, MCP server, eval battery, seed. 51 tests, evals frozen.

**Pass 2 — v3 rebuild (this build, per the updated `SIDEWALK_BUILD_MASTER_APP_SPONSOR.md`)**: pivoted the product to **one standalone merchant-first app**:
- deleted the messaging-channel adapter layer entirely (v3 invariant 10)
- added the commerce spine: `CatalogItem`/`CommerceOrder` entities, menu-photo drafting, price-publication and cancellation gates, webhook replay protection, pickup codes, the SSE realtime bus
- added the whole shopper surface (`/shop`, `/discover`, `/order/{token}`) behind fail-closed public projections
- restructured the merchant app into Today / My Case / Guard / My Store / Profile with the floating voice action
- console: Commerce panel with webhook provenance, Corrections queue, hidden Platform proof tab
- new `commerce20` eval suite + 21 new gate tests (72 total), reseeded demo (Rosa's live storefront, Karim's history, six public carts + one hidden negative-prop cart, the imperfect menu photo), regenerated runbook with the 3-minute script

Everything was then verified end-to-end against the live system: the cold shopper checkout → HMAC webhook → realtime order on Rosa's screen loop, the Guard scripts with live OATH data, the gates' 403s, and the full eval battery.

## 15. Running it

```
npm install
npm run demo     # builds app + console, serves everything on :4477
npm run seed     # idempotent; live-verifies the summons props; writes DEMO_RUNBOOK.md
```

- Merchant app: `http://localhost:4477` (Rosa: `localStorage.sidewalk_device = "demo-rosa"`)
- Rosa's storefront: `http://localhost:4477/shop/antojitos-rosa-ca23`
- Console: `http://localhost:4477/console` — token `amara-clinic`
- MCP: `POST /mcp` with `Authorization: Bearer amara-clinic`
- Tests: `npm test` · Evals: `npm run evals -- --report`

For a judge's phone over LAN, the QR encodes the LAN URL automatically; run `npm run tunnel` (cloudflared) if you need HTTPS for mic permissions.

## 16. Base44 / Shopify mapping (the port path)

The repo deliberately mirrors Base44 concepts 1:1 so porting is mechanical: `entities.ts` = Base44 entities (RLS/FLS in schema) · `functions/*` = backend functions · `realtime.ts` = realtime subscriptions · `AutomationRun` + interval runners = scheduled automations · `modelgw.ts` = Invoke LLM/AI Gateway · signed media URLs = file storage. Shopify already owns catalog/checkout/order truth wherever credentials exist; the simulated tier exists only so the loop demos with zero keys.
