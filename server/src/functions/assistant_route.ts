/**
 * assistant_route (v3 §9): persist structured app event → transcribe if audio → guard_screen →
 * intent (deterministic keyword match; constrained decode when a gateway model is available)
 * → dispatch. Unknown → one clarifying question. The planner sees guard LABELS only.
 * Commerce voice ops (sold-out, price, cancel) only PROPOSE — the confirm gates (invariant 9)
 * live on the write endpoints, so voice can never bypass them.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { factsFor, recordFact } from "../facts.js";
import { loadRulebook } from "../rulebook.js";
import { evaluate, type CaseFacts } from "../engine.js";
import { renderTemplate, stepName, docName } from "../templates.js";
import { guard_screen, scamTeaching } from "./guard_screen.js";
import { verify_summons } from "./verify_summons.js";
import { verify_broker } from "./verify_broker.js";
import { extract_document } from "./extract_document.js";
import { read_letter } from "./read_letter.js";
import { log_cash_sale } from "./log_cash_sale.js";
import { placement_check } from "./placement_check.js";
import { explain_reply, type ExplainOut } from "./explain_reply.js";
import { runExtraction } from "../extraction.js";

const Input = z.object({
  vendor_id: z.string(),
  lang: z.string().default("es"),
  kind: z.enum(["text", "audio", "image", "location"]),
  text: z.string().optional(),
  sha256: z.string().optional(),
  ext: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  doc_type_claimed: z.string().optional(),
  image_purpose: z.enum(["document", "summons", "letter", "voucher"]).optional(),
});
type In = z.infer<typeof Input>;

export type Intent =
  | "eligibility_question" | "document_submission" | "summons_check" | "broker_check"
  | "placement_check" | "status_query" | "storefront_request" | "scam_forward"
  | "catalog_update" | "store_open_state" | "order_status"
  | "cash_log" | "letter" | "smalltalk_other" | "unknown";

export type RouteOut = {
  intent: Intent;
  reply: ExplainOut;
  guard: { injection: boolean; scam_pattern: string | null; pii_overshare: boolean };
  actions?: Record<string, unknown>;
};

const INTENT_RES: Array<[Intent, RegExp]> = [
  ["summons_check", /(multa|ticket|summons|boleta|citaci[oó]n|জরিমানা|সমন|مخالفة|استدعاء|罚单|传票).{0,60}?([A-Z0-9]{7,})/i],
  ["summons_check", /\b\d{9,12}\b/],
  // cash log: a sale verb OR money-word context with an amount (digits OR spelled-out number word).
  // Bengali "বিক্রি করি" (I sell, no amount) is excluded — it needs a money word or number nearby.
  ["cash_log", /(vend[ií]|sold|gan[eé]|hice|cobr[eé]).{0,30}(\d|efectivo|cash|d[oó]lar|dollar|peso|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|one|two|three|four|five|ten|twenty|thirty|forty|fifty|hundred)/i],
  ["cash_log", /(efectivo|cash).{0,20}\$?\s?\d|\$\s?[\d,]+.{0,25}(efectivo|cash|hoy|today)/i],
  ["broker_check", /(broker|gestor|tramitador|te consigo|me ofrece|se llama).{0,80}(licencia|license|permiso|permit)/i],
  ["scam_forward", /(me mandaron|forward|reenv[ií]o|recib[ií] este mensaje|someone sent)/i],
  // commerce voice ops go BEFORE storefront_request/eligibility so "se acabaron los tamales" routes right
  ["catalog_update", /(agotad[oa]s?|se acab(ó|o|aron)|sold out|no (me )?quedan?|ya no hay|nuevo producto|new (product|item)|a[ñn]ad(e|ir|o)|add (an? )?(product|item)|cambiar? (el )?precio|change (the )?price|sube el precio|otra vez disponible|back in stock|disponible de nuevo)/i],
  ["store_open_state", /(cierr[oa]|cerrar) (la )?tienda|close (the |my )?store|abr(o|ir|e) (la )?tienda|open (the |my )?store|estoy cerrando|closing up|pausa(r)? (la )?tienda/i],
  ["order_status", /\b(pedidos?|orders?|orden(es)?)\b.{0,40}(nuevo|new|listo|ready|hoy|today|recoger|pickup|picked|acept|estado|status|hay|tengo|any)|((listo|ready|acept[oa]).{0,30}\b(pedido|order|orden)\b)/i],
  ["storefront_request", /(tienda|storefront|qr|pagos con tarjeta|card payments|payment link|shopify|vender en l[ií]nea)/i],
  ["status_query", /(estado|status|mi caso|my case|c[oó]mo va|donde va|expediente)/i],
  ["placement_check", /(d[oó]nde (puedo|me puedo)|where can i (stand|sell)|esquina|corner|crosswalk|subway|near the|clear path|cart (size|dim)|ubicaci[oó]n|spot|parar|restricted street)/i],
  // eligibility: track/steps/docs/fee questions, incl. common phrasings that name no scarce keyword
  ["eligibility_question", /(licencia|license|permiso|permit|লাইসেন্স|رخصة|执照|aplicar|apply|requisitos|requirements|documentos?|documents?|papeles|cu[aá]nto cuesta|how much|fee|tarifa|curso|course|paso|step|next|siguiente|primero|first|qu[eé] hago|what do i (do|need)|need\b|elegible|eligible|track|v[ií]a|ventana|window|abre|open|passport|pasaporte|\bid\b|identity|identidad|certificat|certificado|tax cert|impuestos|how long|cu[aá]ndo|cu[aá]nto (tarda|dura|semanas)|timeline|critical path|cap history|cap\b|slots|waiver|exenci[oó]n|veteran|veterano|surviving|c[oó]njuge|commissary|comisar|comida|food|ropa|clothing|merchand|mercanc)/i],
];

function classifyIntent(input: In): Intent {
  if (input.kind === "image") {
    if (input.image_purpose === "summons") return "summons_check";
    if (input.image_purpose === "letter") return "letter";
    return "document_submission";
  }
  if (input.kind === "location") return "placement_check";
  const text = input.text ?? "";
  for (const [intent, re] of INTENT_RES) if (re.test(text)) return intent;
  if (text.trim().length > 0 && text.trim().length < 12) return "smalltalk_other";
  return text.trim() ? "unknown" : "smalltalk_other";
}

const asDuration = (d: [number, number] | null, lang: string): string | undefined => {
  if (!d) return undefined;
  const w = (n: number) => Math.round(n / 7);
  const weeks = { en: "weeks", es: "semanas", bn: "সপ্তাহ", ar: "أسابيع", zh: "周" } as Record<string, string>;
  return `${w(d[0])}–${w(d[1])} ${weeks[lang] ?? "weeks"}`;
};

async function explain(input: In, key: string, params: Record<string, unknown>, citations: Array<{ idx: number; citation: string; text: string }>, trace: unknown, freshness?: string, preferTemplate = false) {
  const res = await explain_reply({
    lang: input.lang, question: input.text ?? key, template_key: key, template_params: params,
    citations, trace, freshness, prefer_template: preferTemplate,
  });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export const assistant_route = defineFn<In, RouteOut>("assistant_route", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const rb = loadRulebook();

  // persist inbound (never persisting immigration content per guard below)
  const guardRes = await guard_screen({ text: input.text ?? "" });
  const guard = guardRes.ok
    ? guardRes.data
    : { injection: false, scam_pattern: null, pii_overshare: false, immigration_mention: false, suspicious_price_usd: null };
  entities.create(ctx, "Message", {
    vendor_id: input.vendor_id, role: "vendor", kind: input.kind,
    text: guard.immigration_mention || guard.pii_overshare ? "[withheld: sensitive content not persisted]" : input.text ?? null,
    media_sha: input.sha256 ?? null, lang: input.lang, at: new Date().toISOString(),
  });

  const referral = entities.list({ kind: "system" }, "ReferralPartner")[0];
  const referralName = String(referral?.name ?? "Street Vendor Project");
  const facts = factsFor(input.vendor_id) as CaseFacts;
  const caseFile = entities.list(ctx, "CaseFile", { vendor_id: input.vendor_id })[0];

  let intent = classifyIntent(input);
  // injection-flagged forwarded text is treated as scam_forward evidence, never as instructions
  if (guard.injection && intent !== "summons_check") intent = "scam_forward";

  const guardOut = { injection: guard.injection, scam_pattern: guard.scam_pattern, pii_overshare: guard.pii_overshare };
  const finish = (reply: ExplainOut, actions?: Record<string, unknown>): RouteOut => {
    entities.create(ctx, "Message", {
      vendor_id: input.vendor_id, role: "sidewalk", kind: "reply", text: reply.text, lang: reply.lang_used,
      citations: reply.citations, freshness: reply.freshness ?? null, tier: reply.tier, at: new Date().toISOString(),
    });
    return { intent, reply, guard: guardOut, actions };
  };

  switch (intent) {
    case "summons_check": {
      let ticket: string | null = null;
      let instrument: string | null = null;
      if (input.kind === "image" && input.sha256) {
        const ex = await runExtraction(input.sha256, "summons", input.ext ?? "png"); // quarantined parse
        ticket = (ex.fields.ticket_number as string | null) ?? null;
        instrument = (ex.fields.instrument_kind as string | null) ?? null;
      } else {
        ticket = input.text?.match(/[A-Z0-9]{7,}/i)?.[0] ?? input.text?.match(/\d{7,}/)?.[0] ?? null;
      }
      const v = await verify_summons({ vendor_id: input.vendor_id, ticket_number: ticket, instrument_kind: instrument });
      if (!v.ok) throw new Error(v.error);
      const d = v.data;
      const cite = (rule: string) => rb.records.find((r) => r.rule_id === rule);
      if (d.result === "unclear") {
        return finish(await explain(input, "summons_unclear", {}, [], {}, undefined, true));
      }
      if (d.result === "criminal_looking") {
        const r = cite("CLASS-INSTR-002")!;
        return finish(await explain(input, "criminal_instrument", { referral: referralName },
          [{ idx: 1, citation: String(r.citation), text: String((r.then as Record<string, unknown>).summary) }], d));
      }
      if (d.result === "found") {
        const r = cite("CLASS-INSTR-001")!;
        const reply = await explain(input, "summons_found", {
          ticket: d.ticket_number, hearing_date: (d.hearing_date ?? "").slice(0, 10), status: d.hearing_result,
          penalty_note: d.penalty_range_note, as_of: d.dataset_as_of.slice(0, 10),
        }, [{ idx: 1, citation: `OATH case file (dataset jz4z-kudi), published ${d.dataset_as_of.slice(0, 10)}; ${r.citation}`, text: JSON.stringify(d) }], d, d.dataset_as_of);
        if (d.hearing_date) {
          entities.create(ctx, "Deadline", {
            vendor_id: input.vendor_id, case_id: caseFile?.id ?? null, kind: "hearing",
            due_at: d.hearing_date, source: `oath:${d.ticket_number}`,
          });
        }
        return finish(reply, { hearing_filed: Boolean(d.hearing_date) });
      }
      // not found → the scripted answer
      return finish(await explain(input, "summons_not_found",
        { as_of: d.dataset_as_of.slice(0, 10), referral: referralName },
        [{ idx: 1, citation: `OATH case file (dataset jz4z-kudi), published ${d.dataset_as_of.slice(0, 10)}`, text: "ticket not present in public case file" }],
        d, d.dataset_as_of), { guard_alert: true });
    }

    case "broker_check":
    case "scam_forward": {
      if (guard.injection && !input.text?.match(/licencia|license|permiso|permit/i)) {
        // forwarded injection attempt with no broker claim → teach + log, planner never follows it
        entities.create(ctx, "GuardEvent", {
          vendor_id: input.vendor_id, pattern_key: "injection_forward", nta: String((facts as Record<string, unknown>).area_nta ?? "") || null,
          kind: "scam_triage", at: new Date().toISOString(),
        });
        return finish(await explain(input, "referral_indeterminate", { referral: referralName }, [], {}, undefined, true));
      }
      const nameMatch = input.text?.match(/(?:se llama|llamado|called|named|de|from)\s+([A-ZÁÉÍÓÚÑ][\w&. ÁÉÍÓÚÑáéíóúñ]{2,40})/)?.[1]
        ?? input.text?.match(/"([^"]{3,40})"/)?.[1] ?? null;
      const asked = input.text?.match(/\$\s?([\d,]{3,})/)?.[1];
      const v = await verify_broker({
        vendor_id: input.vendor_id,
        business_name: nameMatch ?? (input.text ?? "").slice(0, 40),
        asked_price_usd: asked ? Number(asked.replace(/,/g, "")) : null,
        nta: (facts as Record<string, unknown>).area_nta as string | null ?? null,
      });
      if (!v.ok) throw new Error(v.error);
      const d = v.data;
      const cites = [{ idx: 1, citation: `NYC business registry (dataset w7w3-xahh), published ${d.dataset_as_of.slice(0, 10)}`, text: JSON.stringify(d.best_match) },
        { idx: 2, citation: "DOHMH MFV application package (FEE-001)", text: "license fee $50 / 2 years" }];
      const key = d.price_warning ? "broker_price_warning" : d.result === "registered" ? "broker_registered" : "broker_not_registered";
      const params = d.price_warning
        ? { asked: d.price_warning.asked, real: d.price_warning.real_fee }
        : { name: nameMatch ?? "that business", as_of: d.dataset_as_of.slice(0, 10) };
      const reply = await explain(input, key, params, cites, d, d.dataset_as_of);
      if (guard.scam_pattern) reply.text += ` ${scamTeaching(guard.scam_pattern)}`;
      return finish(reply, { pattern_key: d.pattern_key });
    }

    case "document_submission": {
      if (!input.sha256) return finish(await explain(input, "summons_unclear", {}, [], {}, undefined, true));
      const ex = await extract_document({
        vendor_id: input.vendor_id, case_id: caseFile?.id, sha256: input.sha256, ext: input.ext ?? "png",
        doc_type_claimed: input.doc_type_claimed ?? "identity_document",
      });
      if (!ex.ok) throw new Error(ex.error);
      const docsPresent = new Set(
        entities.list(ctx, "DocumentImage", { vendor_id: input.vendor_id }).map((d) => String(d.doc_type ?? d.doc_type_claimed)),
      );
      const ev = evaluate(rb, { ...facts, vending_kind: facts.vending_kind ?? "food", wants: "license", documents_present: [...docsPresent].sort() });
      const missing = ev.documents?.missing ?? [];
      const docRule = rb.records.find((r) => r.rule_id === "DOC-SUPERV-001")!;
      const key = missing.length ? "docs_missing" : "docs_complete";
      const reply = await explain(input, key, {
        have: (ev.documents?.required.length ?? 0) - missing.length, need: ev.documents?.required.length ?? 0,
        missing_list: missing.map((m) => docName(m, input.lang)).join(", "),
      }, [{ idx: 1, citation: String(docRule.citation), text: JSON.stringify(docRule.requires) }], ev.rules_fired);
      if (missing.length) {
        entities.create(ctx, "Deadline", {
          vendor_id: input.vendor_id, case_id: caseFile?.id ?? null, kind: "document_nudge",
          due_at: new Date(Date.now() + 3 * 86400_000).toISOString(), source: `missing:${missing[0]}`,
        });
      }
      return finish(reply, { extracted: ex.data, missing });
    }

    case "letter": {
      if (!input.sha256) return finish(await explain(input, "summons_unclear", {}, [], {}, undefined, true));
      const letter = await read_letter({ vendor_id: input.vendor_id, case_id: caseFile?.id, sha256: input.sha256, ext: input.ext ?? "png" });
      if (!letter.ok) throw new Error(letter.error);
      const d = letter.data;
      const nextByRouting: Record<string, Record<string, string>> = {
        summons_flow: { en: "This looks like a DCWP fine — send me the ticket number and I will check it against the court file.", es: "Parece una multa de DCWP — mándeme el número del ticket y lo verifico contra el archivo del tribunal." },
        tax_checklist: { en: "This is a tax matter. I added it to your checklist; the state certificate steps cover it.", es: "Es un tema de impuestos. Lo agregué a su lista; los pasos del certificado estatal lo cubren." },
        license_notice: { en: "This is about your license file — I updated your case.", es: "Es sobre su expediente de licencia — actualicé su caso." },
        referral: { en: "I am not sure of the category, so a human should look at it.", es: "No estoy seguro de la categoría, así que una persona debería revisarla." },
      };
      const reply = await explain(input, "letter_explained", {
        sender: d.sender ?? "an unknown sender", subject: d.subject ?? "(not readable)",
        amount: d.amounts, deadline: d.deadlines[0],
        next: nextByRouting[d.routing][input.lang] ?? nextByRouting[d.routing].en,
      }, [], d, undefined, true);
      if (d.guard_flag) reply.text += ` ⚠️ ${scamTeaching(d.guard_flag)}`;
      return finish(reply, { letter: d });
    }

    case "cash_log": {
      const res = await log_cash_sale({ vendor_id: input.vendor_id, text: input.text ?? "", lang: input.lang });
      if (!res.ok) throw new Error(res.error);
      if (!res.data.logged) {
        const clarify = {
          en: "How much was the sale? Say just the amount, like “forty dollars.”",
          es: "¿De cuánto fue la venta? Diga solo la cantidad, como “cuarenta dólares.”",
          bn: "বিক্রিটা কত টাকার ছিল? শুধু পরিমাণ বলুন।", ar: "كم كانت قيمة البيع؟ قل المبلغ فقط.", zh: "这笔销售是多少钱？请只说金额。",
        } as Record<string, string>;
        const t = { text: clarify[input.lang] ?? clarify.en, sentences: [clarify[input.lang] ?? clarify.en], citations: [], gate_report: { pass: true, sentences: [] }, tier: "template" as const, lang_used: input.lang, lang_fallback: false };
        return finish(t);
      }
      return finish(await explain(input, "cash_logged", {
        amount: res.data.amount, count: res.data.counts.total, a_count: res.data.counts.a, b_count: res.data.counts.b,
      }, [], res.data, undefined, true), { record_id: res.data.record_id });
    }

    case "placement_check": {
      const res = await placement_check({ vendor_id: input.vendor_id, lat: input.lat ?? 40.7484, lon: input.lon ?? -73.9857 });
      if (!res.ok) throw new Error(res.error);
      const reply = await explain(input, "placement_partial", {}, [
        { idx: 1, citation: res.data.citation, text: "placement distances TODO(law); checklist categories" },
      ], res.data, res.data.dataset_as_of ?? undefined, true);
      reply.text += " " + res.data.checklist.map((c, i) => `${i + 1}. ${c}`).join(" ");
      if (res.data.complaint_density_note) reply.text += ` (${res.data.complaint_density_note})`;
      return finish(reply, { checklist: res.data.checklist });
    }

    case "status_query": {
      const deadlines = entities.list(ctx, "Deadline", { vendor_id: input.vendor_id })
        .filter((d) => String(d.due_at) > new Date().toISOString())
        .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
      const docsPresent = new Set(entities.list(ctx, "DocumentImage", { vendor_id: input.vendor_id }).map((d) => String(d.doc_type ?? d.doc_type_claimed)));
      const ev = evaluate(rb, { ...facts, wants: "license", documents_present: [...docsPresent].sort() });
      const next = ev.sequencer?.next_steps[0];
      const seqRule = next ? rb.records.find((r) => r.step === next.step) : undefined;
      const status = {
        en: `Your case: track ${ev.track ?? "not set"}, ${caseFile?.status ?? "intake"}. ${ev.documents ? `Documents: ${(ev.documents.required.length - ev.documents.missing.length)}/${ev.documents.required.length}.` : ""} ${deadlines[0] ? `Next deadline: ${String(deadlines[0].due_at).slice(0, 10)} (${deadlines[0].kind}).` : "No upcoming deadlines."}`,
        es: `Su caso: vía ${ev.track ?? "sin asignar"}, ${caseFile?.status ?? "intake"}. ${ev.documents ? `Documentos: ${(ev.documents.required.length - ev.documents.missing.length)}/${ev.documents.required.length}.` : ""} ${deadlines[0] ? `Próxima fecha: ${String(deadlines[0].due_at).slice(0, 10)} (${deadlines[0].kind}).` : "Sin fechas próximas."}`,
      } as Record<string, string>;
      let text = status[input.lang] ?? status.en;
      if (next && seqRule) {
        const t = renderTemplate(input.lang, "next_step", {
          step_name: stepName(next.step, input.lang), duration: asDuration(next.duration_days_range, input.lang),
          timeline: asDuration(ev.sequencer?.timeline_days_range ?? null, input.lang),
        });
        text += " " + t.sentences.join(" ");
      }
      return finish({
        text, sentences: [text],
        citations: seqRule ? [{ idx: 1, citation: String(seqRule.citation), text: String(seqRule.note ?? seqRule.step) }] : [],
        gate_report: { pass: true, sentences: [] }, tier: "template", lang_used: input.lang, lang_fallback: false,
      });
    }

    case "storefront_request": {
      const confirmAsk = {
        en: "I can publish your store: shoppers scan your QR, see your menu in their language, and pay by card — those sales count as grade-A evidence. Publishing needs your explicit OK — tap Confirm in My Store.",
        es: "Puedo publicar su tienda: los clientes escanean su QR, ven su menú en su idioma y pagan con tarjeta — esas ventas cuentan como evidencia grado A. Publicar necesita su confirmación — toque Confirmar en Mi Tienda.",
      } as Record<string, string>;
      const text = confirmAsk[input.lang] ?? confirmAsk.en;
      return finish({ text, sentences: [text], citations: [], gate_report: { pass: true, sentences: [] }, tier: "template", lang_used: input.lang, lang_fallback: false }, { propose: "provision_storefront", route: "/app/store" });
    }

    case "catalog_update": {
      // Voice NEVER writes the catalog directly — it proposes; the confirm gate lives on the write endpoint.
      const text0 = (input.text ?? "").toLowerCase();
      const items = entities.list(ctx, "CatalogItem", { vendor_id: input.vendor_id });
      const match = items.find((it) => {
        const titles = Object.values((it.title_by_lang as Record<string, string>) ?? {}).join(" ").toLowerCase();
        return titles.split(/\s+/).some((w) => w.length > 3 && text0.includes(w));
      });
      const wantsAvailable = /otra vez|de nuevo|back in stock|again|disponible/.test(text0) && !/no |agotad|se acab|sold out/.test(text0);
      const soldOut = !wantsAvailable && /agotad|se acab|sold out|no (me )?quedan?|ya no hay/.test(text0);
      const title = match ? String(Object.values((match.title_by_lang as Record<string, string>) ?? {})[0] ?? "") : null;
      const msgs = {
        found_sold: { es: `Entendido: marcar “${title}” como agotado. Confirme en la aplicación para publicar el cambio.`, en: `Got it: mark “${title}” as sold out. Confirm in the app to publish the change.` },
        found_avail: { es: `Entendido: “${title}” disponible otra vez. Confirme en la aplicación para publicar el cambio.`, en: `Got it: “${title}” available again. Confirm in the app to publish the change.` },
        no_item: { es: "¿Qué producto? Abra Mi Tienda y toque el producto, o diga el nombre.", en: "Which product? Open My Store and tap the item, or say its name." },
      };
      const key = match ? (soldOut ? "found_sold" : "found_avail") : "no_item";
      const text = (msgs[key] as Record<string, string>)[input.lang] ?? (msgs[key] as Record<string, string>).en;
      return finish(
        { text, sentences: [text], citations: [], gate_report: { pass: true, sentences: [] }, tier: "template", lang_used: input.lang, lang_fallback: false },
        match
          ? { propose: "set_availability", item_id: match.id, title, availability: soldOut ? "sold_out" : "available", route: "/app/store" }
          : { route: "/app/store" },
      );
    }

    case "store_open_state": {
      const closing = /cierr|cerrar|close|closing|pausa/i.test(input.text ?? "");
      const store = entities.list(ctx, "Storefront", { vendor_id: input.vendor_id })[0];
      if (store) entities.update(ctx, "Storefront", store.id, { open_state: closing ? "closed" : "open" });
      const msgs = closing
        ? { es: "Listo — su tienda está cerrada. Los clientes verán “cerrado” hasta que la abra.", en: "Done — your store is closed. Shoppers see “closed” until you open it." }
        : { es: "Listo — su tienda está abierta y aceptando pedidos.", en: "Done — your store is open and taking orders." };
      const text = (msgs as Record<string, string>)[input.lang] ?? msgs.en;
      return finish(
        { text, sentences: [text], citations: [], gate_report: { pass: true, sentences: [] }, tier: "template", lang_used: input.lang, lang_fallback: false },
        { open_state: closing ? "closed" : "open" },
      );
    }

    case "order_status": {
      const orders = entities.list(ctx, "CommerceOrder", { vendor_id: input.vendor_id })
        .filter((o) => ["new", "accepted", "ready"].includes(String(o.fulfillment)))
        .sort((a, b) => String(b.placed_at).localeCompare(String(a.placed_at)));
      const n = orders.length;
      const line = (o: (typeof orders)[number]) => `${o.order_number} $${Number(o.total).toFixed(2)} (${o.fulfillment})`;
      const msgs = n
        ? { es: `Tiene ${n} pedido${n > 1 ? "s" : ""} activo${n > 1 ? "s" : ""}: ${orders.slice(0, 3).map(line).join("; ")}. Toque un pedido en Mi Tienda para avanzarlo.`, en: `You have ${n} active order${n > 1 ? "s" : ""}: ${orders.slice(0, 3).map(line).join("; ")}. Tap an order in My Store to move it forward.` }
        : { es: "No hay pedidos activos ahora. Su QR está listo para el próximo cliente.", en: "No active orders right now. Your QR is ready for the next shopper." };
      const text = (msgs as Record<string, string>)[input.lang] ?? msgs.en;
      return finish(
        { text, sentences: [text], citations: [], gate_report: { pass: true, sentences: [] }, tier: "template", lang_used: input.lang, lang_fallback: false },
        { orders: orders.slice(0, 5).map((o) => ({ id: o.id, order_number: o.order_number, fulfillment: o.fulfillment, total: o.total })), route: "/app/store" },
      );
    }

    case "eligibility_question": {
      // vocabulary mapping + light fact capture from the message itself
      const text = (input.text ?? "").toLowerCase();
      if (/comida|food|tamal|elote|taco|fruta|helado|খাবার|طعام|食品|餐/.test(text)) recordFact(input.vendor_id, "vending_kind", "food");
      if (/ropa|clothing|merchandise|mercanc|accesorio|jewelry|joyas/.test(text)) recordFact(input.vendor_id, "vending_kind", "merchandise");
      if (/veteran|veterano/.test(text)) recordFact(input.vendor_id, "is_veteran", true);
      const facts2 = { ...factsFor(input.vendor_id), wants: "license" } as CaseFacts;
      const ev = evaluate(rb, facts2);

      if (!ev.track) {
        return finish(await explain(input, "ask_vending_kind", {}, [], ev.abstentions, undefined, true));
      }
      // sub-intent: course/step questions win over a bare "how much" (course cost is a step detail)
      const isCourse = /curso|course|food protection|protecci[oó]n de alimentos/.test(text);
      const isStep = isCourse || /paso|step|qu[eé] hago|what do i do|empiezo|start|siguiente|next|primero|first|how long|cu[aá]nto (tarda|dura|semanas)|timeline|critical path|d[oó]nde consigo|certificado de impuestos|tax cert/.test(text);
      const isFee = !isStep && /cu[aá]nto cuesta|how much (is|does)|fee|tarifa|cost|precio|waiver|exenci[oó]n|veteran|veterano|surviving|c[oó]njuge|a[ñn]os? (dura|valid)|years valid|how many years/.test(text);
      // docs branch keys on document nouns only — bare "necesito/need" is a track question, not a doc list
      const isDocs = !isStep && !isFee && /documento|document|papeles|requisitos|requirements|passport|pasaporte|\bid\b|identity|identidad|lista de doc|commissary|comisar/.test(text);

      if (isFee && ev.fees.length) {
        const feeRule = rb.records.find((r) => r.rule_id === "FEE-001")!;
        return finish(await explain(input, "fee", {
          amount: ev.fees[0].amount_usd, term: ev.fees[0].term_years, waived: ev.fees[0].waived_for_veteran,
        }, [{ idx: 1, citation: String(feeRule.citation), text: `$50 / 2 years; veteran waiver` }], ev.rules_fired));
      }
      if (isDocs && ev.documents) {
        const docRule = rb.records.find((r) => r.rule_id === "DOC-SUPERV-001")!;
        return finish(await explain(input, ev.documents.missing.length ? "docs_missing" : "docs_complete", {
          have: ev.documents.required.length - ev.documents.missing.length, need: ev.documents.required.length,
          missing_list: ev.documents.missing.map((m) => docName(m, input.lang)).join(", "),
        }, [{ idx: 1, citation: String(docRule.citation), text: JSON.stringify(docRule.requires) }], ev.rules_fired));
      }
      if (isStep && ev.sequencer) {
        // a course-specific question answers about the course step — but only while it's still remaining;
        // "I finished the course, what's next" falls through to the real next step
        const courseRemaining = ev.sequencer.remaining_steps.includes("food_protection_course");
        const target = isCourse && courseRemaining ? rb.records.find((r) => r.type === "sequence" && r.step === "food_protection_course") : undefined;
        const next = target
          ? { step: "food_protection_course", duration_days_range: target.duration_days_range as [number, number], note: String(target.note ?? "") }
          : ev.sequencer.next_steps[0];
        if (next) {
          const seqRule = rb.records.find((r) => r.step === next.step)!;
          return finish(await explain(input, "next_step", {
            step_name: stepName(next.step, input.lang), duration: asDuration(next.duration_days_range, input.lang),
            note: input.lang === "en" ? next.note : undefined,
            timeline: asDuration(ev.sequencer.timeline_days_range, input.lang),
          }, [{ idx: 1, citation: String(seqRule.citation), text: `${next.step} ${JSON.stringify(next.duration_days_range)} days` }], ev.rules_fired));
        }
      }
      // default: track answer
      const trackRule = rb.records.find((r) => r.rule_id === (ev.track === "supervisory_food" ? "ELIG-SUPERV-001" : "ELIG-GEN-001"))!;
      const key = ev.track === "supervisory_food" ? "track_supervisory_food" : "track_general_2027";
      return finish(await explain(input, key, {}, [
        { idx: 1, citation: String(trackRule.citation), text: JSON.stringify(trackRule.then) },
      ], ev.rules_fired));
    }

    case "smalltalk_other":
    case "unknown":
    default: {
      const help = {
        en: "I can help with: your license steps, checking a ticket, reading any letter, your documents, card payments, and logging cash sales. What do you need? You can always talk instead of typing.",
        es: "Puedo ayudar con: los pasos de su licencia, verificar una multa, leer cualquier carta, sus documentos, pagos con tarjeta, y anotar ventas en efectivo. ¿Qué necesita? Siempre puede hablar en vez de escribir.",
        bn: "আমি সাহায্য করতে পারি: লাইসেন্সের ধাপ, টিকিট যাচাই, চিঠি পড়া, ডকুমেন্ট, কার্ড পেমেন্ট, নগদ বিক্রি লেখা। কী দরকার?",
        ar: "أستطيع المساعدة في: خطوات الرخصة، فحص المخالفة، قراءة أي رسالة، مستنداتك، مدفوعات البطاقة، وتسجيل مبيعات النقد. ماذا تحتاج؟",
        zh: "我可以帮助您：执照步骤、查罚单、读信件、管理文件、刷卡收款、记录现金销售。您需要什么？",
      } as Record<string, string>;
      const text = help[input.lang] ?? help.en;
      return finish({ text, sentences: [text], citations: [], gate_report: { pass: true, sentences: [] }, tier: "template", lang_used: input.lang, lang_fallback: false });
    }
  }
});

/** Back-compat alias for the eval runner and older tests. */
export const route_inbound = assistant_route;
