/**
 * guard_screen (§9): labels {injection, scam_pattern, pii_overshare} from deterministic
 * price/script matching. The planner receives LABELS ONLY — never the flagged raw text.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { SCAM_PATTERNS, INJECTION_PATTERNS, PII_PATTERNS, IMMIGRATION_MENTION } from "../guard_patterns.js";
import { prices } from "../rulebook.js";

const Input = z.object({ text: z.string(), vendor_id: z.string().optional() });

export type GuardLabels = {
  injection: boolean;
  scam_pattern: string | null;
  pii_overshare: boolean;
  immigration_mention: boolean; // recognized only so it is never persisted
  suspicious_price_usd: number | null;
};

export const guard_screen = defineFn<z.infer<typeof Input>, GuardLabels>("guard_screen", Input, async ({ text }) => {
  const injection = INJECTION_PATTERNS.some((r) => r.test(text));
  const scam = SCAM_PATTERNS.find((p) => p.res.some((r) => r.test(text)));
  const pii = PII_PATTERNS.some((r) => r.test(text));

  // deterministic price anchor: a large dollar ask near license/permit words
  let suspicious_price_usd: number | null = null;
  const priceCfg = prices().scam_anchors as Record<string, { min_suspicious_usd?: number }>;
  const minSus = priceCfg.underground_permit_rental_reported?.min_suspicious_usd ?? 500;
  const amounts = [...text.matchAll(/\$\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (amounts.some((a) => a >= minSus) && /(license|licencia|permit|permiso|placa)/i.test(text)) {
    suspicious_price_usd = Math.max(...amounts);
  }

  return {
    injection,
    scam_pattern: scam?.key ?? (suspicious_price_usd ? "advance_fee_license" : null),
    pii_overshare: pii,
    immigration_mention: IMMIGRATION_MENTION.test(text),
    suspicious_price_usd,
  };
});

export const scamTeaching = (key: string): string =>
  SCAM_PATTERNS.find((p) => p.key === key)?.teaching ?? "Be careful. Verify before paying anyone.";
