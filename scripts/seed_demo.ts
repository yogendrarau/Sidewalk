/**
 * seed_demo (§17), idempotent. Tenants: Rosa (es; 2-of-3 documents; Thursday nudge),
 * Karim (en/bn; storefront + 14 mixed-grade EvidenceRecords), Amara's clinic (34 cases,
 * two hearings this week, three GuardEvents in one NTA → Scam Radar cluster).
 * Props: fabricated summons number VERIFIED ABSENT from jz4z-kudi at seed time; one real
 * ticket number with a future hearing (queried live, pinned into DEMO_RUNBOOK.md);
 * a fixture DCWP letter for read_letter; QR poster + rights card.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import "../server/src/env.js";
import { ROOT, MEDIA_DIR } from "../server/src/db.js";
import { entities, type Ctx } from "../server/src/entities.js";
import { recordFact } from "../server/src/facts.js";
import { query, DATASETS } from "../server/src/socrata.js";
import { provision_storefront } from "../server/src/functions/provision_storefront.js";
import { evaluate_eligibility } from "../server/src/functions/evaluate_eligibility.js";
import { verify_summons } from "../server/src/functions/verify_summons.js";
import { verify_broker } from "../server/src/functions/verify_broker.js";
import { scam_radar } from "../server/src/functions/scam_radar.js";

const sys: Ctx = { kind: "system" };
const now = Date.now();
const iso = (t: number) => new Date(t).toISOString();

// ---------- fixture documents (SVG → media dir; gold fields registered by sha)
function fixtureDoc(name: string, svg: string, docType: string, gold: Record<string, string | null>): string {
  const buf = Buffer.from(svg);
  const sha = createHash("sha256").update(buf).digest("hex");
  writeFileSync(join(MEDIA_DIR, sha), buf);
  writeFileSync(join(ROOT, "fixtures", "letters", `${name}.svg`), buf);
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

async function main() {
  console.log("Seeding SIDEWALK demo (idempotent)…");

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
  const rosa = "demo-rosa";
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

  // ---------- Karim (en/bn; storefront + 14 mixed-grade EvidenceRecords)
  const karim = "demo-karim";
  entities.create(sys, "Vendor", { id: "v-karim", vendor_id: karim, display_name: "Karim", languages: ["en", "bn"], boro_district: "Brooklyn", area_nta: "BK88-demo", consented_at: iso(now - 30 * 86400e3), radar_opt_in: true, deletion_requested: false });
  recordFact(karim, "vending_kind", "food");
  recordFact(karim, "wants", "license");
  entities.create(sys, "CaseFile", { id: "case-karim", vendor_id: karim, track: "supervisory_food", status: "assembling", blocking_defects: [], application_ids: ["APP-2026-0417"] });
  for (let i = 0; i < 14; i++) {
    const isA = i % 3 !== 2; // 9–10 card, 4–5 cash
    entities.create(sys, "EvidenceRecord", {
      id: `ev-karim-${i}`, vendor_id: karim, kind: isA ? "order" : "cash_log",
      order_id: isA ? `SEED-${1000 + i}` : undefined,
      amount: isA ? 8 + (i % 5) * 3.5 : 20 + (i % 4) * 10,
      currency: "USD", at: iso(now - (14 - i) * 86400e3), grade: isA ? "A_card_verified" : "B_self_reported",
    });
  }
  const sf = await provision_storefront({
    vendor_id: karim, display_name: "Karim's Biryani Cart",
    products: [{ title: "Chicken biryani plate", price_usd: 10 }, { title: "Mango lassi", price_usd: 4 }],
    confirm: true,
  });
  console.log(`  Karim storefront: ${sf.ok ? sf.data.payment_link_url : sf.error}`);

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

  // prior activity so the console isn't empty on first open: an evaluation (trace panel),
  // a summons + broker check (Guard checks log), a conversation for Rosa, and the radar aggregate.
  await evaluate_eligibility({ vendor_id: rosa, case_id: "case-rosa", question: "¿Puedo obtener una licencia si vendo comida?", facts: { vending_kind: "food", wants: "license" } });
  await verify_summons({ vendor_id: rosa, ticket_number: fakeTicket });
  await verify_broker({ vendor_id: rosa, business_name: "Quick Licencias Express (no registrada)", asked_price_usd: 2000, nta: "QN31-demo" });
  entities.create(sys, "Message", { vendor_id: rosa, role: "vendor", kind: "text", text: "¿Puedo obtener una licencia si vendo comida?", lang: "es", at: iso(now - 2 * 3600e3) });
  entities.create(sys, "Message", { vendor_id: rosa, role: "sidewalk", kind: "reply", tier: "template", lang: "es", at: iso(now - 2 * 3600e3 + 5000), text: "Usted aplicaría por la vía de licencia supervisora de comida. La ciudad emite 2,200 de estas licencias por año hasta 2031.", citations: [{ idx: 1, citation: "Intro 1251 / Local Law of 2026" }] });

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

  // runbook
  writeFileSync(join(ROOT, "DEMO_RUNBOOK.md"), `# Demo runbook (pinned at seed time ${iso(now).slice(0, 16)})

## Props
- **Fabricated summons** (verified ABSENT from jz4z-kudi at seed): \`${fakeTicket}\` → not-found script + scam warning
- **Real summons** (future hearing, from the live city file): \`${realTicket?.ticket_number ?? "(offline — use fixtures/socrata rows)"}\` → hearing ${realTicket?.hearing_date?.slice(0, 10) ?? "?"}
- Dataset publication at seed: ${asOf}
- Fixture DCWP letter: fixtures/letters/dcwp_fine_letter.svg (photo it or upload in Check → Letter)

## The three demo flows (§20.1: demo stays three flows)
1. **QR → cold PWA → Spanish voice loop <60s**: judge scans poster QR → onboarding (es, food) → auto-asks "¿Puedo obtener una licencia si vendo comida?" → spoken, cited answer (2,200/yr, Intro 1251).
2. **Guard**: Check → type fake ticket \`${fakeTicket}\` → not-found script with data timestamp; then the real one → true hearing date. Paste "Te consigo la licencia por $2,000" → advance-fee warning ($50 real fee).
3. **Paper trail**: Sales → Create store (confirm gate!) → open payment link → pay → grade-A row appears; 🎤 "vendí cuarenta dólares en efectivo" → grade-B row beside it. Console → Rosa: evidence panel + decision trace; Guard tab: QN31 cluster (3 reports → broadcast).

## Consoles
- Console: /console — token \`amara-clinic\`
- MCP: POST /mcp with Authorization: Bearer amara-clinic (tools: list_cases, get_case, hearings_this_week, guard_summary)
`);

  console.log(`  seeded: ${entities.list(sys, "CaseFile").length} cases, ${entities.list(sys, "Vendor").length} vendors, radar cluster QN31-demo ×3`);
  console.log("  runbook: DEMO_RUNBOOK.md");
}

await main();
