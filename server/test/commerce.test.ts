/**
 * §14 commerce battery: provisioning idempotency, confirm gates (invariant 9), checkout
 * price revalidation, webhook HMAC wall + replay dedup, cancel gate, public projections
 * fail closed, zero shopper PII, and cash evidence staying grade B (invariant 14).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createHmac } from "node:crypto";
import { app } from "../src/index.js";
import { entities, PUBLIC_STOREFRONT_FIELDS, PUBLIC_ITEM_FIELDS, type Ctx } from "../src/entities.js";
import { vendorIdOf } from "../src/identity.js";
import { provision_storefront } from "../src/functions/provision_storefront.js";
import { create_checkout } from "../src/functions/create_checkout.js";
import { log_cash_sale } from "../src/functions/log_cash_sale.js";

const sys: Ctx = { kind: "system" };
const DEVICE = "commerce-test-device";
const VID = vendorIdOf(DEVICE);
const H = { "content-type": "application/json", "x-device-id": DEVICE };
const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "dev-secret-change-me";

let server: Server;
let base = "";
let slug = "";
let itemId = ""; // Tamal verde, $4.00, available
let soldOutId = ""; // Agua fresca, $2.00, sold_out

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://localhost:${port}`;
  // create_checkout self-fires the signed webhook at http://localhost:$PORT — point it here
  process.env.PORT = String(port);
});
afterAll(() => server?.close());

const postSigned = (body: Record<string, unknown>, webhookId: string, badSig = false) => {
  const payload = Buffer.from(JSON.stringify(body));
  const hmac = badSig ? "Zm9yZ2Vk" : createHmac("sha256", SECRET).update(payload).digest("base64");
  return fetch(`${base}/webhooks/shopify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-hmac-sha256": hmac, "x-shopify-webhook-id": webhookId },
    body: payload,
  });
};

describe("provisioning (§9) — confirm-gated and idempotent", () => {
  it("POST /api/storefront without confirm:true → 403 and zero rows", async () => {
    const device = "commerce-no-confirm-device";
    for (const body of [{}, { confirm: false }, { confirm: "true" }, { confirm: 1, public_name: "X" }]) {
      const res = await fetch(`${base}/api/storefront`, {
        method: "POST", headers: { ...H, "x-device-id": device }, body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    }
    expect(entities.list(sys, "Storefront", { vendor_id: vendorIdOf(device) })).toHaveLength(0);
  });

  it("same vendor twice → same slug, one Storefront row (direct fn)", async () => {
    const p1 = await provision_storefront({ vendor_id: "prov-idem", display_name: "Rosa", confirm: true });
    const p2 = await provision_storefront({ vendor_id: "prov-idem", display_name: "Rosa", confirm: true });
    expect(p1.ok && p2.ok).toBe(true);
    if (p1.ok && p2.ok) expect(p2.data.slug).toBe(p1.data.slug);
    expect(entities.list(sys, "Storefront", { vendor_id: "prov-idem" })).toHaveLength(1);
  });

  it("HTTP provisioning retry keeps the same slug and a single row", async () => {
    const first = await fetch(`${base}/api/storefront`, {
      method: "POST", headers: H,
      body: JSON.stringify({ confirm: true, public_name: "Tamales Rosa Test", category: "food", products: [{ title: "Tamal verde", price_usd: 4 }], lang: "es" }),
    });
    expect(first.status).toBe(200);
    const j1 = (await first.json()) as { ok: boolean; data: { slug: string } };
    const second = await fetch(`${base}/api/storefront`, {
      method: "POST", headers: H, body: JSON.stringify({ confirm: true, lang: "es" }),
    });
    const j2 = (await second.json()) as { ok: boolean; data: { slug: string } };
    expect(j2.data.slug).toBe(j1.data.slug);
    expect(entities.list(sys, "Storefront", { vendor_id: VID })).toHaveLength(1);
    slug = j1.data.slug;
  });
});

describe("catalog price gate (invariant 9)", () => {
  it("/api/store/item without confirm → 403, no row written", async () => {
    const before = entities.list(sys, "CatalogItem", { vendor_id: VID }).length;
    const res = await fetch(`${base}/api/store/item`, {
      method: "POST", headers: H,
      body: JSON.stringify({ lang: "es", item: { title: "Elote", price_usd: 3, availability: "available" } }),
    });
    expect(res.status).toBe(403);
    expect(entities.list(sys, "CatalogItem", { vendor_id: VID }).length).toBe(before);
  });

  it("item without an explicit numeric price_usd → schema-rejected 403", async () => {
    for (const item of [
      { title: "Elote" }, // missing price
      { title: "Elote", price_usd: "3" }, // string, not a number
      { title: "Elote", price_usd: 0 }, // not positive
    ]) {
      const res = await fetch(`${base}/api/store/item`, {
        method: "POST", headers: H, body: JSON.stringify({ confirm: true, lang: "es", item }),
      });
      expect(res.status).toBe(403);
    }
  });

  it("with confirm + explicit price → 200 (sold_out item for the checkout tests)", async () => {
    const res = await fetch(`${base}/api/store/item`, {
      method: "POST", headers: H,
      body: JSON.stringify({ confirm: true, lang: "es", item: { title: "Agua fresca", price_usd: 2, availability: "sold_out" } }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; data: { item_id: string } };
    soldOutId = j.data.item_id;
    const store = (await (await fetch(`${base}/api/store`, { headers: H })).json()) as {
      items: Array<{ id: string; availability: string; price: number }>;
    };
    itemId = store.items.find((i) => i.availability === "available")!.id;
    expect(itemId).toBeTruthy();
  });
});

describe("checkout price revalidation (§14)", () => {
  it("client-tampered price is ignored — the order totals from the server catalog", async () => {
    const res = await fetch(`${base}/api/shop/${slug}/checkout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ item_id: itemId, qty: 1, price: 0.01, unit_price: 0.01, price_usd: 0.01 }], total: 0.01, lang: "en" }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; data: { mode: string; total: number; order_token: string } };
    expect(j.data.total).toBe(4); // server price, not the tampered $0.01
    const order = entities.list(sys, "CommerceOrder", { vendor_id: VID }).find((o) => o.token === j.data.order_token);
    expect(order?.total).toBe(4);
  });

  it("direct create_checkout with qty 2 → total is 2× the server price", async () => {
    const r = await create_checkout({ slug, items: [{ item_id: itemId, qty: 2 }], lang: "en" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.total).toBe(8);
  });

  it("sold_out item → rejected", async () => {
    const res = await fetch(`${base}/api/shop/${slug}/checkout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ item_id: soldOutId, qty: 1 }], lang: "en" }),
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok: boolean; error: string };
    expect(j.error).toMatch(/sold out/i);
  });

  it("closed store → rejected (then reopened)", async () => {
    await fetch(`${base}/api/store/state`, { method: "POST", headers: H, body: JSON.stringify({ open_state: "closed" }) });
    const res = await fetch(`${base}/api/shop/${slug}/checkout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ item_id: itemId, qty: 1 }], lang: "en" }),
    });
    expect(res.status).toBe(400);
    await fetch(`${base}/api/store/state`, { method: "POST", headers: H, body: JSON.stringify({ open_state: "open" }) });
  });
});

describe("webhook wall (§14)", () => {
  it("invalid HMAC → 401 and zero CommerceOrder/EvidenceRecord rows", async () => {
    const res = await postSigned(
      { id: "ORD-FORGED-1", total_price: "99.00", currency: "USD", note_attributes: [{ name: "vendor_id", value: "hmac-fail-vendor" }] },
      "wh-forged-1", true,
    );
    expect(res.status).toBe(401);
    expect(entities.list(sys, "CommerceOrder", { vendor_id: "hmac-fail-vendor" })).toHaveLength(0);
    expect(entities.list(sys, "EvidenceRecord", { vendor_id: "hmac-fail-vendor" })).toHaveLength(0);
  });

  it("replayed delivery (same webhook id) → deduped; exactly one order + one grade-A record", async () => {
    const body = { id: "ORD-REPLAY-1", total_price: "9.00", currency: "USD", note_attributes: [{ name: "vendor_id", value: "replay-vendor" }] };
    const r1 = await postSigned(body, "wh-replay-A");
    const r2 = await postSigned(body, "wh-replay-A");
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as { ok: boolean; data: { deduped: boolean } };
    expect(j2.data.deduped).toBe(true);
    expect(entities.list(sys, "CommerceOrder", { vendor_id: "replay-vendor" })).toHaveLength(1);
    const ev = entities.list(sys, "EvidenceRecord", { vendor_id: "replay-vendor" });
    expect(ev).toHaveLength(1);
    expect(ev[0].grade).toBe("A_card_verified");
  });

  it("same order id under a NEW webhook id → still exactly one order + one grade-A record", async () => {
    const body = { id: "ORD-REPLAY-1", total_price: "9.00", currency: "USD", note_attributes: [{ name: "vendor_id", value: "replay-vendor" }] };
    const r = await postSigned(body, "wh-replay-B");
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; data: { deduped: boolean } };
    expect(j.data.deduped).toBe(true);
    expect(entities.list(sys, "CommerceOrder", { vendor_id: "replay-vendor" })).toHaveLength(1);
    expect(entities.list(sys, "EvidenceRecord", { vendor_id: "replay-vendor" })).toHaveLength(1);
  });
});

describe("cancel gate (invariant 9)", () => {
  let orderId = "";
  let secondOrderId = "";

  it("cancel without confirm_cancel → 403 and state unchanged", async () => {
    const store = (await (await fetch(`${base}/api/store`, { headers: H })).json()) as {
      orders: Array<{ id: string; fulfillment: string }>;
    };
    const fresh = store.orders.filter((o) => o.fulfillment === "new");
    expect(fresh.length).toBeGreaterThanOrEqual(2); // from the two checkout tests
    orderId = fresh[0].id;
    secondOrderId = fresh[1].id;
    const res = await fetch(`${base}/api/store/order/${orderId}/status`, {
      method: "POST", headers: H, body: JSON.stringify({ to: "cancelled" }),
    });
    expect(res.status).toBe(403);
    expect(entities.get(sys, "CommerceOrder", orderId)?.fulfillment).toBe("new");
  });

  it("cancel with confirm_cancel:true → cancelled", async () => {
    const res = await fetch(`${base}/api/store/order/${orderId}/status`, {
      method: "POST", headers: H, body: JSON.stringify({ to: "cancelled", confirm_cancel: true }),
    });
    expect(res.status).toBe(200);
    expect(entities.get(sys, "CommerceOrder", orderId)?.fulfillment).toBe("cancelled");
  });

  it("invalid transitions are rejected", async () => {
    // cancelled is terminal
    const r1 = await fetch(`${base}/api/store/order/${orderId}/status`, {
      method: "POST", headers: H, body: JSON.stringify({ to: "accepted" }),
    });
    expect(r1.status).toBe(400);
    // new cannot skip straight to picked_up
    const r2 = await fetch(`${base}/api/store/order/${secondOrderId}/status`, {
      method: "POST", headers: H, body: JSON.stringify({ to: "picked_up" }),
    });
    expect(r2.status).toBe(400);
    expect(entities.get(sys, "CommerceOrder", secondOrderId)?.fulfillment).toBe("new");
  });
});

describe("public projections fail closed (§14)", () => {
  it("GET /api/shop/:slug returns ONLY allowlisted fields", async () => {
    const j = (await (await fetch(`${base}/api/shop/${slug}`)).json()) as {
      ok: boolean; storefront: Record<string, unknown>; items: Array<Record<string, unknown>>;
    };
    const sfAllow: readonly string[] = PUBLIC_STOREFRONT_FIELDS;
    const itemAllow: readonly string[] = ["id", ...PUBLIC_ITEM_FIELDS];
    for (const k of Object.keys(j.storefront)) expect(sfAllow, `storefront leaked "${k}"`).toContain(k);
    expect(j.items.length).toBeGreaterThan(0);
    for (const item of j.items) {
      for (const k of Object.keys(item)) expect(itemAllow, `item leaked "${k}"`).toContain(k);
    }
    // the fields that must never appear
    for (const bad of ["vendor_id", "id", "shopify_collection_id", "qr_url", "discovery_opt_in", "payment_link_url"]) {
      expect(j.storefront[bad], `storefront.${bad}`).toBeUndefined();
    }
    expect(j.items[0].vendor_id).toBeUndefined();
    expect(j.items[0].shopify_product_id).toBeUndefined();
  });

  it("/api/discover never lists a non-opted-in storefront, and fields stay allowlisted", async () => {
    const p = await provision_storefront({
      vendor_id: "optout-vendor", display_name: "Hidden Cart Test", discovery_opt_in: false,
      products: [{ title: "Elote", price_usd: 3 }], confirm: true,
    });
    expect(p.ok).toBe(true);
    const j = (await (await fetch(`${base}/api/discover`)).json()) as {
      ok: boolean; data: { storefronts: Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }> };
    };
    expect(j.data.storefronts.some((s) => s.public_name === "Hidden Cart Test")).toBe(false);
    const optOutSlug = p.ok ? p.data.slug : "";
    expect(j.data.storefronts.some((s) => s.slug === optOutSlug)).toBe(false);
    expect(j.data.storefronts.some((s) => s.slug === slug)).toBe(true); // opted-in store IS listed
    const sfAllow: readonly string[] = [...PUBLIC_STOREFRONT_FIELDS, "items"];
    const itemAllow: readonly string[] = PUBLIC_ITEM_FIELDS;
    for (const s of j.data.storefronts) {
      for (const k of Object.keys(s)) expect(sfAllow, `discover storefront leaked "${k}"`).toContain(k);
      for (const item of s.items) for (const k of Object.keys(item)) expect(itemAllow, `discover item leaked "${k}"`).toContain(k);
    }
  });
});

describe("no shopper PII (invariant 14)", () => {
  const PII_KEY = /email|phone|customer|first_name|last_name|address|billing|shipping/i;

  it("a webhook carrying shopper contact fields mirrors NONE of them", async () => {
    const res = await postSigned({
      id: "ORD-PII-1", total_price: "6.00", currency: "USD",
      email: "shopper@example.com", contact_email: "shopper@example.com", phone: "+15551234567",
      customer: { email: "shopper@example.com", first_name: "Ana", last_name: "P", phone: "+15551234567" },
      shipping_address: { address1: "1 Main St" }, billing_address: { address1: "1 Main St" },
      note_attributes: [{ name: "vendor_id", value: "pii-vendor" }],
    }, "wh-pii-1");
    expect(res.status).toBe(200);
    const rows = entities.list(sys, "CommerceOrder", { vendor_id: "pii-vendor" });
    expect(rows).toHaveLength(1);
    for (const k of Object.keys(rows[0])) expect(PII_KEY.test(k), `CommerceOrder leaked key "${k}"`).toBe(false);
    expect(JSON.stringify(rows[0])).not.toMatch(/shopper@example\.com|5551234567|1 Main St|Ana/);
  });

  it("no CommerceOrder row anywhere carries a PII-shaped key", () => {
    for (const row of entities.list(sys, "CommerceOrder")) {
      for (const k of Object.keys(row)) expect(PII_KEY.test(k), `CommerceOrder leaked key "${k}"`).toBe(false);
    }
  });
});

describe("cash log stays grade B (invariant 14 — no fabricated commerce state)", () => {
  it("a later card webhook for the same amount never upgrades the cash record to A", async () => {
    const cash = await log_cash_sale({ vendor_id: "cash-grade-vendor", text: "$25 in cash", lang: "en" });
    expect(cash.ok && cash.data.logged).toBe(true);
    const recordId = cash.ok && cash.data.logged ? cash.data.record_id : "";
    const res = await postSigned(
      { id: "ORD-CASH-25", total_price: "25.00", currency: "USD", note_attributes: [{ name: "vendor_id", value: "cash-grade-vendor" }] },
      "wh-cash-25",
    );
    expect(res.status).toBe(200);
    const rec = entities.get(sys, "EvidenceRecord", recordId);
    expect(rec?.grade).toBe("B_self_reported"); // no upgrade path exists
    const all = entities.list(sys, "EvidenceRecord", { vendor_id: "cash-grade-vendor" });
    expect(all.filter((r) => r.kind === "cash_log" && r.grade !== "B_self_reported")).toHaveLength(0);
    expect(all.filter((r) => r.grade === "A_card_verified")).toHaveLength(1);
    expect(all.filter((r) => r.grade === "B_self_reported")).toHaveLength(1);
  });
});
