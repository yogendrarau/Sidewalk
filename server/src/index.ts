/** SIDEWALK host (v3 — one standalone app): merchant API + shopper API + realtime + webhook + console + MCP + static. */
import "./env.js";
import express from "express";
import QRCode from "qrcode";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { ROOT, MEDIA_DIR } from "./db.js";
import { env } from "./env.js";
import { entities, verifyMediaSig, publicStorefront, publicItem, publicOrder, type Ctx } from "./entities.js";
import { loadRulebook } from "./rulebook.js";
import { evaluate, type CaseFacts } from "./engine.js";
import { factsFor, recordFact } from "./facts.js";
import { vendorIdOf } from "./identity.js";
import { subscribe, realtimeStats } from "./realtime.js";
import { assistant_route } from "./functions/assistant_route.js";
import { provision_storefront } from "./functions/provision_storefront.js";
import { catalog_draft, catalog_item_upsert } from "./functions/catalog_item_upsert.js";
import { create_checkout } from "./functions/create_checkout.js";
import { discover_storefronts } from "./functions/discover_storefronts.js";
import { update_order_status } from "./functions/update_order_status.js";
import { capture_feedback } from "./functions/capture_feedback.js";
import { deadline_nudges } from "./functions/deadline_nudges.js";
import { shopify_webhook, verifyShopifyHmac } from "./functions/shopify_webhook.js";
import { compose_packet } from "./functions/compose_packet.js";
import { scam_radar } from "./functions/scam_radar.js";
import { heat_watch, course_prep, find_commissary, socrata_sync } from "./functions/misc_flows.js";
import { synthesize_speech } from "./functions/synthesize_speech.js";
import { verify_summons } from "./functions/verify_summons.js";
import { telemetrySummary } from "./functions/_fn.js";
import { MCP_TOOLS, callMcpTool } from "./mcp.js";

const app = express();
const sys: Ctx = { kind: "system" };

export function lanIp(): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return "localhost";
}
const PORT = Number(env("PORT", "4477"));
const baseUrl = () => env("PUBLIC_BASE_URL", `http://${lanIp()}:${PORT}`);

// raw body only where HMAC needs it; JSON elsewhere
app.use("/webhooks/shopify", express.raw({ type: "*/*", limit: "1mb" }));
app.use(express.json({ limit: "30mb" }));

const vendorOf = (req: express.Request): { vendor_id: string; ctx: Ctx } => {
  const deviceId = String(req.headers["x-device-id"] ?? req.query.device_id ?? "");
  if (!deviceId) throw new Error("missing x-device-id");
  const vendor_id = vendorIdOf(deviceId);
  return { vendor_id, ctx: { kind: "vendor", vendor_id } };
};

const orgOf = (req: express.Request): Ctx | null => {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || String(req.query.token ?? "");
  if (!token) return null;
  const org = entities.list(sys, "Org").find((o) => o.token === token);
  if (!org) return null;
  return { kind: "org", org_id: String(org.org_id ?? org.id), grants: (org.grants as string[]) ?? [], admin: Boolean(org.admin) };
};

const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

// ---------- config / health
app.get("/api/config", (_req, res) => {
  res.json({
    ok: true,
    base_url: baseUrl(),
    demo_mode: env("DEMO_MODE", "1") === "1",
    lang_tiers: JSON.parse(readFileSync(join(ROOT, "config", "lang_tiers.json"), "utf8")),
    rulebook_version: loadRulebook().hash,
    model_tiers: {
      asr: process.env.ASR_ENDPOINT ? "managed" : "browser",
      tts: process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "browser",
      explain: process.env.ANTHROPIC_API_KEY ? "llm+gate" : "template",
      extract: process.env.ANTHROPIC_API_KEY ? "vlm" : "fixture",
      shopify: process.env.SHOPIFY_ADMIN_TOKEN ? "shopify" : "simulated",
    },
  });
});

