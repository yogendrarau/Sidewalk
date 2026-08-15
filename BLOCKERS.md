# BLOCKERS

Per build master §0.4: blocked >20 min on an external → implement the fallback tier, log here, continue.

| When | Component | Blocker | Fallback shipped |
|---|---|---|---|
| 2026-08-15 | Platform | Base44 account/platform not accessible from this build environment | Local monorepo in Base44 shape (entities+RLS layer, function-per-file backend, Vite SPA); ports 1:1 |
| 2026-08-15 | ASR (`ASR_ENDPOINT`) | No managed Whisper endpoint yet (empty .env) | Browser `SpeechRecognition` (es et al.) in PWA; server `transcribe_audio` returns `asr_unavailable` → client-side ASR path. Whisper endpoint plugs in via `.env` |
| 2026-08-15 | TTS (`TTS_ROUTING`) | No ElevenLabs-class key yet | Browser `speechSynthesis` per-language voices (es on macOS/iOS); server `synthesize_speech` returns text + `audio_unavailable`; per-sentence chunking preserved |
| 2026-08-15 | NLI (`NLI_ENDPOINT`) | No DeBERTa-class NLI endpoint | Deterministic entailment gate (citation coverage + verbatim number/date check) always on; Claude-as-NLI per-sentence check added when `ANTHROPIC_API_KEY` present; template fallback is final tier |
| 2026-08-15 | Shopify webhook delivery | Shopify cannot reach localhost | `/pay/:vendorId` simulated checkout posts a properly HMAC-signed `orders/create` to our own webhook (same verify path). With real store + tunnel (`npm run tunnel`), register the real webhook |
| 2026-08-15 | WER eval (`wer40/`) | No recorded per-language clip set on hand | Latency + qa50 + injection + docs + pass^5 run; WER table reports `n/a (browser ASR tier)` until clips recorded |
| 2026-08-15 | MCP OAuth | Full OAuth server out of hackathon scope | MCP server ships with per-org bearer tokens, RLS-scoped; OAuth upgrade path documented in README |
| 2026-08-15 | Booth Mode | Demo-only station, separate laptop setup | Not built; §16 go/no-go defaults to no-go → eval slide takes the slot |

## v3 (build master `SIDEWALK_BUILD_MASTER_APP_SPONSOR.md`)

| When | Component | Blocker | Fallback shipped |
|---|---|---|---|
| 2026-08-15 | Base44 platform (invariant 15) | Base44 account/platform not accessible from this build environment — settled decision (§20.1): emulate locally | Local monorepo in Base44 shape: entities + RLS/FLS layer, function-per-file backend with the `{ok, data\|error, timing_ms}` envelope, SSE realtime, interval-runner automations with `AutomationRun` proof rows, server-side secrets. The port is mechanical (mapping in `CLAUDE.md` / README) |
| 2026-08-15 | Console packaging (§3.1) | Spec asks for the console as a route of the same SPA; it ships as its own Vite bundle | Served by the same host at `/console` — same origin, same tokens, same design language. Deviation is invisible to users; folding it into the app bundle is a build-config change, not a rewrite |
| 2026-08-15 | docs30 / wer40 / ux12 (§15) | Small labeled document set; no recorded per-language clip set; UX tasks need human runs on a phone | docs30 runs partial on fixture gold; wer40 reports `n/a (browser ASR tier)` until clips are recorded; **ux12 ships as a human-run checklist — `evals/ux12.jsonl`, 12 tasks (6 merchant + 6 shopper/caseworker) with success criteria and time targets** |
| 2026-08-15 | Shopify (invariant 14) | No dev-store credentials in `.env` | Simulated storefront/checkout that fires the **same HMAC-signed** `orders/create` webhook at our own verify path (replay-protected, idempotent). Adding `SHOPIFY_*` keys upgrades to the real store with zero code changes |
