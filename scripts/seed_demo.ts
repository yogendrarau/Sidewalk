/**
 * seed_demo (v3 §17), idempotent. Tenants: Rosa (es; 2-of-3 documents; Thursday nudge;
 * storefront "Antojitos Rosa" with 4 products, one sold out), Karim (en/bn; storefront +
 * 14 mixed-grade EvidenceRecords + two completed pickup orders), Amara's clinic (34 cases,
 * two hearings this week, three GuardEvents in one NTA → Scam Radar cluster), six opted-in
 * public carts + one hidden cart that must NEVER appear in discovery.
 * Props: fabricated summons number VERIFIED ABSENT from jz4z-kudi at seed time; one real
 * ticket number with a future hearing (queried live, pinned into DEMO_RUNBOOK.md); a fixture
 * DCWP letter for read_letter; an imperfect menu photo (one item with NO printed price) for
 * the zero-key catalog-draft flow; QR poster + rights card.
 * The LIVE demo order is never pre-seeded — asserted at the end (§17).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import "../server/src/env.js";
import { ROOT, MEDIA_DIR } from "../server/src/db.js";
import { entities, type Ctx } from "../server/src/entities.js";
import { recordFact } from "../server/src/facts.js";
import { vendorIdOf } from "../server/src/identity.js";
import { query, DATASETS } from "../server/src/socrata.js";
import { provision_storefront } from "../server/src/functions/provision_storefront.js";
import { catalog_item_upsert } from "../server/src/functions/catalog_item_upsert.js";
import { shopify_webhook } from "../server/src/functions/shopify_webhook.js";
import { update_order_status } from "../server/src/functions/update_order_status.js";
import { discover_storefronts } from "../server/src/functions/discover_storefronts.js";
import { evaluate_eligibility } from "../server/src/functions/evaluate_eligibility.js";
import { verify_summons } from "../server/src/functions/verify_summons.js";
import { verify_broker } from "../server/src/functions/verify_broker.js";
import { scam_radar } from "../server/src/functions/scam_radar.js";

const sys: Ctx = { kind: "system" };
const now = Date.now();
const iso = (t: number) => new Date(t).toISOString();

// Demo device credentials: on stage, `localStorage.setItem("sidewalk_device", "<device>")`
// makes the phone act as that merchant (identity.ts hashes device → vendor id).
const ROSA_DEVICE = "demo-rosa";
const KARIM_DEVICE = "demo-karim";
const rosa = vendorIdOf(ROSA_DEVICE);
const karim = vendorIdOf(KARIM_DEVICE);

// ---------- fixture documents (SVG → media dir; gold fields registered by sha)
function fixtureDoc(name: string, svg: string, docType: string, gold: Record<string, string | null>, dir = "letters"): string {
  const buf = Buffer.from(svg);
  const sha = createHash("sha256").update(buf).digest("hex");
  writeFileSync(join(MEDIA_DIR, sha), buf);
  writeFileSync(join(ROOT, "fixtures", dir, `${name}.svg`), buf);
  const goldPath = join(ROOT, "fixtures", "gold_by_sha.json");
  const all = existsSync(goldPath) ? JSON.parse(readFileSync(goldPath, "utf8")) : {};
  all[sha] = { doc_type: docType, fields: gold };
  writeFileSync(goldPath, JSON.stringify(all, null, 1));
  return sha;
}

const letterSvg = (opts: { title: string; body: string[]; footer: string }) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="820" font-family="Georgia, serif">
<rect width="640" height="820" fill="#fffdf8"/><rect width="640" height="86" fill="#0b3a5b"/>
<text x="32" y="38" fill="#fff" font-size="21" font-weight="bold">NYC Department of Consumer and Worker Protection</text>
<text x="32" y="64" fill="#cfe3f3" font-size="13">42 Broadway, New York, NY 10004</text>
<text x="32" y="132" font-size="17" font-weight="bold">${opts.title}</text>
${opts.body.map((l, i) => `<text x="32" y="${168 + i * 26}" font-size="14">${l}</text>`).join("")}
<text x="32" y="780" font-size="11" fill="#666">${opts.footer}</text></svg>`;

const docSvg = (title: string, lines: string[], color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="360" font-family="Helvetica, sans-serif">
<rect width="560" height="360" rx="14" fill="#fff" stroke="${color}" stroke-width="6"/>
<rect width="560" height="64" rx="14" fill="${color}"/><text x="24" y="40" fill="#fff" font-size="20" font-weight="bold">${title}</text>
${lines.map((l, i) => `<text x="24" y="${104 + i * 34}" font-size="16">${l}</text>`).join("")}</svg>`;

/** Imperfect menu-photo prop (§17): skewed paper, uneven light, coffee stain, sensor noise —
 *  and one item whose price is smudged off, so the draft flow must ask instead of guessing. */