// ---------- realtime (emulates Base44 realtime subscriptions; §11)
app.get("/api/events", (req, res) => {
  const topics: string[] = [];
  try {
    const { vendor_id } = vendorOf(req);
    topics.push(`vendor:${vendor_id}`);
  } catch { /* not a merchant subscriber */ }
  const orgCtx = orgOf(req);
  if (orgCtx) topics.push("org:*");
  const orderToken = String(req.query.order ?? "");
  if (orderToken) topics.push(`order:${orderToken}`);
  if (!topics.length) { res.status(401).json({ ok: false, error: "no subscribable identity" }); return; }
  subscribe(res, topics);
});

// ---------- media (signed expiring URLs; invariant 4)
app.post("/api/media", wrap(async (req, res) => {
  vendorOf(req);
  const { data_base64, ext } = req.body as { data_base64: string; ext: string };
  const buf = Buffer.from(data_base64, "base64");
  if (buf.length > 20 * 1024 * 1024) throw new Error("too large");
  const sha = createHash("sha256").update(buf).digest("hex");
  writeFileSync(join(MEDIA_DIR, sha), buf);
  res.json({ ok: true, sha256: sha, ext });
}));

app.get("/media/:sha", (req, res) => {
  const { exp, sig } = req.query as { exp?: string; sig?: string };
  if (!exp || !sig || !verifyMediaSig(req.params.sha, exp, sig)) {
    res.status(403).send("expired or invalid signature");
    return;
  }
  const p = join(MEDIA_DIR, req.params.sha.replace(/[^a-f0-9]/g, ""));
  if (!existsSync(p)) { res.status(404).end(); return; }
  res.sendFile(p);
});

// public catalog images only: signature-free read for shas referenced by a CatalogItem image_url
app.get("/shop-media/:sha", (req, res) => {
  const sha = req.params.sha.replace(/[^a-f0-9]/g, "");
  const referenced = entities.list(sys, "CatalogItem").some((i) => String(i.image_url ?? "").includes(sha));
  const p = join(MEDIA_DIR, sha);
  if (!referenced || !existsSync(p)) { res.status(404).end(); return; }
  res.sendFile(p);
});

// ---------- onboarding screener (§10.1: 6 questions + "launch a store now?")
app.post("/api/onboard", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const b = req.body as {
    lang: string; vending_kind: "food" | "merchandise"; years_vending?: string;
    cart_status?: string; documents_on_hand?: string[]; borough?: string; display_name?: string;
    radar_opt_in?: boolean; launch_store_now?: boolean;
  };
  const existing = entities.list(ctx, "Vendor", { vendor_id })[0];
  const vendorData = {
    vendor_id, display_name: b.display_name ?? "Vendor", languages: [b.lang],
    boro_district: b.borough ?? null, area_nta: b.borough ? `${b.borough}-demo` : null,
    consented_at: new Date().toISOString(), radar_opt_in: b.radar_opt_in ?? true, deletion_requested: false,
  };
  if (existing) entities.update(ctx, "Vendor", existing.id, vendorData);
  else entities.create(ctx, "Vendor", vendorData);

  recordFact(vendor_id, "vending_kind", b.vending_kind);
  recordFact(vendor_id, "wants", "license");
  if (b.borough) recordFact(vendor_id, "area_nta", `${b.borough}-demo`);
  for (const d of b.documents_on_hand ?? []) recordFact(vendor_id, `has_${d}`, true);

  const ev = evaluate(loadRulebook(), { ...factsFor(vendor_id), documents_present: (b.documents_on_hand ?? []).sort() } as CaseFacts);
  const cf = entities.list(ctx, "CaseFile", { vendor_id })[0];
  const caseData = {
    vendor_id, track: ev.track ?? "unknown", status: "intake",
    blocking_defects: ev.documents?.missing ?? [], application_ids: [],
  };
  const caseRow = cf ? entities.update(ctx, "CaseFile", cf.id, caseData) : entities.create(ctx, "CaseFile", caseData);
  res.json({
    ok: true, vendor_id, case_id: caseRow.id, track: ev.track, checklist: ev.documents,
    next_steps: ev.sequencer?.next_steps ?? [], launch_store_now: Boolean(b.launch_store_now),
  });
}));

