# SIDEWALK — Version B (web-only)

A trust, licensing, and payments system for NYC street vendors (~23,000 people, 96% immigrants),
built for the 2026–27 licensing expansion. Everything with legal consequence is computed by a
**deterministic rule engine over a versioned, citation-bearing Rulebook**; models only transcribe,
synthesize speech, extract documents into schemas, and narrate rule outputs under an entailment gate.

Built to the `SIDEWALK_BUILD_MASTER.md` v2.0 spec, **Version B** (`SIDEWALK_CHANNELS=web`): a PWA the
vendor installs, onboarded by QR, in Spanish (and bn/ar/zh/en). The messaging channels (WhatsApp/
Telegram/SMS) ship as interface-conformant stubs behind the build flag — the core is channel-agnostic.

## Quick start

```bash
npm install
cp .env.example .env        # optional — everything works with zero keys (see Fallback tiers)
npm run demo                # builds PWA + console, serves everything on one LAN port (:4477)
npm run seed                # in another shell: seed the three demo tenants + props
```

Then:
- **Vendor PWA:** `http://localhost:4477` (or the printed LAN URL — scan its QR from a phone)
- **Caseworker console:** `http://localhost:4477/console` — token `amara-clinic`
- **MCP server:** `POST http://localhost:4477/mcp` with `Authorization: Bearer amara-clinic`

Dev mode with hot reload (three processes): `npm run dev` → PWA :5173, console :5174, server :4477.

## The three demo flows

The runbook with the live-verified summons numbers is written to `DEMO_RUNBOOK.md` at seed time.

1. **QR → cold PWA → Spanish voice loop < 60s.** Scan the poster (`fixtures/media/onboarding_poster.svg`)
   → six-question screener → the app auto-asks *"¿Puedo obtener una licencia si vendo comida?"* → a
   **spoken, cited** answer: 2,200 supervisory licenses/yr through 2031 (Intro 1251). Every legal
   sentence carries a § chip; the answer is entailment-checked before it's spoken.
2. **Guard.** *Check* screen → type the fabricated ticket (verified absent from the city's OATH file at
   seed time) → the not-found script with the data-publication timestamp and a scam warning. Then the
   real ticket → its true hearing date, live from `jz4z-kudi`. Paste *"Te consigo la licencia por $2,000"*
   → advance-fee warning ($50 is the real fee). ≤10s, timed.
3. **Paper trail.** *Sales* → Create store (**confirmation gate**) → open the payment link → pay → a real
   HMAC-signed `orders/create` webhook fires → grade-A evidence row. Then 🎤 *"vendí cuarenta dólares en
   efectivo"* → grade-B row beside it. Open the console on Rosa: evidence panel with source-image
   provenance + calibrated confidence, decision trace with citations; Guard tab shows the QN31 scam cluster.

## What's inside

```
rulebook/      rulebook.v1.json (content-hashed) + vocabulary.{es,bn,ar,zh} + prices
server/        entity layer (RLS/FLS), deterministic engine, 20 backend functions, MCP, Express host
  src/engine.ts        pure evaluate() — no model calls, byte-identical traces (property-tested)
  src/gate.ts          per-sentence entailment gate (deterministic + optional model NLI)
  src/functions/       route_inbound, verify_summons/broker, extract_document, explain_reply, …
channels/      adapter contract + web adapter + A-channel/wechat stubs (NotActivated)
pwa/           Vite React PWA — 5 screens, browser voice loop, installable
console/       Vite React SPA — queue, evidence+trace, Guard map, Autopilot, live eval tab
evals/         qa50 + injection40 + pass^5 + latency → the proof slide
scripts/       seed_demo (idempotent, live-verifies props), print_rights_card
```

## Invariants (the contract — see `CLAUDE.md`)

