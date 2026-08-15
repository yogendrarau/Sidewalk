/**
 * Base44-shaped entity layer. RLS/FLS declared in the schema, enforced here —
 * every read and write passes through a Ctx. Nothing above this layer touches SQL.
 *
 * RLS "vendor": row visible to its creating vendor identity plus org caseworkers
 * holding an explicit grant. RLS "org": org rows. RLS "public": reference data.
 * FLS fields are stripped unless the ctx is admin/system.
 */
import { randomUUID, createHmac } from "node:crypto";
import { db } from "./db.js";

export type Ctx =
  | { kind: "vendor"; vendor_id: string }
  | { kind: "org"; org_id: string; grants: string[]; admin?: boolean }
  | { kind: "system" };

type Rls = "vendor" | "org" | "public";

const SCHEMA: Record<string, { rls: Rls; fls?: string[] }> = {
  Vendor: { rls: "vendor", fls: ["base44_user_id"] },
  CaseFile: { rls: "vendor" },
  DocumentImage: { rls: "vendor" },
  ExtractedField: { rls: "vendor" },
  RuleEvaluation: { rls: "vendor" },
  VerificationCheck: { rls: "vendor" },
  Fact: { rls: "vendor" },
  Deadline: { rls: "vendor" },
  AppNotification: { rls: "vendor" },
  Storefront: { rls: "vendor" }, // public reads go through publicStorefront() ONLY
  CatalogItem: { rls: "vendor" }, // public reads go through publicItem() ONLY
  CommerceOrder: { rls: "vendor", fls: ["fulfillment_code_hash"] },
  EvidenceRecord: { rls: "vendor" },
  GuardEvent: { rls: "vendor" },
  Message: { rls: "vendor" },
  MerchantFeedback: { rls: "vendor" },
  AreaSignal: { rls: "public" }, // aggregate only, no vendor refs — by design
  RulebookVersion: { rls: "public" },
  EvalRun: { rls: "public" },
  ReferralPartner: { rls: "public" },
  WebhookReceipt: { rls: "public" }, // replay-protection + provenance ledger: ids and verdicts only
  AutomationRun: { rls: "public" }, // scheduled-automation proof for /demo/platform
  Org: { rls: "org" },
  OutreachDraft: { rls: "org" },
};

export type Row = { id: string; created_at: string; updated_at: string; [k: string]: unknown };

for (const name of Object.keys(SCHEMA)) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${name} (
    id TEXT PRIMARY KEY, vendor_id TEXT, org_id TEXT,
    data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
}

function scopeOk(entity: string, ctx: Ctx, row: { vendor_id: string | null; org_id: string | null }): boolean {
  const { rls } = SCHEMA[entity];
  if (ctx.kind === "system") return true;
  if (rls === "public") return true;
  if (rls === "vendor") {
    if (ctx.kind === "vendor") return row.vendor_id === ctx.vendor_id;
    return row.vendor_id != null && ctx.grants.includes(row.vendor_id);
  }
  // rls === "org"
  return ctx.kind === "org" && row.org_id === ctx.org_id;
}

function stripFls(entity: string, ctx: Ctx, data: Record<string, unknown>): Record<string, unknown> {
  const fls = SCHEMA[entity].fls;
  if (!fls || ctx.kind === "system" || (ctx.kind === "org" && ctx.admin)) return data;
  const out = { ...data };
  for (const f of fls) delete out[f];
  return out;
}