// ---------- the assistant (merchant voice/text loop)
app.post("/api/inbound", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const b = req.body as Record<string, unknown>;
  const result = await assistant_route({
    vendor_id,
    lang: String(b.lang ?? "es"),
    kind: (b.kind as "text" | "audio" | "image" | "location") ?? "text",
    text: b.text as string | undefined,
    sha256: b.sha256 as string | undefined,
    ext: b.ext as string | undefined,
    lat: b.lat as number | undefined,
    lon: b.lon as number | undefined,
    doc_type_claimed: b.doc_type_claimed as string | undefined,
    image_purpose: b.image_purpose as "document" | "summons" | "letter" | "voucher" | undefined,
  });
  if (!result.ok) { res.status(422).json(result); return; }
  const tts = await synthesize_speech({ sentences: result.data.reply.sentences, lang: String(b.lang ?? "es") });
  res.json({ ...result, tts: tts.ok ? tts.data : { audio_unavailable: true, tier: "browser" } });
}));

app.get("/api/messages", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  res.json({ ok: true, messages: entities.list(ctx, "Message", { vendor_id }).slice(-60) });
}));

// ---------- notifications (Base44-automation output surface; §8 scheduler)
app.get("/api/notifications", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  res.json({ ok: true, notifications: entities.list(ctx, "AppNotification", { vendor_id }).slice(-20).reverse() });
}));
app.post("/api/notifications/:id/read", wrap(async (req, res) => {
  const { ctx } = vendorOf(req);
  res.json({ ok: true, row: entities.update(ctx, "AppNotification", String(req.params.id), { read_at: new Date().toISOString() }) });
}));

// ---------- My Case
app.get("/api/case", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const docs = entities.list(ctx, "DocumentImage", { vendor_id });
  const ev = evaluate(loadRulebook(), {
    ...factsFor(vendor_id),
    documents_present: [...new Set(docs.map((d) => String(d.doc_type ?? d.doc_type_claimed)))].sort(),
  } as CaseFacts);
  const deadlines = entities.list(ctx, "Deadline", { vendor_id })
    .filter((d) => String(d.due_at) > new Date().toISOString())
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
  res.json({
    ok: true,
    case: entities.list(ctx, "CaseFile", { vendor_id })[0] ?? null,
    track: ev.track, documents: ev.documents, next_steps: ev.sequencer?.next_steps ?? [],
    timeline_days_range: ev.sequencer?.timeline_days_range ?? null,
    next_deadline: deadlines[0] ?? null, deadlines: deadlines.slice(0, 5),
    doc_count: docs.length,
  });
}));

// ---------- My Store (merchant commerce surface)
app.get("/api/store", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const storefront = entities.list(ctx, "Storefront", { vendor_id })[0] ?? null;
  const items = storefront
    ? entities.list(ctx, "CatalogItem", { vendor_id }).sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    : [];
  const orders = entities.list(ctx, "CommerceOrder", { vendor_id })
    .sort((a, b) => String(b.placed_at).localeCompare(String(a.placed_at)));
  const evidence = entities.list(ctx, "EvidenceRecord", { vendor_id });
  res.json({
    ok: true, storefront, items, orders: orders.slice(0, 25),
    shopper_url: storefront ? `${baseUrl()}/shop/${storefront.slug}` : null,
    evidence: {
      total: evidence.length,
      a_count: evidence.filter((e) => e.grade === "A_card_verified").length,
      b_count: evidence.filter((e) => e.grade === "B_self_reported").length,
      sum: Math.round(evidence.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100,
      recent: evidence.slice(-12).reverse(),
    },
  });
}));

