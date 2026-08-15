# SIDEWALK — Base44 Generation

Judge-ready hackathon prototype exported from the authoritative Base44 sandbox.

- Base44 app ID: `6a807abba4a26b462c198c81`
- Base44 source commit: `45054d3f368d0b07f728cba60a870cc8a3feb582`
- Export type: one-way source snapshot; this GitHub branch is not configured to sync changes back to Base44
- Safety boundary: fictional demo data only; no real payments, filings, messages, or legal determinations

## What is included

- Spanish-first vendor PWA with Ask, Check, and My Sales flows
- Read-only NYC OATH public-record lookup with explicit provenance and failure states
- Deterministic demo rulebook and exact-fixture AI fallbacks
- Caseworker console, QR session launch, evidence trace, proof panel, and reset controls
- Base44 entity schemas and Deno backend functions under `base44/`

## Run the frontend locally

```bash
git checkout base-44-generation
npm install
npm run dev
```

To point the local frontend at the hosted Base44 backend, create an uncommitted `.env.local`:

```bash
VITE_BASE44_APP_ID=6a807abba4a26b462c198c81
VITE_BASE44_APP_BASE_URL=https://your-published-base44-app-url
```

Build verification:

```bash
npm run build
```

The live Base44 app remains the authoritative deployed implementation. This branch is the reviewable source snapshot requested for the hackathon repository.