export const entities = {
  names: () => Object.keys(SCHEMA),
  rlsOf: (entity: string) => SCHEMA[entity].rls,

  create(ctx: Ctx, entity: string, data: Record<string, unknown>): Row {
    if (!SCHEMA[entity]) throw new Error(`unknown entity ${entity}`);
    // Invariant 3: the immigration-status field does not exist anywhere, by design.
    for (const k of Object.keys(data)) {
      if (/immigration|citizenship|visa_status/i.test(k)) throw new Error("forbidden field");
    }
    const id = (data.id as string) ?? randomUUID();
    const now = new Date().toISOString();
    const vendor_id = (data.vendor_id as string) ?? null;
    const org_id = (data.org_id as string) ?? null;
    if (SCHEMA[entity].rls === "vendor" && ctx.kind === "vendor" && vendor_id !== ctx.vendor_id)
      throw new Error(`RLS: vendor ctx may only create own rows on ${entity}`);
    db.prepare(`INSERT OR REPLACE INTO ${entity} (id, vendor_id, org_id, data, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
      .run(id, vendor_id, org_id, JSON.stringify(data), now, now);
    return { id, created_at: now, updated_at: now, ...data };
  },

  get(ctx: Ctx, entity: string, id: string): Row | null {
    const r = db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id) as
      | { id: string; vendor_id: string | null; org_id: string | null; data: string; created_at: string; updated_at: string }
      | undefined;
    if (!r || !scopeOk(entity, ctx, r)) return null;
    return { id: r.id, created_at: r.created_at, updated_at: r.updated_at, ...stripFls(entity, ctx, JSON.parse(r.data)) };
  },

  list(ctx: Ctx, entity: string, where: Record<string, unknown> = {}): Row[] {
    const rows = db.prepare(`SELECT * FROM ${entity} ORDER BY created_at`).all() as Array<{
      id: string; vendor_id: string | null; org_id: string | null; data: string; created_at: string; updated_at: string;
    }>;
    return rows
      .filter((r) => scopeOk(entity, ctx, r))
      .map((r) => ({ id: r.id, created_at: r.created_at, updated_at: r.updated_at, ...(JSON.parse(r.data) as object) }))
      .filter((row) => Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v))
      .map((row) => stripFls(entity, ctx, row) as Row);
  },

  update(ctx: Ctx, entity: string, id: string, patch: Record<string, unknown>): Row {
    const r = db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id) as
      | { vendor_id: string | null; org_id: string | null; data: string; created_at: string }
      | undefined;
    if (!r || !scopeOk(entity, ctx, r as never)) throw new Error(`RLS: cannot update ${entity}/${id}`);
    const data = { ...JSON.parse(r.data), ...patch };
    const now = new Date().toISOString();
    db.prepare(`UPDATE ${entity} SET data = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(data), now, id);
    return { id, created_at: r.created_at, updated_at: now, ...data };
  },

  delete(ctx: Ctx, entity: string, id: string): void {
    const r = db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).get(id) as { vendor_id: string | null; org_id: string | null } | undefined;
    if (!r || !scopeOk(entity, ctx, r as never)) throw new Error(`RLS: cannot delete ${entity}/${id}`);
    db.prepare(`DELETE FROM ${entity} WHERE id = ?`).run(id);
  },

  /** Invariant 4: deletion on request honored — purge every row for a vendor. */
  purgeVendor(ctx: Ctx, vendorId: string): number {
    if (ctx.kind !== "system" && !(ctx.kind === "vendor" && ctx.vendor_id === vendorId))
      throw new Error("RLS: only the vendor or system may purge");
    let n = 0;
    for (const [name, def] of Object.entries(SCHEMA)) {
      if (def.rls !== "vendor") continue;
      n += Number(db.prepare(`DELETE FROM ${name} WHERE vendor_id = ?`).run(vendorId).changes);
    }
    return n;
  },
};

/**
 * Public shopper projections (v3 §8 commerce loop): anonymous reads see ONLY these
 * allowlisted fields — never case data, documents, phone, exact location, or shopper PII.
 * Fail closed: anything not named here is dropped, whatever gets added to the row later.
 */
export const PUBLIC_STOREFRONT_FIELDS = [
  "slug", "public_name", "langs", "category", "open_state", "pickup_note", "public_nta",
] as const;
export const PUBLIC_ITEM_FIELDS = [
  "title_by_lang", "description_by_lang", "price", "currency", "image_url", "availability", "sort_order",
] as const;
export const PUBLIC_ORDER_FIELDS = [
  // served ONLY on the token-capability order page — possession of the secret token is the authorization
  "order_number", "items", "total", "currency", "fulfillment", "pickup_window", "placed_at", "pickup_code",
] as const;

function project(row: Record<string, unknown> | null, allow: readonly string[]): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const k of allow) if (row[k] !== undefined) out[k] = row[k];
  return out;
}
export const publicStorefront = (row: Record<string, unknown> | null) => project(row, PUBLIC_STOREFRONT_FIELDS);
export const publicItem = (row: Record<string, unknown> | null) => project(row, PUBLIC_ITEM_FIELDS);
export const publicOrder = (row: Record<string, unknown> | null) => project(row, PUBLIC_ORDER_FIELDS);

/** Signed expiring URLs for documents (invariant 4). */
const MEDIA_SECRET = process.env.MEDIA_SECRET ?? "sidewalk-media-dev";
export function signMediaUrl(sha256: string, ttlMs = 15 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const sig = createHmac("sha256", MEDIA_SECRET).update(`${sha256}.${exp}`).digest("hex").slice(0, 32);
  return `/media/${sha256}?exp=${exp}&sig=${sig}`;
}
export function verifyMediaSig(sha256: string, exp: string, sig: string): boolean {
  if (Date.now() > Number(exp)) return false;
  const want = createHmac("sha256", MEDIA_SECRET).update(`${sha256}.${exp}`).digest("hex").slice(0, 32);
  return sig === want;
}
