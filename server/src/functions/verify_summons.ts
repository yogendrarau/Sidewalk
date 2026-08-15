/**
 * Summons Verifier (§8). Live query against the city's own OATH case file (jz4z-kudi).
 * Found → hearing date + status + historical penalty range for the charge. Not found →
 * the scripted answer with the data publication timestamp. Never guesses a digit.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { query, DATASETS } from "../socrata.js";
import { entities, type Ctx } from "../entities.js";

const Input = z.object({
  vendor_id: z.string(),
  ticket_number: z.string().nullable(),
  instrument_kind: z.string().nullable().optional(), // from quarantined extraction: civil_oath | criminal_court | null
});

export type SummonsOut =
  | { result: "found"; ticket_number: string; hearing_date: string | null; hearing_result: string | null; penalty_imposed: string | null; charge: string | null; penalty_range_note: string | null; dataset_as_of: string; source: string; check_id: string }
  | { result: "not_found"; ticket_number: string; dataset_as_of: string; source: string; check_id: string }
  | { result: "unclear"; check_id: string }
  | { result: "criminal_looking"; check_id: string };

export const verify_summons = defineFn<z.infer<typeof Input>, SummonsOut>("verify_summons", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const record = (kind: string, payload: Record<string, unknown>, result: string, dataset_as_of = "") =>
    entities.create(ctx, "VerificationCheck", {
      vendor_id: input.vendor_id, kind: "oath_summons", input_ref: input.ticket_number,
      query: kind, dataset_id: DATASETS.oath_hearings, dataset_as_of, result, payload,
    }).id;

  if (input.instrument_kind === "criminal_court") {
    return { result: "criminal_looking", check_id: record("classify", {}, "pattern_match") };
  }
  // OATH ticket numbers can be alphanumeric (e.g. 26N02358); strip separators only, never guess
  const n = (input.ticket_number ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!n || n.length < 7) {
    return { result: "unclear", check_id: record("parse", { got: input.ticket_number }, "not_found") };
  }

  const res = await query(DATASETS.oath_hearings, { ticket_number: n });
  if (res.rows.length === 0) {
    return {
      result: "not_found", ticket_number: n, dataset_as_of: res.dataset_as_of, source: res.source,
      check_id: record("ticket_number", { n }, "not_found", res.dataset_as_of),
    };
  }

  const row = res.rows[0] as Record<string, string | undefined>;
  const charge = row.charge_1_code_description ?? row.charge_1_code ?? null;

  // historical penalty range for the same charge code (aggregate; only a range, never advice)
  let penalty_range_note: string | null = null;
  if (row.charge_1_code) {
    try {
      const agg = await query(DATASETS.oath_hearings, {
        $select: "min(penalty_imposed) as mn, max(penalty_imposed) as mx",
        $where: `charge_1_code='${row.charge_1_code.replace(/'/g, "''")}' AND penalty_imposed > '0'`,
        $limit: "1",
      });
      const a = agg.rows[0] as { mn?: string; mx?: string } | undefined;
      if (a?.mn && a?.mx) penalty_range_note = `$${Math.round(Number(a.mn))}–$${Math.round(Number(a.mx))}`;
    } catch { /* aggregate is optional */ }
  }

  return {
    result: "found",
    ticket_number: n,
    hearing_date: row.hearing_date ?? null,
    hearing_result: row.hearing_result ?? null,
    penalty_imposed: row.penalty_imposed ?? null,
    charge,
    penalty_range_note,
    dataset_as_of: res.dataset_as_of,
    source: res.source,
    check_id: record("ticket_number", { n, hearing_date: row.hearing_date }, "found", res.dataset_as_of),
  };
});