// legacy alias (older tests/screens): same shape essentials
app.get("/api/sales", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const evidence = entities.list(ctx, "EvidenceRecord", { vendor_id });
  res.json({
    ok: true,
    storefront: entities.list(ctx, "Storefront", { vendor_id })[0] ?? null,
    evidence: {
      total: evidence.length,
      a_count: evidence.filter((e) => e.grade === "A_card_verified").length,
      b_count: evidence.filter((e) => e.grade === "B_self_reported").length,
      sum: evidence.reduce((s, e) => s + Number(e.amount), 0),
      recent: evidence.slice(-12).reverse(),
    },
  });
}));

// provisioning (confirm-gated — invariant 9; schema rejects without confirm:true)
app.post("/api/storefront", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const vendor = entities.list(ctx, "Vendor", { vendor_id })[0];
  const b = req.body as Record<string, unknown>;
  const result = await provision_storefront({
    vendor_id,
    display_name: String(vendor?.display_name ?? "Vendor"),
    public_name: b.public_name as string | undefined,
    category: (b.category as string) ?? "food",
    pickup_note: b.pickup_note as string | undefined,
    discovery_opt_in: (b.discovery_opt_in as boolean) ?? true,
    public_nta: (vendor?.area_nta as string) ?? null,
    langs: (vendor?.languages as string[]) ?? ["es"],
    lang: (b.lang as string) ?? "es",
    products: (b.products as Array<{ title: string; price_usd: number }>) ?? [],
    confirm: b.confirm, // must be literal true — the gate physically blocks otherwise
  });
  res.status(result.ok ? 200 : 403).json(result);
}));

// menu photo → structured DRAFT (no writes, no price invention)
app.post("/api/store/draft", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const b = req.body as { sha256: string; ext?: string };
  res.json(await catalog_draft({ vendor_id, sha256: b.sha256, ext: b.ext ?? "png" }));
}));

// catalog write (confirm-gated — publishing/changing a price physically blocks; invariant 9)
app.post("/api/store/item", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const b = req.body as Record<string, unknown>;
  const result = await catalog_item_upsert({ vendor_id, confirm: b.confirm, item: b.item, lang: (b.lang as string) ?? "es" });
  res.status(result.ok ? 200 : 403).json(result);
}));

// open/closed/paused
app.post("/api/store/state", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const to = String((req.body as { open_state: string }).open_state);
  if (!["open", "closed", "paused"].includes(to)) throw new Error("bad state");
  const store = entities.list(ctx, "Storefront", { vendor_id })[0];
  if (!store) throw new Error("no storefront");
  res.json({ ok: true, storefront: entities.update(ctx, "Storefront", store.id, { open_state: to }) });
}));

// order lifecycle (cancel is confirm-gated inside the function; invariant 9)
app.post("/api/store/order/:id/status", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const b = req.body as { to: string; confirm_cancel?: boolean };
  const result = await update_order_status({ vendor_id, order_id: req.params.id, to: b.to, confirm_cancel: b.confirm_cancel });
  res.status(result.ok ? 200 : result.error.includes("confirmation") ? 403 : 400).json(result);
}));

// ---------- shopper surface (anonymous; sanitized projections ONLY)
app.get("/api/shop/:slug", wrap(async (req, res) => {
  const store = entities.list(sys, "Storefront").find((s) => s.slug === req.params.slug);
  if (!store) { res.status(404).json({ ok: false, error: "not found" }); return; }
  const items = entities.list(sys, "CatalogItem", { storefront_id: store.id })
    .filter((i) => i.availability !== "hidden")
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((i) => ({ id: i.id, ...(publicItem(i) as Record<string, unknown>) }));
  res.json({ ok: true, storefront: publicStorefront(store), items });
}));

