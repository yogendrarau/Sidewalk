/** SIDEWALK server — API + webhook + simulated checkout + MCP + static hosting (Version B). */
import "./env.js";
import express from "express";
import QRCode from "qrcode";
import { createHmac, createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { ROOT, MEDIA_DIR } from "./db.js";
import { env } from "./env.js";
import { entities, verifyMediaSig, type Ctx } from "./entities.js";
import { loadRulebook } from "./rulebook.js";
import { evaluate, type CaseFacts } from "./engine.js";
import { factsFor, recordFact } from "./facts.js";
import { route_inbound } from "./functions/route_inbound.js";
import { provision_storefront } from "./functions/provision_storefront.js";
import { shopify_webhook, verifyShopifyHmac } from "./functions/shopify_webhook.js";
import { compose_packet } from "./functions/compose_packet.js";
import { scam_radar } from "./functions/scam_radar.js";
import { heat_watch, course_prep, find_commissary, socrata_sync } from "./functions/misc_flows.js";
import { synthesize_speech } from "./functions/synthesize_speech.js";
import { verify_summons } from "./functions/verify_summons.js";
import { telemetrySummary } from "./functions/_fn.js";
import { MCP_TOOLS, callMcpTool } from "./mcp.js";
import { webAdapter } from "../../channels/web.js";

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
  const { vendor_id } = webAdapter.verifyIdentity({ device_id: deviceId });
  return { vendor_id, ctx: { kind: "vendor", vendor_id } };
};

const orgOf = (req: express.Request): Ctx | null => {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
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
    channels: env("SIDEWALK_CHANNELS", "web").split(","),
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

// ---------- onboarding screener (six questions → track + checklist)
app.post("/api/onboard", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const b = req.body as {
    lang: string; vending_kind: "food" | "merchandise"; years_vending?: string;
    cart_status?: string; documents_on_hand?: string[]; borough?: string; display_name?: string; radar_opt_in?: boolean;
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
  entities.create(ctx, "ChannelIdentity", {
    vendor_id, channel: "web", address_hash: vendor_id.slice(4), verified_at: new Date().toISOString(),
  });
  res.json({ ok: true, vendor_id, case_id: caseRow.id, track: ev.track, checklist: ev.documents, next_steps: ev.sequencer?.next_steps ?? [] });
}));