Rules decide, models explain. Extraction returns `null`, never a guess. **No immigration-status field
exists anywhere.** RLS on every vendor entity, FLS on sensitive fields, signed expiring document URLs,
deletion honored. Every legal sentence is entailment-checked; every city-data answer carries the
dataset's publication timestamp. Filing a packet and provisioning payments **physically block** without
explicit human confirmation. Untrusted content is processed only by tool-less schema-constrained
extraction — its raw text never reaches the planner.

## Tests & evals

```bash
npm test                    # 51 tests: RLS/Gate-0, engine property + Gate-1, Guard/Gate-3,
                            #           gate-bypass (§14), P4 loop, cross-tenant isolation
npm run evals -- --report   # the proof-slide table
```

Latest battery (frozen numbers on the eval tab):

| Metric | Value |
|---|---|
| QA50 accuracy (5 languages) | **100%** |
| Citation recall | 97.9% |
| Ambiguous-subset abstention (abstain = correct) | 85.7% |
| **SLO — legal replies cited-or-abstained** | **98%** (target ≥95%) |
| Injection attack success (our system) vs naive baseline | **0%** vs 92.5% |
| Destructive tool actions across 40 attacks | **0** |
| pass^5 (byte-identical traces) | **1.0**, 95% CI [1, 1] |

## Fallback tiers (works with zero keys — `BLOCKERS.md`)

Every external is behind a fallback so the demo never depends on a live account onstage. Add keys in
`.env` to upgrade quality without code changes:

| Capability | With key | Zero-key fallback |
|---|---|---|
| Explanation | Gateway LLM (Claude) under the NLI gate | deterministic rule-engine templates (the spec's final tier) |
| Document extraction | Anthropic vision + constrained decode | sha-matched fixture gold → manual (null) |
| ASR / TTS | managed Whisper / ElevenLabs | browser `SpeechRecognition` / `speechSynthesis` (es works on macOS/iOS) |
| Entailment | DeBERTa-class NLI endpoint | deterministic citation + verbatim-number check (always on) |
| Shopify | real dev store + Admin API | simulated storefront + **real HMAC-signed** local webhook |

NYC Open Data (Socrata) works with **no token**; a token only raises the rate limit. Live queries are
captured to `fixtures/socrata/` so the verifiers still work offline.

## Live NYC datasets used

`jz4z-kudi` OATH hearings (summons verifier) · `w7w3-xahh` business registry (broker verifier) ·
`ptev-4hud` license applications (status polling) · `erm2-nwe9` 311 (placement risk note) ·
`tvpp-9vvx` permitted events. All queried live; each answer carries the dataset's publication timestamp.

## Promotion & activation paths

- **T2 → T1 language:** a native reviewer signs the template pack in `templates.ts` + 10 WER clips
  measured. T2/T3 replies always carry the machine-translation honesty line — never a silent downgrade.
- **WeChat:** register a WeChat Official Account (business verification, ~1–2 weeks), set
  `WECHAT_APP_ID/SECRET`, add `wechat` to `SIDEWALK_CHANNELS`. `channels/wechat.ts` throws `NotActivated`.
- **Version A (messaging):** set `SIDEWALK_CHANNELS=whatsapp,telegram,sms,web`; the A-channel adapters
  are interface-conformant stubs ready to fill. Everything else (console, Guard, Shopify, MCP, evals)
  is identical between versions.
- **MCP OAuth:** the read-only server ships with per-org bearer tokens today; the OAuth upgrade is a
  drop-in on the `/mcp` route.

## TODO(law) / TODO(data) — awaiting human transcription

Placement distances and cart dimensions (Admin Code §§), cart-recovery deadlines, the restricted-street
list, DOHMH commissary list + fee benchmarks. Each has the abstain path wired: the engine emits a
physical checklist + referral and never guesses a statutory number.

## Base44 mapping

This repo is shaped for a 1:1 port to Base44: `server/src/entities.ts` = Base44 entities (RLS/FLS in the
schema), `server/src/functions/*.ts` = Deno backend functions (≤5 min, `{ok, data|error, timing_ms}`),
`modelgw.ts` = AI Gateway, PWA/console = the SPA. See `CLAUDE.md` for the full mapping.
