/**
 * §14: confirmation gates have real barrier semantics — the harness attempts to bypass
 * the filing gate and the payments gate, and must fail. Also verifies the webhook HMAC wall.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { app } from "../src/index.js";
import { provision_storefront } from "../src/functions/provision_storefront.js";
import { verifyShopifyHmac } from "../src/functions/shopify_webhook.js";
import { createHmac } from "node:crypto";

let server: Server;
let base = "";
const H = { "content-type": "application/json", "x-device-id": "gate-test-device" };

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => server?.close());

describe("invariant 9 — gates physically block", () => {
  it("filing without the human confirmation → 403, no state change", async () => {
    for (const attempt of [
      { body: {} },
      { body: { confirm_phrase: "FILE WITH THE CITY" } }, // phrase alone is not enough
      { body: { confirm_phrase: "file with the city" }, headers: { "x-human-confirm": "yes" } }, // wrong case
      { body: { confirm: true, bypass: true, admin: true } },
    ]) {
      const res = await fetch(`${base}/api/file_packet`, {
        method: "POST",
        headers: { ...H, ...(attempt as { headers?: Record<string, string> }).headers },
        body: JSON.stringify(attempt.body),
      });
      expect(res.status).toBe(403);
    }
  });

  it("filing with explicit human confirmation → allowed (and still never auto-submits)", async () => {
    const res = await fetch(`${base}/api/file_packet`, {
      method: "POST",
      headers: { ...H, "x-human-confirm": "yes" },
      body: JSON.stringify({ confirm_phrase: "FILE WITH THE CITY" }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { note: string };
    expect(j.note).toMatch(/No automatic submission/);
  });

  it("provisioning payments without confirm:true → schema-rejected before any side effect", async () => {
    for (const confirm of [undefined, false, "true", 1]) {
      const res = await provision_storefront({
        vendor_id: "gate-test", display_name: "X", products: [{ title: "t", price_usd: 1 }], confirm,
      });
      expect(res.ok).toBe(false);
    }
  });
});

describe("webhook HMAC wall", () => {
  it("rejects a forged orders/create", async () => {
    const res = await fetch(`${base}/webhooks/shopify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-hmac-sha256": "Zm9yZ2Vk" },
      body: JSON.stringify({ id: "FAKE", total_price: "99.00" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts a correctly signed orders/create → grade-A evidence", async () => {
    const payload = Buffer.from(JSON.stringify({
      id: "TEST-1", total_price: "15.50", currency: "USD",
      note_attributes: [{ name: "vendor_id", value: "web-gatetest0000" }],
    }));
    const hmac = createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET ?? "dev-secret-change-me").update(payload).digest("base64");
    expect(verifyShopifyHmac(payload, hmac)).toBe(true);
    const res = await fetch(`${base}/webhooks/shopify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-hmac-sha256": hmac },
      body: payload,
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; data: { counts: { a: number } } };
    expect(j.ok).toBe(true);
    expect(j.data.counts.a).toBeGreaterThanOrEqual(1);
  });
});

describe("RLS at the API surface", () => {
  it("console endpoints require a bearer token", async () => {
    const res = await fetch(`${base}/api/console/queue`);
    expect(res.status).toBe(401);
  });
  it("MCP requires a bearer token", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });
  it("media URLs expire and verify signatures", async () => {
    const res = await fetch(`${base}/media/abc123?exp=1&sig=bad`);
    expect(res.status).toBe(403);
  });
});