app.post("/api/shop/:slug/checkout", wrap(async (req, res) => {
  const b = req.body as { items: Array<{ item_id: string; qty: number }>; lang?: string };
  const result = await create_checkout({ slug: req.params.slug, items: b.items, lang: b.lang ?? "en" });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.get("/api/discover", wrap(async (req, res) => {
  res.json(await discover_storefronts({ q: req.query.q ? String(req.query.q) : undefined, lang: String(req.query.lang ?? "en") }));
}));

// shopper order page: the secret token IS the authorization; projection is allowlisted
app.get("/api/order/:token", wrap(async (req, res) => {
  const order = entities.list(sys, "CommerceOrder").find((o) => o.token === req.params.token);
  if (!order) { res.status(404).json({ ok: false, error: "not found" }); return; }
  const store = entities.list(sys, "Storefront").find((s) => s.id === order.storefront_id);
  res.json({ ok: true, order: publicOrder(order), storefront: publicStorefront(store ?? null) });
}));

// legacy QR path from the v2 build → shopper page
app.get("/pay/:vendorId", (req, res) => {
  const store = entities.list(sys, "Storefront", { vendor_id: req.params.vendorId })[0];
  res.redirect(store?.slug ? `/shop/${store.slug}` : "/discover");
});

// ---------- Shopify webhook (HMAC wall + replay protection; §14)
app.post("/webhooks/shopify", wrap(async (req, res) => {
  const raw = req.body as Buffer;
  const webhookId = String(req.headers["x-shopify-webhook-id"] ?? "");
  const hmacOk = verifyShopifyHmac(raw, String(req.headers["x-shopify-hmac-sha256"] ?? ""));
  if (!hmacOk) {
    // zero writes on invalid signature — recorded nowhere except the failure log line
    res.status(401).json({ ok: false, error: "HMAC verification failed" });
    return;
  }
  const body = JSON.parse(raw.toString()) as {
    id: string | number; order_number?: string | number; total_price: string; currency?: string;
    line_items?: Array<{ product_id?: string | number; title?: string; quantity?: number; price?: string }>;
    note_attributes?: Array<{ name: string; value: string }>;
  };
  const attr = (name: string) => body.note_attributes?.find((n) => n.name === name)?.value;
  const result = await shopify_webhook({
    vendor_id: attr("vendor_id") ?? "unattributed",
    order_id: String(body.id),
    order_number: body.order_number !== undefined ? `#${body.order_number}`.replace(/^##/, "#") : undefined,
    amount: Number(body.total_price),
    currency: body.currency ?? "USD",
    items: (body.line_items ?? []).map((l) => ({
      shopify_product_id: String(l.product_id ?? "unknown"), title: String(l.title ?? "Item"),
      qty: Number(l.quantity ?? 1), unit_price: Number(l.price ?? 0),
    })),
    webhook_id: webhookId || undefined,
    order_token: attr("order_token"),
    hmac_verified: true,
  });
  res.json(result);
}));

// ---------- feedback (§3.4 loop)
app.post("/api/feedback", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const b = req.body as { flow: string; rating: string; note?: string; context_ref?: string };
  res.json(await capture_feedback({ vendor_id, flow: b.flow, rating: b.rating, note: b.note, context_ref: b.context_ref }));
}));

// ---------- packet + THE FILING GATE (invariant 9: physically blocks; tested)
app.get("/api/packet", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const cf = entities.list(ctx, "CaseFile", { vendor_id })[0];
  const result = await compose_packet({ vendor_id, case_id: cf?.id ?? "none" });
  res.json(result);
}));

