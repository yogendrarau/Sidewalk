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
