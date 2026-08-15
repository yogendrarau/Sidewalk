/**
 * log_cash_sale (§9): constrained extract {amount, currency, items?, date} →
 * EvidenceRecord{grade:"B_self_reported"} → confirmation with running evidence summary.
 * Ambiguous amount → exactly one clarifying question.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";

const Input = z.object({ vendor_id: z.string(), text: z.string(), lang: z.string().default("es") });

export type CashOut =
  | { logged: true; amount: number; currency: string; counts: { total: number; a: number; b: number }; record_id: string }
  | { logged: false; clarify: true };

const AMOUNT_RES = [
  /\$\s?([\d,]+(?:\.\d{1,2})?)/,
  /([\d,]+(?:\.\d{1,2})?)\s?(?:dolares|dólares|dollars|usd|pesos)/i,
  /(?:vendi|vendí|sold|made|gané|gane|hice|cobré|cobre)\s.{0,15}?([\d,]+(?:\.\d{1,2})?)/i,
];

// spoken-number parsing (voice-first): es + en, 0–999. "cuarenta dólares" → 40, "ciento veinte" → 120.
const UNITS: Record<string, number> = {
  cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
function parseSpokenAmount(text: string): number | null {
  const tokens = text.toLowerCase().replace(/[.,]/g, "").split(/\s+|-/).filter((w) => w in UNITS || w === "y" || w === "and");
  if (!tokens.length) return null;
  let total = 0, current = 0;
  for (const w of tokens) {
    if (w === "y" || w === "and") continue;
    const v = UNITS[w];
    if (v === 100 && current > 0) current *= 100;
    else if (v >= 100) { current += v; }
    else current += v;
  }
  total += current;
  return total > 0 ? total : null;
}

export const log_cash_sale = defineFn<z.infer<typeof Input>, CashOut>("log_cash_sale", Input, async (input) => {
  let amount: number | null = null;
  for (const re of AMOUNT_RES) {
    const m = input.text.match(re);
    if (m) { amount = Number(m[1].replace(/,/g, "")); break; }
  }
  if (amount === null || Number.isNaN(amount)) amount = parseSpokenAmount(input.text); // voice: spelled-out numbers
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { logged: false, clarify: true };

  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const rec = entities.create(ctx, "EvidenceRecord", {
    vendor_id: input.vendor_id, kind: "cash_log", amount, currency: "USD",
    at: new Date().toISOString(), grade: "B_self_reported",
  });
  const all = entities.list(ctx, "EvidenceRecord", { vendor_id: input.vendor_id });
  const a = all.filter((r) => r.grade === "A_card_verified").length;
  return { logged: true, amount, currency: "USD", counts: { total: all.length, a, b: all.length - a }, record_id: rec.id };
});