app.post("/api/file_packet", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const phrase = (req.body as { confirm_phrase?: string }).confirm_phrase;
  const header = req.headers["x-human-confirm"];
  if (phrase !== "FILE WITH THE CITY" || header !== "yes") {
    res.status(403).json({
      ok: false,
      error: "Filing requires explicit human confirmation: header x-human-confirm: yes AND confirm_phrase 'FILE WITH THE CITY'. The agent cannot produce this on its own.",
    });
    return;
  }
  // Even fully confirmed, the demo never transmits to the city — it marks ready + logs.
  const ctx: Ctx = { kind: "vendor", vendor_id };
  const cf = entities.list(ctx, "CaseFile", { vendor_id })[0];
  if (cf) entities.update(ctx, "CaseFile", cf.id, { status: "ready" });
  res.json({ ok: true, note: "Packet marked READY for human filing. No automatic submission exists in this system." });
}));

// ---------- deletion on request (invariant 4)
app.post("/api/delete_me", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const n = entities.purgeVendor(ctx, vendor_id);
  res.json({ ok: true, purged_rows: n });
}));

// ---------- automations (Base44 scheduled/event emulation) + demo triggers
async function runAutomation(name: string, fn: () => Promise<{ ok: boolean }>): Promise<{ ok: boolean }> {
  try {
    const out = await fn();
    if (name !== "deadline_nudges") { // deadline_nudges logs its own richer row
      entities.create(sys, "AutomationRun", { name, at: new Date().toISOString(), ok: out.ok, note: "" });
    }
    return out;
  } catch (err) {
    entities.create(sys, "AutomationRun", { name, at: new Date().toISOString(), ok: false, note: String(err).slice(0, 120) });
    return { ok: false };
  }
}

app.post("/api/workflows/:name", wrap(async (req, res) => {
  const name = req.params.name;
  if (name === "heat_watch") { res.json(await runAutomation(name, () => heat_watch({ force: Boolean(req.body?.force) }))); return; }
  if (name === "scam_radar") { res.json(await runAutomation(name, () => scam_radar({ mode: "both" }))); return; }
  if (name === "socrata_sync") { res.json(await runAutomation(name, () => socrata_sync({ mode: "nightly" }))); return; }
  if (name === "deadline_nudges") { res.json(await runAutomation(name, () => deadline_nudges({}))); return; }
  res.status(404).json({ ok: false, error: "unknown workflow" });
}));

app.get("/api/course_prep", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  res.json(await course_prep({ vendor_id, lang: String(req.query.lang ?? "es") }));
}));
app.get("/api/commissary", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  res.json(await find_commissary({ vendor_id }));
}));

// quick Guard demo endpoints
app.post("/api/check/summons", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  res.json(await verify_summons({ vendor_id, ticket_number: String((req.body as { ticket_number: string }).ticket_number ?? "") }));
}));

// ---------- console APIs (org ctx; RLS-scoped — entity security, not frontend filtering)
app.use("/api/console", (req, res, next) => {
  const ctx = orgOf(req);
  if (!ctx) { res.status(401).json({ ok: false, error: "console requires Bearer token" }); return; }
  (req as express.Request & { orgCtx: Ctx }).orgCtx = ctx;
  next();
});

app.get("/api/console/queue", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  const cases = entities.list(ctx, "CaseFile").map((c) => {
    const deadlines = entities.list(ctx, "Deadline", { vendor_id: String(c.vendor_id) })
      .filter((d) => String(d.due_at) > new Date().toISOString())
      .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
    const vendor = entities.list(ctx, "Vendor", { vendor_id: String(c.vendor_id) })[0];
    return {
      vendor_id: c.vendor_id, display_name: vendor?.display_name ?? c.vendor_id,
      track: c.track, status: c.status, blocking_defects: c.blocking_defects,
      next_deadline: deadlines[0] ?? null,
      hearing_this_week: deadlines.some((d) => d.kind === "hearing" && Date.parse(String(d.due_at)) < Date.now() + 7 * 86400_000),
    };
  });
  res.json({ ok: true, cases });
}));

