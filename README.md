# SIDEWALK — Base44 Generation

Judge-ready hackathon prototype developed in the authoritative Base44 sandbox.

> SIDEWALK is an AI-powered navigation and preparation layer for NYC street-vending processes. It helps vendors understand requirements, organize their information, and reach the right official service. Government agencies retain all authority over licenses, permits, filings, hearings, and eligibility decisions.

- Base44 app ID: `6a807abba4a26b462c198c81`
- GitHub branch: `base-44-generation`
- Safety boundary: fictional demo data only; no real payments, filings, referrals, messages, or legal determinations

## What is included

- Seven-language vendor PWA with Ask, Check, My Sales, and optional official-help routing
- Read-only NYC OATH public-record lookup with explicit provenance and failure states
- Deterministic demo rulebook and exact-fixture AI fallbacks
- AI Support Console, QR session launch, evidence trace, proof panel, and reset controls
- Local handoff-summary preview with verified official destinations and no external transmission
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

The Base44 sandbox remains the authoritative hosted implementation. This branch is its reviewable hackathon source checkpoint.
