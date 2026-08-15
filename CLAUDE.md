# SIDEWALK — agent contract

Build master: `../sidewalk aiden/SIDEWALK_BUILD_MASTER.md` (v2.0). Version B (`SIDEWALK_CHANNELS=web`).

## Invariants (violations are release-blocking)

1. Rules decide; models explain. No model call inside eligibility, placement, sequencing, fee, or deadline computation.
2. Extraction outputs `null` for anything unreadable. Never a plausible guess.
3. No immigration-status data: no field, no question, no log. Volunteered statements are not persisted.
4. Row-level security (RLS) on every vendor-scoped entity; field-level security (FLS) on sensitive fields; signed expiring URLs on documents; deletion on request honored.
5. Every legal-consequence sentence is entailment-checked against its cited rule before send; fail → regenerate once → fall back to the rule engine's template.
6. Every city-data answer carries the dataset's publication timestamp. Negative OATH results say "not in the city's file as of the last data publication."
7. `TODO(law)` protocol: statutory values enter only by human transcription from the source, with the § citation inline. Never invent statutory numbers, fees, distances, or dataset IDs. Mark `TODO(law)`/`TODO(data)` and wire the abstain path.
8. Displayed confidence comes only from calibrated log-probabilities or conformal thresholds. Never ask a model how confident it is.
9. Filing a packet and provisioning payments require explicit human confirmation, and the gate must physically block (tested).
10. The core is channel-agnostic: nothing outside `channels/` imports a channel SDK or branches on channel.
11. Untrusted content (documents, forwarded messages, letters) is processed only by tool-less, schema-constrained extraction functions; its raw text never enters the planning agent's context.
12. Settled decisions in build master §20.1 are not reopened.

## Commands

```
npm run dev          # server :4477 + pwa :5173 + console :5174
npm run demo         # build everything, serve on one LAN port (:4477)
npm run seed         # scripts/seed_demo.ts (idempotent; live-verifies summons props)
npm test             # unit + property + gate tests (vitest)
npm run evals        # full battery → EvalRun rows
npm run evals -- --report   # emits the proof-slide table
```

CI rule: any diff in `server/src/functions/` or `prompts/` reruns qa50 + injection40.

## Local shape → Base44 mapping

- `server/src/entities.ts` = Base44 entities (RLS/FLS declared in schema, enforced in the data layer)
- `server/src/functions/*.ts` = Base44 Deno backend functions (≤5 min, schema-validated I/O `{ok, data|error, timing_ms}`)
- AI Gateway = `server/src/modelgw.ts` (Anthropic key or fallback tiers; no streaming — audio chunks per sentence)
- Blocked externals → fallback tier + entry in `BLOCKERS.md` (build master §0.4)