app.get("/api/console/case/:vendorId", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  res.json({ ok: true, ...(callMcpTool(ctx, "get_case", { vendor_id: req.params.vendorId }) as object),
    rule_evaluations: entities.list(ctx, "RuleEvaluation", { vendor_id: req.params.vendorId }).slice(-10),
    messages: entities.list(ctx, "Message", { vendor_id: req.params.vendorId }).slice(-30),
    documents_signed: entities.list(ctx, "DocumentImage", { vendor_id: req.params.vendorId }).map((d) => ({
      id: d.id, doc_type: d.doc_type ?? d.doc_type_claimed, url: `/media/${d.sha256}`, sha256: d.sha256,
    })),
  });
}));

// commerce panel (§11): store status, orders, graded ledger, webhook provenance — no shopper PII exists to show
app.get("/api/console/commerce", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  const stores = entities.list(ctx, "Storefront").map((s) => {
    const orders = entities.list(ctx, "CommerceOrder", { vendor_id: String(s.vendor_id) });
    const evidence = entities.list(ctx, "EvidenceRecord", { vendor_id: String(s.vendor_id) });
    return {
      vendor_id: s.vendor_id, public_name: s.public_name, slug: s.slug, open_state: s.open_state,
      orders: orders.slice(-8).reverse().map((o) => ({
        order_number: o.order_number, total: o.total, fulfillment: o.fulfillment, placed_at: o.placed_at,
        webhook_receipts: entities.list(sys, "WebhookReceipt", { order_id: String(o.shopify_order_id) })
          .map((w) => ({ webhook_id: w.webhook_id, hmac_ok: w.hmac_ok, deduped: w.deduped, at: w.at })),
      })),
      ledger: {
        a: evidence.filter((e) => e.grade === "A_card_verified").length,
        b: evidence.filter((e) => e.grade === "B_self_reported").length,
        sum: Math.round(evidence.reduce((t, e) => t + Number(e.amount), 0) * 100) / 100,
      },
    };
  });
  res.json({ ok: true, stores });
}));

// correction queue (§11): merchant feedback + human-corrected fields
app.get("/api/console/feedback", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  res.json({
    ok: true,
    feedback: entities.list(ctx, "MerchantFeedback").slice(-40).reverse(),
    corrected_fields: entities.list(ctx, "ExtractedField").filter((f) => f.human_corrected === true).slice(-20),
  });
}));
app.post("/api/console/feedback/:id", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  const resolution = String((req.body as { resolution: string }).resolution);
  if (!["open", "reviewed", "fixed"].includes(resolution)) throw new Error("bad resolution");
  res.json({ ok: true, row: entities.update(ctx, "MerchantFeedback", String(req.params.id), { resolution }) });
}));

// caseworker corrects an extracted field from provenance (Gate 4)
app.post("/api/console/field/:id", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  const corrected = String((req.body as { corrected_value: string }).corrected_value ?? "");
  res.json({ ok: true, row: entities.update(ctx, "ExtractedField", String(req.params.id), { human_corrected: true, corrected_value: corrected }) });
}));

app.get("/api/console/guard", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  res.json({ ok: true, ...(callMcpTool(ctx, "guard_summary", {}) as object) });
}));

app.get("/api/console/autopilot", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  res.json({ ok: true, drafts: entities.list(ctx, "OutreachDraft") });
}));

app.post("/api/console/autopilot/:id", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  const action = (req.body as { action: "approved" | "sent" }).action;
  const draft = entities.update(ctx, "OutreachDraft", String(req.params.id), {
    status: action === "sent" ? "published" : action, approved_by: "console-user",
  });
  if (action === "sent") {
    entities.create(sys, "Message", {
      vendor_id: draft.case_vendor_id ?? draft.vendor_ref, role: "sidewalk", kind: "outreach",
      text: draft.body, lang: draft.lang, at: new Date().toISOString(),
    });
  }
  res.json({ ok: true, draft });
}));

app.get("/api/console/evals", wrap(async (_req, res) => {
  res.json({ ok: true, runs: entities.list(sys, "EvalRun").slice(-12).reverse(), telemetry: telemetrySummary() });
}));