// ---------- the conversation (web channel → route_inbound)
app.post("/api/inbound", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  const b = req.body as Record<string, unknown>;
  const result = await route_inbound({
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

// ---------- My Case / My Sales
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

// ---------- storefront (confirm-gated; invariant 9) + simulated checkout
app.post("/api/storefront", wrap(async (req, res) => {
  const { vendor_id, ctx } = vendorOf(req);
  const vendor = entities.list(ctx, "Vendor", { vendor_id })[0];
  const result = await provision_storefront({
    vendor_id,
    display_name: String(vendor?.display_name ?? "Vendor"),
    products: (req.body.products as Array<{ title: string; price_usd: number }>) ?? [{ title: "Plate", price_usd: 12 }],
    confirm: req.body.confirm, // must be literal true — the gate physically blocks otherwise
  });
  res.status(result.ok ? 200 : 403).json(result);
}));

app.get("/pay/:vendorId", (req, res) => {
  const store = entities.list(sys, "Storefront", { vendor_id: req.params.vendorId })[0];
  const products = (store?.products as Array<{ title: string; price_usd: number }>) ?? [{ title: "Plate", price_usd: 12 }];
  res.type("html").send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>Pay — Sidewalk demo checkout</title>
<style>body{font-family:system-ui;margin:0;background:#f6f3ee;color:#1c1917}main{max-width:420px;margin:0 auto;padding:24px}
h1{font-size:1.3rem}button{width:100%;padding:14px;border:0;border-radius:12px;background:#1c7c54;color:#fff;font-size:1.05rem;margin-top:8px}
.card{background:#fff;border-radius:14px;padding:14px 16px;margin:10px 0;box-shadow:0 1px 4px rgba(0,0,0,.08);display:flex;justify-content:space-between}
.note{font-size:.8rem;color:#57534e;margin-top:14px}</style>
<main><h1>🛒 ${store ? "Card checkout" : "Storefront not provisioned yet"}</h1>
${products.map((p, i) => `<div class=card><span>${p.title}</span><b>$${p.price_usd.toFixed(2)}</b></div>
<button onclick="buy(${i})">Pay $${p.price_usd.toFixed(2)} by card</button>`).join("")}
<p class=note>Demo checkout: this simulates a Shopify order and fires the same HMAC-verified orders/create webhook the real store would. The sale lands as grade-A evidence in the vendor's ledger.</p>
<p id=done style="font-weight:700;color:#1c7c54"></p></main>
<script>
async function buy(i){
  const r = await fetch(location.pathname, {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({product_index:i})});
  const j = await r.json();
  document.getElementById("done").textContent = j.ok ? "✓ Paid — order " + j.order_id + " recorded as evidence" : "Error: " + j.error;
}
</script>`);
});

app.post("/pay/:vendorId", wrap(async (req, res) => {
  const vendorId = req.params.vendorId;
  const store = entities.list(sys, "Storefront", { vendor_id: vendorId })[0];
  const products = (store?.products as Array<{ title: string; price_usd: number }>) ?? [{ title: "Plate", price_usd: 12 }];
  const p = products[Number((req.body as { product_index?: number }).product_index ?? 0)] ?? products[0];
  const orderId = `SIM-${Date.now().toString(36).toUpperCase()}`;
  // fire our own orders/create webhook with a real HMAC so the verify path is exercised end to end
  const payload = Buffer.from(JSON.stringify({ id: orderId, total_price: p.price_usd.toFixed(2), currency: "USD", note_attributes: [{ name: "vendor_id", value: vendorId }] }));
  const hmac = createHmac("sha256", env("SHOPIFY_WEBHOOK_SECRET", "dev-secret-change-me")).update(payload).digest("base64");
  const r = await fetch(`http://localhost:${PORT}/webhooks/shopify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-hmac-sha256": hmac },
    body: payload,
  });
  const out = (await r.json()) as { ok: boolean };
  res.json({ ok: out.ok, order_id: orderId, amount: p.price_usd });
}));

app.post("/webhooks/shopify", wrap(async (req, res) => {
  const raw = req.body as Buffer;
  const hmacOk = verifyShopifyHmac(raw, String(req.headers["x-shopify-hmac-sha256"] ?? ""));
  if (!hmacOk) { res.status(401).json({ ok: false, error: "HMAC verification failed" }); return; }
  const body = JSON.parse(raw.toString()) as { id: string | number; total_price: string; currency?: string; note_attributes?: Array<{ name: string; value: string }> };
  const vendorId = body.note_attributes?.find((n) => n.name === "vendor_id")?.value ?? "unattributed";
  const result = await shopify_webhook({
    vendor_id: vendorId, order_id: String(body.id), amount: Number(body.total_price),
    currency: body.currency ?? "USD", hmac_verified: true,
  });
  res.json(result);
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

// ---------- workflows (heat, radar, sync) + demo triggers
app.post("/api/workflows/:name", wrap(async (req, res) => {
  const name = req.params.name;
  if (name === "heat_watch") { res.json(await heat_watch({ force: Boolean(req.body?.force) })); return; }
  if (name === "scam_radar") { res.json(await scam_radar({ mode: "both" })); return; }
  if (name === "socrata_sync") { res.json(await socrata_sync({ mode: "nightly" })); return; }
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

// quick Guard demo endpoints (Check screen buttons)
app.post("/api/check/summons", wrap(async (req, res) => {
  const { vendor_id } = vendorOf(req);
  res.json(await verify_summons({ vendor_id, ticket_number: String((req.body as { ticket_number: string }).ticket_number ?? "") }));
}));

// ---------- console APIs (org ctx; RLS-scoped)
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
    status: action, approved_by: action === "approved" || action === "sent" ? "console-user" : undefined,
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
        serverInfo: { name: "sidewalk-console", version: "2.0.0" },
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

// ---------- static hosting (demo mode): / → pwa, /console → console
if (env("SERVE_STATIC", "") === "1") {
  const pwaDist = join(ROOT, "pwa", "dist");
  const consoleDist = join(ROOT, "console", "dist");
  app.use("/console", express.static(consoleDist));
  app.get("/console/*", (_req, res) => res.sendFile(join(consoleDist, "index.html")));
  app.use(express.static(pwaDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/mcp") || req.path.startsWith("/media") || req.path.startsWith("/pay") || req.path.startsWith("/webhooks")) return next();
    res.sendFile(join(pwaDist, "index.html"));
  });
}

const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  SIDEWALK server (Version B — web)\n  local:   http://localhost:${PORT}\n  LAN/QR:  ${baseUrl()}\n  console: ${baseUrl()}/console\n  MCP:     ${baseUrl()}/mcp (Bearer token)\n`);
  });
  // daily/nightly workflows (demo cadence: hourly checks, cheap no-ops when nothing due)
  setInterval(() => void heat_watch({ force: false }), 6 * 3600 * 1000);
  setInterval(() => void scam_radar({ mode: "both" }), 3600 * 1000);
  setInterval(() => void socrata_sync({ mode: "nightly" }), 12 * 3600 * 1000);
}

export { app };
