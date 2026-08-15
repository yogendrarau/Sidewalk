/**
 * Shopify connection (real store via OAuth) — ported from teammate Yogi's
 * NYCHackathon `sidewalk-version-b` build (functions/shopify_oauth).
 *
 * Shopify's Dev Dashboard apps no longer hand out a static Admin API token the
 * way legacy custom apps did; a store's token is minted only by completing
 * OAuth. This module is both halves of that install flow plus the credential
 * lookup every commerce function uses:
 *
 *   GET /shopify/oauth?shop=<store>.myshopify.com  → redirect to Shopify's
 *                                                    authorize screen (offline token)
 *   GET /shopify/oauth?code=…&hmac=…&shop=…        → verify the HMAC, exchange the
 *                                                    code for a token, store it
 *
 * The token lives server-side in an IntegrationCredential row (system-role
 * only — no vendor and no org ctx can read it) and is never returned to a
 * browser. Commerce functions call shopifyCreds(): a completed install flips
 * the storefront from the simulated adapter to the real Admin API with no
 * restart. Env SHOPIFY_STORE + SHOPIFY_ADMIN_TOKEN still wins when present.
 */
import type { Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { entities, type Ctx } from "./entities.js";
import { env } from "./env.js";

const sys: Ctx = { kind: "system" };

/** Scopes the storefront loop actually needs — not the app's full grant. */
const SCOPES = "write_products,read_products,write_draft_orders,read_orders,write_orders";
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function shopifyCreds(): { shop: string; token: string; source: "env" | "oauth" } | null {
  const envShop = process.env.SHOPIFY_STORE;
  const envToken = process.env.SHOPIFY_ADMIN_TOKEN;
  if (envShop && envToken) return { shop: envShop, token: envToken, source: "env" };
  const row = entities.list(sys, "IntegrationCredential", { provider: "shopify" }).at(-1);
  if (row?.shop && row?.access_token) return { shop: String(row.shop), token: String(row.access_token), source: "oauth" };
  return null;
}

/** OAuth apps sign webhooks with the app's client secret; the explicit var still wins. */
export function webhookSecret(): string {
  return process.env.SHOPIFY_WEBHOOK_SECRET ?? process.env.SHOPIFY_CLIENT_SECRET ?? "dev-secret-change-me";
}

function hmacHex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Shopify signs the callback query string: every param except `hmac`, sorted,
 * joined as key=value pairs with `&`.
 */
function callbackSignatureValid(query: Record<string, unknown>, secret: string): boolean {
  const provided = String(query.hmac ?? "");
  if (!provided) return false;
  const pairs = Object.entries(query)
    .filter(([k]) => k !== "hmac")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort();
  return safeEqual(hmacHex(pairs.join("&"), secret), provided);
}

function page(res: Response, title: string, body: string, status = 200): void {
  res.status(status).type("html").send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title>` +
      `<body style="font-family:system-ui;margin:0;padding:2rem;background:#faf6ef;color:#1c1917">` +
      `<div style="max-width:34rem;margin:3rem auto;background:#fff;border-radius:12px;padding:2rem;` +
      `box-shadow:0 1px 3px rgba(0,0,0,.08)">${body}</div></body>`,
  );
}

/** Both halves of the install flow on one route: GET /shopify/oauth */
export async function shopifyOauthHandler(req: Request, res: Response): Promise<void> {
  const shop = String(req.query.shop ?? "").toLowerCase().trim();
  const code = req.query.code ? String(req.query.code) : null;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const publicOrigin = env("PUBLIC_BASE_URL", `http://localhost:${env("PORT", "4477")}`);

  if (!clientId || !clientSecret) {
    page(res, "Shopify not configured",
      `<h1>Shopify is not configured</h1><p>Set <code>SHOPIFY_CLIENT_ID</code> and ` +
      `<code>SHOPIFY_CLIENT_SECRET</code> in <code>.env</code>, then start the install again.</p>`, 503);
    return;
  }
  if (!SHOP_RE.test(shop)) {
    page(res, "Which store?",
      `<h1>Which store?</h1><p>Add the shop domain, for example:</p>` +
      `<p><code>/shopify/oauth?shop=your-store.myshopify.com</code></p>`, 400);
    return;
  }

  // ── Install: send the merchant to Shopify's authorize screen ──────────────
  if (!code) {
    const state = randomBytes(16).toString("hex");
    // Must match the redirect URL registered on the app exactly.
    const redirectUri = `${publicOrigin}/shopify/oauth`;
    const authorize =
      `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;
    res.status(302)
      .setHeader("set-cookie", `sidewalk_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    res.redirect(authorize);
    return;
  }

  // ── Callback: verify, exchange, store ─────────────────────────────────────
  if (!callbackSignatureValid(req.query as Record<string, unknown>, clientSecret)) {
    page(res, "Invalid signature", `<h1>Invalid signature</h1><p>This callback did not come from Shopify.</p>`, 401);
    return;
  }
  const returnedState = String(req.query.state ?? "");
  const cookieState = /sidewalk_oauth_state=([a-f0-9]+)/.exec(String(req.headers.cookie ?? ""))?.[1];
  if (cookieState && returnedState && cookieState !== returnedState) {
    page(res, "State mismatch", `<h1>State mismatch</h1><p>Start the install again.</p>`, 400);
    return;
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    page(res, "Token exchange failed", `<h1>Token exchange failed</h1><p>Shopify returned HTTP ${tokenRes.status}.</p>`, 502);
    return;
  }
  const tokenBody = (await tokenRes.json()) as { access_token?: string; scope?: string };
  if (!tokenBody.access_token) {
    page(res, "No token returned", `<h1>No token returned</h1><p>Shopify's response had no access token.</p>`, 502);
    return;
  }

  // Store server-side. System role only — no ctx but system can read this entity,
  // and nothing ever returns the value to a browser.
  const existing = entities.list(sys, "IntegrationCredential", { provider: "shopify", shop })[0];
  const row = {
    provider: "shopify", shop, access_token: tokenBody.access_token,
    scopes: tokenBody.scope ?? SCOPES, installed_at: new Date().toISOString(),
  };
  if (existing) entities.update(sys, "IntegrationCredential", existing.id, row);
  else entities.create(sys, "IntegrationCredential", row);

  page(res, "Sidewalk is connected",
    `<h1>Sidewalk is connected to ${shop}</h1>` +
    `<p>Storefronts and catalog items published from My Store are now real Shopify products.</p>` +
    `<p><a href="${publicOrigin}/app/store">Back to Sidewalk</a></p>`);
}