// /demo/platform proof (§11): four concise facts, product-telemetry register
app.get("/api/console/platform", wrap(async (req, res) => {
  const ctx = (req as express.Request & { orgCtx: Ctx }).orgCtx;
  const runs = entities.list(sys, "AutomationRun").slice(-6).reverse();
  res.json({
    ok: true,
    auth: { kind: "org", org_id: (ctx as { org_id: string }).org_id, grants: (ctx as { grants: string[] }).grants.length },
    rls: {
      model: "row-level security on every vendor entity; org reads require explicit grants",
      vendor_entities: entities.names().filter((n) => entities.rlsOf(n) === "vendor"),
      public_projection_fields: { storefront: 7, item: 7, order: 8 },
    },
    automations: runs,
    realtime: realtimeStats,
  });
}));

// ---------- MCP (JSON-RPC over HTTP; bearer → org ctx; RLS-scoped)
app.post("/mcp", wrap(async (req, res) => {
  const ctx = orgOf(req);
  if (!ctx) { res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "bearer token required" }, id: null }); return; }
  const { id, method, params } = req.body as { id?: number | string; method: string; params?: Record<string, unknown> };
  const reply = (result: unknown) => res.json({ jsonrpc: "2.0", id: id ?? null, result });
  switch (method) {
    case "initialize":
      reply({
        protocolVersion: (params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "sidewalk-console", version: "3.0.0" },
      });
      return;
    case "notifications/initialized":
      res.status(202).end();
      return;
    case "tools/list":
      reply({ tools: MCP_TOOLS });
      return;
    case "tools/call": {
      const name = String((params as { name: string }).name);
      const args = ((params as { arguments?: Record<string, unknown> }).arguments) ?? {};
      const out = callMcpTool(ctx, name, args);
      reply({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }] });
      return;
    }
    default:
      res.json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `method not found: ${method}` } });
  }
}));

// ---------- QR helper
app.get("/api/qr", wrap(async (req, res) => {
  const data = String(req.query.text ?? baseUrl());
  res.type("png").send(await QRCode.toBuffer(data, { width: 480, margin: 1 }));
}));

// ---------- static hosting (demo mode): / → app (merchant+shopper routes), /console → console
if (env("SERVE_STATIC", "") === "1") {
  const pwaDist = join(ROOT, "pwa", "dist");
  const consoleDist = join(ROOT, "console", "dist");
  app.use("/console", express.static(consoleDist));
  app.get("/console/*", (_req, res) => res.sendFile(join(consoleDist, "index.html")));
  app.use(express.static(pwaDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/mcp") || req.path.startsWith("/media") || req.path.startsWith("/shop-media") || req.path.startsWith("/pay") || req.path.startsWith("/webhooks")) return next();
    res.sendFile(join(pwaDist, "index.html"));
  });
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  SIDEWALK (v3 — one standalone app)\n  merchant: http://localhost:${PORT}/app/today\n  LAN/QR:   ${baseUrl()}\n  console:  ${baseUrl()}/console\n  MCP:      ${baseUrl()}/mcp (Bearer token)\n`);
  });
  // scheduled automations (Base44 emulation; each run writes an AutomationRun proof row)
  setInterval(() => void runAutomation("heat_watch", () => heat_watch({ force: false })), 6 * 3600 * 1000);
  setInterval(() => void runAutomation("scam_radar", () => scam_radar({ mode: "both" })), 3600 * 1000);
  setInterval(() => void runAutomation("socrata_sync", () => socrata_sync({ mode: "nightly" })), 12 * 3600 * 1000);
  setInterval(() => void runAutomation("deadline_nudges", () => deadline_nudges({})), 30 * 60 * 1000);
  setTimeout(() => void runAutomation("deadline_nudges", () => deadline_nudges({})), 5_000); // visible run soon after boot
}

export { app };