function menuSvg(): string {
  let s = 42; // deterministic noise → stable sha across runs (idempotent)
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const specks = Array.from({ length: 70 }, () =>
    `<circle cx="${(rnd() * 620).toFixed(1)}" cy="${(rnd() * 800).toFixed(1)}" r="${(0.5 + rnd() * 1.5).toFixed(1)}" fill="#000" opacity="0.10"/>`).join("");
  const row = (y: number, title: string, price: string | null) =>
    `<text x="122" y="${y}" font-size="27" fill="#3b2a18">${title}</text>
     <line x1="${140 + title.length * 12}" y1="${y - 7}" x2="440" y2="${y - 9}" stroke="#b08a4f" stroke-width="1.5" stroke-dasharray="2 5" opacity="0.7"/>
     ${price !== null
       ? `<text x="486" y="${y}" font-size="27" fill="#3b2a18" text-anchor="end">${price}</text>`
       : `<ellipse cx="462" cy="${y - 8}" rx="36" ry="15" fill="#6b5233" opacity="0.55"/><ellipse cx="470" cy="${y - 4}" rx="22" ry="9" fill="#54401f" opacity="0.45"/>`}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="800" font-family="Georgia, serif">
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4340"/><stop offset="1" stop-color="#2c2825"/></linearGradient>
 <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf3df"/><stop offset="0.6" stop-color="#f3e8cd"/><stop offset="1" stop-color="#e6d5b2"/></linearGradient>
</defs>
<rect width="620" height="800" fill="url(#bg)"/>
<g transform="rotate(-4 310 400)">
 <rect x="80" y="72" width="472" height="652" fill="#000" opacity="0.35"/>
 <rect x="70" y="60" width="472" height="652" fill="url(#paper)"/>
 <text x="306" y="146" text-anchor="middle" font-size="42" fill="#7a2e12" font-weight="bold">MEN&#218;</text>
 <text x="306" y="178" text-anchor="middle" font-size="17" fill="#8a5a30" font-style="italic">antojitos caseros &#183; efectivo o tarjeta</text>
 <line x1="122" y1="200" x2="490" y2="203" stroke="#b08a4f" stroke-width="2"/>
 ${row(272, "Tamales", "$4")}
 ${row(352, "Elote", "$5")}
 ${row(432, "Tacos de canasta", "$3")}
 ${row(512, "Champurrado", null)}
 <circle cx="182" cy="612" r="46" fill="#8a6a3a" opacity="0.16"/>
 <circle cx="182" cy="612" r="35" fill="none" stroke="#7a5a2c" stroke-width="5" opacity="0.22"/>
 <text x="330" y="646" font-size="18" fill="#555" font-style="italic" transform="rotate(-2 330 646)">hoy: salsa verde</text>
</g>
<ellipse cx="470" cy="170" rx="130" ry="58" fill="#ffffff" opacity="0.10" transform="rotate(-18 470 170)"/>
${specks}</svg>`;
}

/** Idempotent storefront provisioning: products are only created on the first run
 *  (provision_storefront would otherwise mint duplicate CatalogItems on reseed). */
async function seedStore(vendorId: string, displayName: string, opts: {
  public_name: string; category: string; langs: string[]; lang: string;
  pickup_note?: string; discovery_opt_in: boolean; public_nta?: string | null;
  products: Array<{ title: string; price_usd: number }>;
}): Promise<{ slug: string; shopper_url: string }> {
  const hasItems = entities.list(sys, "CatalogItem", { vendor_id: vendorId }).length > 0;
  const r = await provision_storefront({
    vendor_id: vendorId, display_name: displayName, public_name: opts.public_name,
    category: opts.category, pickup_note: opts.pickup_note, discovery_opt_in: opts.discovery_opt_in,
    public_nta: opts.public_nta ?? null, langs: opts.langs, lang: opts.lang,
    products: hasItems ? [] : opts.products, confirm: true,
  });
  if (!r.ok) throw new Error(`storefront for ${opts.public_name}: ${r.error}`);
  return { slug: r.data.slug, shopper_url: r.data.shopper_url };
}

