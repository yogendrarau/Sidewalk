/** Bi-temporal vendor memory: contradictions invalidate, never overwrite (§12). */
import { entities, type Ctx } from "./entities.js";

export function recordFact(vendorId: string, predicate: string, value: unknown): void {
  // Invariant 3: immigration-related facts are never persisted.
  if (/immigration|citizenship|visa|asylum|papers/i.test(predicate)) return;
  const ctx: Ctx = { kind: "vendor", vendor_id: vendorId };
  const now = new Date().toISOString();
  const existing = entities
    .list(ctx, "Fact", { vendor_id: vendorId, predicate })
    .filter((f) => f.valid_to === null);
  const newRow = entities.create(ctx, "Fact", {
    vendor_id: vendorId, predicate, value, valid_from: now, valid_to: null, recorded_at: now, invalidated_by: null,
  });
  for (const old of existing) {
    if (JSON.stringify(old.value) !== JSON.stringify(value)) {
      entities.update(ctx, "Fact", old.id, { valid_to: now, invalidated_by: newRow.id });
    } else {
      // identical restatement: keep the older row, drop the duplicate
      entities.delete(ctx, "Fact", newRow.id);
      return;
    }
  }
}

export function factsFor(vendorId: string): Record<string, unknown> {
  const ctx: Ctx = { kind: "vendor", vendor_id: vendorId };
  const rows = entities.list(ctx, "Fact", { vendor_id: vendorId }).filter((f) => f.valid_to === null);
  const out: Record<string, unknown> = {};
  for (const r of rows) out[String(r.predicate)] = r.value;
  return out;
}