async function main() {
  console.log("Seeding SIDEWALK v3 demo (idempotent)…");

  // ---------- referral fabric (§7)
  const referrals = [
    { id: "ref-svp", name: "Street Vendor Project", kind: "advocacy", langs: ["es", "bn", "ar", "zh", "en"], contact: "(646) 602-5679", url: "https://streetvendor.org" },
    { id: "ref-bronx", name: "Bronx Defenders property guide", kind: "legal_clinic", langs: ["es", "en"], contact: "bronxdefenders.org", url: "https://www.bronxdefenders.org" },
    { id: "ref-moia", name: "MOIA legal support centers", kind: "city_office", langs: ["es", "bn", "ar", "zh", "en"], contact: "311", url: "https://www.nyc.gov/site/immigrants" },
    { id: "ref-nys", name: "NYS multilingual hotline", kind: "hotline", langs: ["es", "bn", "ar", "zh", "en"], contact: "1-800-566-7636", url: "" },
    { id: "ref-osvs", name: "Office of Street Vendor Services", kind: "city_office", langs: ["en", "es"], contact: "nyc.gov/svc", url: "https://www.nyc.gov" },
  ];
  for (const r of referrals) entities.create(sys, "ReferralPartner", r);

  // ---------- demo props: verified-absent fake ticket + live real ticket with future hearing
  let fakeTicket = "000000000019";
  let realTicket: { ticket_number: string; hearing_date: string } | null = null;
  let asOf = "";
  try {
    for (const candidate of ["000000000019", "000000000023", "000000000031"]) {
      const r = await query(DATASETS.oath_hearings, { ticket_number: candidate });
      asOf = r.dataset_as_of;
      if (r.rows.length === 0) { fakeTicket = candidate; break; }
    }
    const live = await query(DATASETS.oath_hearings, {
      $where: `hearing_date > '${iso(now).slice(0, 10)}T00:00:00' AND ticket_number IS NOT NULL AND hearing_result IS NULL`,
      $limit: "3",
    });
    const pick = live.rows.find((r) => r.ticket_number) as { ticket_number: string; hearing_date: string } | undefined;
    if (pick) realTicket = pick;
    console.log(`  props: fake=${fakeTicket} (verified absent), real=${realTicket?.ticket_number} hearing ${realTicket?.hearing_date?.slice(0, 10)} (as of ${asOf.slice(0, 10)})`);
  } catch {
    console.log("  props: offline — fixture rows will back the verifier");
  }
  writeFileSync(join(ROOT, "fixtures", "demo_props.json"), JSON.stringify({ fakeTicket, realTicket, dataset_as_of: asOf, seeded_at: iso(now) }, null, 1));

  // ---------- Rosa (es; 2-of-3 documents; scheduled Thursday nudge)
  entities.create(sys, "Vendor", { id: "v-rosa", vendor_id: rosa, display_name: "Rosa", languages: ["es"], boro_district: "Queens", area_nta: "QN31-demo", consented_at: iso(now - 12 * 86400e3), radar_opt_in: true, deletion_requested: false });
  recordFact(rosa, "vending_kind", "food");
  recordFact(rosa, "wants", "license");
  recordFact(rosa, "area_nta", "QN31-demo");
  entities.create(sys, "CaseFile", { id: "case-rosa", vendor_id: rosa, track: "supervisory_food", status: "assembling", blocking_defects: ["nys_sales_tax_certificate"], application_ids: [] });

  const rosaId = fixtureDoc("rosa_passport", docSvg("PASAPORTE · REPÚBLICA DE MÉXICO", ["Nombre: ROSA MARTÍNEZ LÓPEZ", "Pasaporte: G28374911", "Vence: 2031-05-04"], "#14532d"),
    "identity_document", { full_name: "ROSA MARTÍNEZ LÓPEZ", document_kind: "passport", issuing_country_or_state: "Mexico", expiry_date: "2031-05-04" });
  const rosaAddr = fixtureDoc("rosa_conedison", docSvg("Con Edison — Statement", ["Rosa Martínez López", "37-18 103rd St, Corona NY 11368", "Statement date: 2026-07-28"], "#0b3a5b"),
    "proof_of_address", { name: "Rosa Martínez López", address: "37-18 103rd St, Corona NY 11368", document_date: "2026-07-28", issuer: "Con Edison" });
  for (const [i, [sha, dt]] of ([[rosaId, "identity_document"], [rosaAddr, "proof_of_address"]] as const).entries()) {
    entities.create(sys, "DocumentImage", { id: `doc-rosa-${i}`, vendor_id: rosa, case_id: "case-rosa", file_url: `internal:${sha}`, doc_type_claimed: dt, doc_type: dt, quarantine_state: "extracted", sha256: sha });
  }
  const goldNow = JSON.parse(readFileSync(join(ROOT, "fixtures", "gold_by_sha.json"), "utf8")) as Record<string, { doc_type: string; fields: Record<string, string | null> }>;
  let fi = 0;
  for (const sha of [rosaId, rosaAddr]) {
    for (const [field, value] of Object.entries(goldNow[sha].fields)) {
      entities.create(sys, "ExtractedField", { id: `f-rosa-${fi++}`, vendor_id: rosa, document_id: `doc-rosa-${sha === rosaId ? 0 : 1}`, schema_field: field, value, value_confidence: null, model_tier: "fixture", human_corrected: false });
    }
  }
  const nextThursday = new Date(now);
  nextThursday.setDate(nextThursday.getDate() + ((4 - nextThursday.getDay() + 7) % 7 || 7));
  entities.create(sys, "Deadline", { id: "dl-rosa-nudge", vendor_id: rosa, case_id: "case-rosa", kind: "document_nudge", due_at: nextThursday.toISOString(), source: "missing:nys_sales_tax_certificate" });

  // the fixture DCWP letter for read_letter (fine notice with a deadline)
  fixtureDoc("dcwp_fine_letter", letterSvg({
    title: "NOTICE OF HEARING — Vending Without a License",
    body: [
      "Respondent: ROSA MARTINEZ LOPEZ",
      `Summons number: ${realTicket?.ticket_number ?? "26N02358"}`,
      "A hearing has been scheduled at OATH.",
      "Amount claimed: $250.00",
      "Response deadline: 2026-09-02",
      "You may appear in person or online. Free help is available.",
    ],
    footer: "This is a demo fixture document for the Sidewalk letter reader.",
  }), "letter", {
    sender: "NYC Department of Consumer and Worker Protection", subject: "Notice of hearing — vending without a license",
    amounts: "250.00", deadlines: "2026-09-02", doc_category: "dcwp_fine",
  });

  // ---------- Rosa's storefront: "Antojitos Rosa", 4 products, one sold out, opted into discovery
  const rosaStore = await seedStore(rosa, "Rosa", {
    public_name: "Antojitos Rosa", category: "food", langs: ["es"], lang: "es",
    pickup_note: "Recoja en el carrito — 103rd St y Roosevelt Ave", discovery_opt_in: true, public_nta: "QN31-demo",
    products: [
      { title: "Tamales", price_usd: 4 },
      { title: "Elote", price_usd: 5 },
      { title: "Champurrado", price_usd: 3.5 },
      { title: "Tacos de canasta", price_usd: 3 },
    ],
  });
  const elote = entities.list(sys, "CatalogItem", { vendor_id: rosa })
    .find((i) => (i.title_by_lang as Record<string, string>)?.es === "Elote");
  if (elote && elote.availability !== "sold_out") {
    const r = await catalog_item_upsert({
      vendor_id: rosa, confirm: true, lang: "es",
      item: { id: elote.id, title: "Elote", price_usd: Number(elote.price), availability: "sold_out", sort_order: Number(elote.sort_order ?? 1) },
    });
    if (!r.ok) throw new Error(`sold-out mark failed: ${r.error}`);
  }
  console.log(`  Rosa storefront: ${rosaStore.shopper_url} (Elote sold out)`);

  // ---------- imperfect menu-photo prop → gold_by_sha (doc_type "menu"; ONE price is null)
  const menuItems = [
    { title: "Tamales", price_usd: 4 },
    { title: "Elote", price_usd: 5 },
    { title: "Tacos de canasta", price_usd: 3 },
    { title: "Champurrado", price_usd: null },
  ];
  const menuSha = fixtureDoc("demo_menu_photo", menuSvg(), "menu",
    { items_json: JSON.stringify(menuItems), currency: "USD" }, "media");
  console.log(`  menu photo prop: fixtures/media/demo_menu_photo.svg sha=${menuSha.slice(0, 12)}… (Champurrado has no printed price)`);

  // ---------- Karim (en/bn; storefront + 14 mixed-grade EvidenceRecords + 2 completed pickups)
  entities.create(sys, "Vendor", { id: "v-karim", vendor_id: karim, display_name: "Karim", languages: ["en", "bn"], boro_district: "Brooklyn", area_nta: "BK88-demo", consented_at: iso(now - 30 * 86400e3), radar_opt_in: true, deletion_requested: false });
  recordFact(karim, "vending_kind", "food");
  recordFact(karim, "wants", "license");
  entities.create(sys, "CaseFile", { id: "case-karim", vendor_id: karim, track: "supervisory_food", status: "assembling", blocking_defects: [], application_ids: ["APP-2026-0417"] });
  for (let i = 0; i < 14; i++) {
    const isA = i % 3 !== 2; // 10 card, 4 cash
    entities.create(sys, "EvidenceRecord", {
      id: `ev-karim-${i}`, vendor_id: karim, kind: isA ? "order" : "cash_log",
      order_id: isA ? `SEED-${1000 + i}` : undefined,
      amount: isA ? 8 + (i % 5) * 3.5 : 20 + (i % 4) * 10,
      currency: "USD", at: iso(now - (14 - i) * 86400e3), grade: isA ? "A_card_verified" : "B_self_reported",
    });
  }
  const karimStore = await seedStore(karim, "Karim", {
    public_name: "Karim's Biryani Cart", category: "food", langs: ["en", "bn"], lang: "en",
    pickup_note: "Church Ave & McDonald Ave — lunch until sold out", discovery_opt_in: true, public_nta: "BK88-demo",
    products: [{ title: "Chicken biryani plate", price_usd: 10 }, { title: "Mango lassi", price_usd: 4 }],
  });
  console.log(`  Karim storefront: ${karimStore.shopper_url}`);

  // two COMPLETED pickup orders: real webhook path (distinct webhook ids) → picked_up
  const karimItems = entities.list(sys, "CatalogItem", { vendor_id: karim });
  const pid = (title: string) => String(karimItems.find((i) => Object.values((i.title_by_lang as object) ?? {}).includes(title))?.shopify_product_id ?? "SIMP-SEED");
  const pastOrders = [
    {
      order_id: "SEED-ORD-KARIM-1", webhook_id: "seed-wh-karim-1", order_number: "#2041", amount: 24,
      items: [
        { shopify_product_id: pid("Chicken biryani plate"), title: "Chicken biryani plate", qty: 2, unit_price: 10 },
        { shopify_product_id: pid("Mango lassi"), title: "Mango lassi", qty: 1, unit_price: 4 },
      ],
    },
    {
      order_id: "SEED-ORD-KARIM-2", webhook_id: "seed-wh-karim-2", order_number: "#2057", amount: 18,
      items: [
        { shopify_product_id: pid("Chicken biryani plate"), title: "Chicken biryani plate", qty: 1, unit_price: 10 },
        { shopify_product_id: pid("Mango lassi"), title: "Mango lassi", qty: 2, unit_price: 4 },
      ],
    },
  ];
  const SEQ = ["new", "accepted", "ready", "picked_up"] as const;
  for (const o of pastOrders) {
    const w = await shopify_webhook({ vendor_id: karim, order_id: o.order_id, order_number: o.order_number, amount: o.amount, currency: "USD", items: o.items, webhook_id: o.webhook_id, hmac_verified: true });
    if (!w.ok) throw new Error(`seed order ${o.order_number}: ${w.error}`);
    const row = entities.list(sys, "CommerceOrder", { vendor_id: karim, shopify_order_id: o.order_id })[0];
    if (!row) continue;
    for (let s = SEQ.indexOf(String(row.fulfillment) as (typeof SEQ)[number]) + 1; s > 0 && s < SEQ.length; s++) {
      const u = await update_order_status({ vendor_id: karim, order_id: row.id, to: SEQ[s] as "accepted" | "ready" | "picked_up" });
      if (!u.ok) throw new Error(`order ${o.order_number} → ${SEQ[s]}: ${u.error}`);
    }
  }
  console.log(`  Karim orders: #2041 + #2057 → picked_up (grade-A rows via the webhook path)`);

  // ---------- shopper-safe public catalog: six opted-in carts + ONE hidden (discovery negative)
  const PUBLIC_CARTS = [
    { key: "mango", display: "Mario", store: "Mango Loco", category: "food", langs: ["es"], lang: "es", boro: "Queens", nta: "QN31-demo", pickup: "Junto a la salida del 7 en 103 St", items: [["Vaso de mango con chile", 7], ["Vaso de frutas", 6], ["Agua fresca", 3]] },
    { key: "halal", display: "Yusuf", store: "Halal Grill Brothers", category: "food", langs: ["ar", "en"], lang: "en", boro: "Brooklyn", nta: "BK34-demo", pickup: "Church Ave & E 18th St until 8pm", items: [["Chicken over rice", 9], ["Falafel wrap", 7], ["Can soda", 2]] },
    { key: "dumpling", display: "Mei", store: "Dumpling Cart 88", category: "food", langs: ["zh", "en"], lang: "en", boro: "Manhattan", nta: "MN27-demo", pickup: "Canal St & Mott St, till sold out", items: [["Pork dumplings (8)", 6], ["Scallion pancake", 4]] },
    { key: "chai", display: "Nusrat", store: "Chai & Jhal Muri", category: "food", langs: ["bn", "en"], lang: "en", boro: "Brooklyn", nta: "BK88-demo", pickup: "McDonald Ave, afternoons", items: [["Jhal muri cup", 4], ["Masala chai", 2.5]] },
    { key: "flowers", display: "Carmen", store: "Sunset Flowers", category: "flowers", langs: ["es", "en"], lang: "es", boro: "Brooklyn", nta: "BK32-demo", pickup: "5th Ave y 48 St, viernes a domingo", items: [["Ramo de rosas", 12], ["Girasol", 4], ["Ramo mixto", 10]] },
    { key: "caps", display: "Omar", store: "Bright Caps NYC", category: "merchandise", langs: ["en"], lang: "en", boro: "Manhattan", nta: "MN17-demo", pickup: "125th St & Lenox, weekends", items: [["NYC cap", 10], ["Wool scarf", 12]] },
  ] as const;
  const publicSlugs: Array<{ store: string; slug: string }> = [];
  for (const pv of PUBLIC_CARTS) {
    const vid = `demo-pv-${pv.key}`;
    entities.create(sys, "Vendor", { id: `v-pv-${pv.key}`, vendor_id: vid, display_name: pv.display, languages: [...pv.langs], boro_district: pv.boro, area_nta: pv.nta, consented_at: iso(now - 20 * 86400e3), radar_opt_in: true, deletion_requested: false });
    const st = await seedStore(vid, pv.display, {
      public_name: pv.store, category: pv.category, langs: [...pv.langs], lang: pv.lang,
      pickup_note: pv.pickup, discovery_opt_in: true, public_nta: pv.nta,
      products: pv.items.map(([title, price_usd]) => ({ title: String(title), price_usd: Number(price_usd) })),
    });
    publicSlugs.push({ store: pv.store, slug: st.slug });
  }
  // hidden cart: discovery_opt_in FALSE — must never appear on /discover (negative prop)
  entities.create(sys, "Vendor", { id: "v-pv-hidden", vendor_id: "demo-pv-hidden", display_name: "H.", languages: ["en"], boro_district: "Queens", area_nta: "QN51-demo", consented_at: iso(now - 20 * 86400e3), radar_opt_in: false, deletion_requested: false });
  const hidden = await seedStore("demo-pv-hidden", "H.", {
    public_name: "Hidden Cart (should never appear)", category: "food", langs: ["en"], lang: "en",
    discovery_opt_in: false, public_nta: "QN51-demo",
    products: [{ title: "Secret sandwich", price_usd: 5 }, { title: "Invisible coffee", price_usd: 2 }],
  });

  // ---------- Amara's clinic: org + 34 cases + two hearings this week + radar cluster
  const grants = [rosa, karim];
  const FIRST = ["Miguel", "Fatima", "Wei", "Aisha", "José", "Nusrat", "Chen", "Omar", "Lucía", "Rahim", "Mei", "Yusuf", "Elena", "Tariq", "Ping", "Amina", "Diego", "Salma", "Li", "Hassan", "Carmen", "Jamal", "Xiu", "Layla", "Pedro", "Farida", "Kwan", "Zainab", "Marta", "Bilal", "Ana", "Samir"];
  for (let i = 0; i < 32; i++) {
    const vid = `demo-v${i.toString().padStart(2, "0")}`;
    grants.push(vid);
    const track = i % 4 === 0 ? "general_2027" : "supervisory_food";
    const status = ["intake", "assembling", "blocked", "ready"][i % 4];
    entities.create(sys, "Vendor", { id: `v-${vid}`, vendor_id: vid, display_name: FIRST[i], languages: [["es", "bn", "zh", "ar"][i % 4]], boro_district: ["Queens", "Brooklyn", "Bronx", "Manhattan"][i % 4], area_nta: i % 4 === 0 ? "QN31-demo" : `${["QN", "BK", "BX", "MN"][i % 4]}${20 + i}-demo`, consented_at: iso(now - i * 86400e3), radar_opt_in: i % 3 !== 0, deletion_requested: false });
    entities.create(sys, "CaseFile", { id: `case-${vid}`, vendor_id: vid, track, status, blocking_defects: status === "blocked" ? ["proof_of_address"] : [], application_ids: [] });
    if (i < 2) {
      entities.create(sys, "Deadline", { id: `dl-hearing-${i}`, vendor_id: vid, case_id: `case-${vid}`, kind: "hearing", due_at: iso(now + (2 + i * 2) * 86400e3), source: `oath:demo-${i}` });
    }
  }
  entities.create(sys, "Org", { id: "org-amara", org_id: "amara-clinic", name: "Amara's clinic", token: "amara-clinic", grants, admin: false });

  // three seeded GuardEvents in one NTA so Scam Radar shows a cluster (§17)
  for (let i = 0; i < 3; i++) {
    entities.create(sys, "GuardEvent", { id: `ge-cluster-${i}`, vendor_id: ["demo-v00", "demo-v04", rosa][i], pattern_key: "advance_fee_license", nta: "QN31-demo", kind: "broker_check", at: iso(now - i * 3600e3) });
  }

  // prior activity so the console isn't empty on first open (guarded: only on first seed run —
  // verification/evaluation rows are append-only logs and would otherwise duplicate)
  if (entities.list(sys, "VerificationCheck", { vendor_id: rosa }).length === 0) {
    await evaluate_eligibility({ vendor_id: rosa, case_id: "case-rosa", question: "¿Puedo obtener una licencia si vendo comida?", facts: { vending_kind: "food", wants: "license" } });
    await verify_summons({ vendor_id: rosa, ticket_number: fakeTicket });
    await verify_broker({ vendor_id: rosa, business_name: "Quick Licencias Express (no registrada)", asked_price_usd: 2000, nta: "QN31-demo" });
  }
  entities.create(sys, "Message", { id: "msg-rosa-q", vendor_id: rosa, role: "vendor", kind: "text", text: "¿Puedo obtener una licencia si vendo comida?", lang: "es", at: iso(now - 2 * 3600e3) });
  entities.create(sys, "Message", { id: "msg-rosa-a", vendor_id: rosa, role: "sidewalk", kind: "reply", tier: "template", lang: "es", at: iso(now - 2 * 3600e3 + 5000), text: "Usted aplicaría por la vía de licencia supervisora de comida. La ciudad emite 2,200 de estas licencias por año hasta 2031.", citations: [{ idx: 1, citation: "Intro 1251 / Local Law of 2026" }] });

  // aggregate GuardEvents → AreaSignal so the Guard tab shows the QN31 cluster immediately
  await scam_radar({ mode: "both" });

  // Autopilot queue: agent-drafted outreach awaiting human approval
  entities.create(sys, "OutreachDraft", {
    id: "od-1", org_id: "amara-clinic", case_vendor_id: rosa, channel: "web", lang: "es", drafted_by: "agent", status: "draft",
    body: "Hola Rosa — le falta solo el certificado de impuestos del estado (4–6 semanas de trámite). ¿Quiere que le mande el enlace y la lista de lo que piden? — borrador del agente, revisado por su clínica",
  });
  entities.create(sys, "OutreachDraft", {
    id: "od-2", org_id: "amara-clinic", case_vendor_id: karim, channel: "web", lang: "bn", drafted_by: "agent", status: "draft",
    body: "করিম ভাই — আপনার শুনানির আগে কাগজপত্র প্রস্তুত। এই সপ্তাহে ক্লিনিকে এসে একবার দেখা করবেন? — এজেন্টের খসড়া, ক্লিনিক অনুমোদনের অপেক্ষায়",
  });

  // ---------- merchant feedback loop (§17): helpful, confusing, and a corrected "wrong"
  entities.create(sys, "MerchantFeedback", { id: "fb-store-helpful", vendor_id: rosa, flow: "store", rating: "helpful", note: "Publicar mi menú fue fácil. El QR quedó listo el mismo día.", context_ref: "flow:store:publish", resolution: "open" });
  entities.create(sys, "MerchantFeedback", { id: "fb-case-confusing", vendor_id: karim, flow: "case", rating: "confusing", note: "Which paper is the 'sales tax certificate'? Two of my letters look the same.", context_ref: "flow:case:checklist", resolution: "open" });
  entities.create(sys, "MerchantFeedback", { id: "fb-guard-fixed", vendor_id: rosa, flow: "guard", rating: "wrong", note: "La app leyó mal un dígito de mi multa la primera vez.", context_ref: "flow:guard:summons", resolution: "fixed" });

  // ---------- §17 assertions: props that MUST hold at seed time
  // 1) The LIVE demo order is never pre-seeded: Rosa has zero orders and zero grade-A rows.
  const rosaOrders = entities.list(sys, "CommerceOrder", { vendor_id: rosa });
  const rosaA = entities.list(sys, "EvidenceRecord", { vendor_id: rosa }).filter((r) => r.grade === "A_card_verified");
  if (rosaOrders.length > 0 || rosaA.length > 0) {
    throw new Error(`§17 violated: Rosa must have ZERO pre-seeded orders/grade-A rows (found ${rosaOrders.length} orders, ${rosaA.length} grade-A) — the live demo order is born on stage`);
  }
  // 2) Discovery negative: the hidden cart never appears on /discover.
  const disc = await discover_storefronts({ q: "", lang: "en" });
  if (!disc.ok) throw new Error(`discover failed: ${disc.error}`);
  if (disc.data.storefronts.some((s) => String(s.public_name ?? "").startsWith("Hidden Cart"))) {
    throw new Error("§17 violated: the non-opted-in cart appeared in discovery");
  }
  console.log(`  discovery: ${disc.data.storefronts.length} opted-in storefronts; hidden cart correctly absent; Rosa pre-seeded orders: 0`);

  // ---------- runbook (v3 three-flow demo + §20.4 three-minute script)
  writeFileSync(join(ROOT, "DEMO_RUNBOOK.md"), `# Demo runbook — v3 (pinned at seed time ${iso(now).slice(0, 16)})

One standalone app on \`:4477\`. Fresh stage: \`rm -rf server/data && npm run demo\` then \`npm run seed\`.

## Cast and devices

The app identifies a merchant by the device credential in \`localStorage.sidewalk_device\`.
On a demo phone's browser console:

- **Rosa's phone**: \`localStorage.setItem("sidewalk_device","${ROSA_DEVICE}"); location.reload()\` → vendor \`${rosa}\`
- **Karim's phone**: \`localStorage.setItem("sidewalk_device","${KARIM_DEVICE}"); location.reload()\` → vendor \`${karim}\`
- **Judge's phone**: no setup — cold scan of Rosa's QR (My Store shows it; also on the printed poster)
- **Console**: \`/console\` — token \`amara-clinic\` (34 cases, 2 hearings this week, Guard cluster, Autopilot, feedback queue)

## Pinned props

- **Fabricated summons** (verified ABSENT from jz4z-kudi at seed): \`${fakeTicket}\` → not-found script + freshness + scam warning
- **Real summons** (future hearing, live city file): \`${realTicket?.ticket_number ?? "(offline — use fixtures/socrata rows)"}\` → hearing ${realTicket?.hearing_date?.slice(0, 10) ?? "?"}
- Dataset publication at seed: ${asOf || "(offline)"}
- Fixture DCWP letter: \`fixtures/letters/dcwp_fine_letter.svg\` (My Case → Letter Reader)
- **Imperfect menu photo**: \`fixtures/media/demo_menu_photo.svg\` — sha \`${menuSha}\`
  4 items; **Champurrado has NO printed price** → the draft shows it price-blank and the app asks
  (never guesses — invariant 2). Upload this exact file; extraction matches it by sha at the fixture tier.
- Storefronts (all opted-in except the last):
  - Antojitos Rosa (es, food) → \`/shop/${rosaStore.slug}\` — 4 items, **Elote sold out**
  - Karim's Biryani Cart (en/bn, food) → \`/shop/${karimStore.slug}\` — 2 completed pickups #2041 #2057, ledger 12×A + 4×B
${publicSlugs.map((p) => `  - ${p.store} → \`/shop/${p.slug}\``).join("\n")}
  - Hidden Cart (should never appear) → \`/shop/${hidden.slug}\` — \`discovery_opt_in:false\`; must NEVER show on \`/discover\`
- **The live demo order is never pre-seeded**: the seed asserts Rosa has zero orders and zero
  grade-A rows. Order and pickup code are born on stage when the judge checks out.

## The three demo flows (§20.1 — the demo stays three flows)

1. **Merchant access.** Rosa's Today: one next action (state tax certificate, 4–6 weeks, the critical
   path), deadline card, store control. Voice: "¿Puedo obtener una licencia si vendo comida?" →
   spoken, cited answer (2,200/yr through 2031, Intro 1251). Every legal sentence carries a § chip.
2. **Guard.** Check → fake ticket \`${fakeTicket}\` → "not in the city's file as of {timestamp}" + scam
   script; then the real one → true hearing date. Paste "Te consigo la licencia por $2,000" →
   advance-fee warning ($50 real fee). Console Guard tab: QN31 cluster (3 reports → broadcast).
3. **Commerce with consequence.** My Store → photograph \`demo_menu_photo.svg\` → draft shows 4 items,
   Champurrado price-blank → Rosa types 3.50 on the large-type confirm → publish (gate!). Judge scans
   the QR → \`/shop/${rosaStore.slug}\` (es) → sold-out Elote not addable → checkout → **cut to Rosa's
   screen as the order lands live** (SSE, no refresh) + grade-A evidence row. 🎤 "vendí cuarenta
   dólares en efectivo" → grade-B row beside it. Mark ready → judge's order page flips live.

## The three-minute script (§20.4)

- **0:00–0:20 — merchant, not market.** Open on Rosa's Today. "Shopify says be merchant obsessed. We
  took that literally: every surface begins with Rosa's next business outcome." One sentence: the
  forty-year license freeze, and the 2026–27 opening.
- **0:20–0:55 — access.** Rosa asks in Spanish; SIDEWALK speaks the cited next step (tax certificate,
  4–6 weeks). Say: "The model did not decide this. Rules decide; models explain."
- **0:55–1:20 — trust.** Photograph the fake summons → not-found + freshness. Then the real number
  \`${realTicket?.ticket_number ?? "26N02358"}\` → its hearing date. **No narration during the result.**
- **1:20–2:10 — commerce with merchant consequence.** Imperfect menu photo → draft → large price
  confirmation (Champurrado 3.50) → publish → physical QR. The judge completes checkout on their own
  phone. Cut immediately back to Rosa as the order appears in realtime and the grade-A record is
  written. Say: "Making commerce better starts by making the merchant visible, purchasable, and in
  control."
- **2:10–2:35 — engineering proof.** One slide: custom React craft on the Base44-shaped substrate
  (auth/entities/RLS/functions/automations/realtime); Shopify catalog/checkout/order truth; NYC live
  data; deterministic Rulebook. Three measured numbers from \`/console\` eval tab — not a feature grid.
- **2:35–3:00 — Eniac close.** "Eniac warns about shiny hammers without a nail. Our nail is unusually
  specific: twenty-three thousand NYC street vendors entering a once-in-decades transition without a
  casework system. The wedge is narrow; the company compounds through the Rulebook, the workflow
  graph, merchant feedback, and institutional distribution." Close: "SIDEWALK helps a street vendor
  know what to do, know whom to trust, and make the next sale."

## Backup beats (if a flow stalls)

- \`/discover\` → search "tamales" → Antojitos Rosa appears; "Hidden Cart" never does (opt-in proof).
- Console → Feedback: helpful / confusing / **wrong→fixed** rows show the correction loop.
- Console → Karim: commerce panel with two picked-up orders and the 12×A/4×B graded ledger.
- MCP: \`POST /mcp\` with \`Authorization: Bearer amara-clinic\` (list_cases, get_case, hearings_this_week, guard_summary).
`);

  console.log(`  seeded: ${entities.list(sys, "CaseFile").length} cases, ${entities.list(sys, "Vendor").length} vendors, ${entities.list(sys, "Storefront").length} storefronts, radar cluster QN31-demo ×3`);
  console.log(`  slugs: rosa=${rosaStore.slug} karim=${karimStore.slug} ${publicSlugs.map((p) => p.slug).join(" ")} hidden=${hidden.slug}`);
  console.log("  runbook: DEMO_RUNBOOK.md");
}

await main();
