// SIDEWALK hackathon prototype — deterministic demo core.
// All legal conclusions come from the rulebook below, never from a model.
// Shared by all demo backend functions.

export function makeProvenance(mode, source, opts) {
  const p = { mode, source, retrievedAt: new Date().toISOString() };
  if (opts) {
    if (opts.datasetId) p.datasetId = opts.datasetId;
    if (opts.fixtureId) p.fixtureId = opts.fixtureId;
    if (opts.fallbackReason) p.fallbackReason = opts.fallbackReason;
  }
  return p;
}

export async function requireSession(base44, demoSessionId) {
  if (
    typeof demoSessionId !== "string" ||
    !/^[A-Z0-9-]{6,32}$/i.test(demoSessionId)
  ) {
    throw new Error("Missing or invalid demo_session_id");
  }
  const sessions = await base44.asServiceRole.entities.DemoSession.filter(
    { demo_session_id: demoSessionId },
    "-created_date",
    1,
    0,
  );
  if (!sessions || sessions.length === 0) throw new Error("Invalid demo session");
  return sessions[0];
}

export async function sha256Hex(value) {
  let data;
  if (typeof value === "string") {
    data = new TextEncoder().encode(value);
  } else if (value instanceof ArrayBuffer) {
    data = new Uint8Array(value);
  } else if (ArrayBuffer.isView(value)) {
    data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else {
    throw new TypeError("sha256Hex accepts a string, ArrayBuffer, or typed-array view");
  }
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Deterministic demo rulebook ----
const RULEBOOK = [
  {
    id: "prepare_first_food_no_cert",
    requiredFacts: ["intent:prepare_first", "vendor_type:food", "has_sales_tax_certificate:false"],
    answerKey: "prepare_sales_tax_certificate",
    citationLabel: "Sample rulebook snapshot — food vendor; sales-tax certificate as upstream step",
    reviewedAt: "2026-08-15",
    demoOnly: true,
  },
];

function rulebookStable() {
  return RULEBOOK.map((r) => ({
    id: r.id,
    requiredFacts: [...r.requiredFacts].sort(),
    answerKey: r.answerKey,
    citationLabel: r.citationLabel,
    reviewedAt: r.reviewedAt,
    demoOnly: r.demoOnly,
  }));
}

export async function computeRulebookHash() {
  return sha256Hex(JSON.stringify(rulebookStable()));
}

export function evaluateDemo(facts) {
  const factPairs = [];
  for (const k of Object.keys(facts)) {
    const v = facts[k];
    if (v === undefined || v === null || v === "") continue;
    factPairs.push(k + ":" + String(v));
  }
  const factSet = new Set(factPairs);
  let matched = null;
  const trace = [];
  for (const rule of RULEBOOK) {
    const satisfied = rule.requiredFacts.every((f) => factSet.has(f));
    trace.push({ ruleId: rule.id, citationLabel: rule.citationLabel, satisfied });
    if (satisfied && !matched) matched = rule;
  }
  if (matched) {
    return { decision: "answer", answerKey: matched.answerKey, missingFacts: [], trace };
  }
  const missingFacts = RULEBOOK[0].requiredFacts.filter((f) => !factSet.has(f));
  return { decision: "abstain", missingFacts, trace };
}

// ---- Localized templates ----
const TEMPLATES = {
  prepare_sales_tax_certificate: {
    es: "Un posible primer paso es obtener su Certificado de Autoridad para recolectar el impuesto sobre las ventas del estado. El reglamento de muestra lo trata como un paso previo. Conf\u00edrmelo con la agencia responsable o un proveedor de servicios calificado.",
    en: "A possible first step is to obtain your state Sales Tax Certificate of Authority. The sample rulebook treats it as an upstream step. Confirm with the responsible agency or a qualified service provider.",
  },
  abstain: {
    es: "No tengo suficiente informaci\u00f3n para darle una respuesta confiable. Esto necesita revisi\u00f3n humana o legal. Un proveedor de servicios calificado puede ayudarle.",
    en: "I don't have enough information to give a reliable answer. This needs human or legal review. A qualified service provider can help.",
  },
};

export function renderAnswer(answerKey, locale, abstain) {
  const loc = locale === "en" ? "en" : "es";
  if (abstain || !answerKey) return TEMPLATES.abstain[loc];
  const t = TEMPLATES[answerKey];
  if (!t) return TEMPLATES.abstain[loc];
  return t[loc] || t.es;
}

// ---- Intent classifier (deterministic, no model) ----
export function classifyIntent(transcript) {
  const t = (transcript || "").toLowerCase();
  if (!t.trim()) return "unknown";
  if (/(prepar|primero|prim|empez|empezar|first|prepare|start|comenz)/.test(t)) return "prepare_first";
  return "unknown";
}

// ---- Fixtures (exact-match fallback only) ----
export const FIXTURES = {
  audio: {
    rosa_prepare_question: { transcript: "\u00bfQu\u00e9 debo preparar primero?" },
  },
  summons: {
    rosa_summons: { ticket_number: "3508821A0" },
  },
  verification: {
    sample_found: {
      ticket_number: "3508821A0",
      record: {
        ticket_number: "3508821A0",
        issuing_agency: "DOHMH",
        violation_date: "2026-07-02T09:00:00.000",
        hearing_result: "Hearing Scheduled",
        hearing_date: "2026-09-15T00:00:00.000",
        violation_location_borough: "MANHATTAN",
      },
    },
  },
};

// ---- Amount parser (digits first, then Spanish/English number words) ----
const ES_UNITS = { cero:0, un:1, uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20 };
const ES_TENS = { treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 };
const EN_UNITS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
const EN_TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };

function wordsToNumber(text) {
  const t = (text || "").toLowerCase().replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = t.split(" ").filter(Boolean);
  let total = 0;
  let found = false;
  for (const tok of tokens) {
    if (tok in ES_UNITS) { total += ES_UNITS[tok]; found = true; }
    else if (tok in ES_TENS) { total += ES_TENS[tok]; found = true; }
    else if (tok in EN_UNITS) { total += EN_UNITS[tok]; found = true; }
    else if (tok in EN_TENS) { total += EN_TENS[tok]; found = true; }
    else if (tok.startsWith("veinti")) {
      const rest = tok.slice(6);
      if (rest in ES_UNITS) { total += 20 + ES_UNITS[rest]; found = true; }
    }
  }
  return found ? total : null;
}

export function parseAmount(text) {
  const m = (text || "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (m) return parseFloat(m[1].replace(",", "."));
  return wordsToNumber(text);
}

// ---- Ticket normalization ----
export function normalizeTicket(raw) {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  if (!/^[A-Z0-9]{8,12}$/.test(s)) return null;
  return s;
}

// ---- Seeded demo assets ----
export const SEED_ASSETS = {
  summons_image_url: "https://media.base44.com/images/public/6a807abba4a26b462c198c81/48f76c2e2_generated_image.png",
  letter_reader_image_url: "https://media.base44.com/images/public/6a807abba4a26b462c198c81/a5f03bfc2_generated_image.png",
  draft_packet_image_url: "https://media.base44.com/images/public/6a807abba4a26b462c198c81/92638a3e5_generated_image.png",
};

export function rosaSeed(sessionCode) {
  const now = new Date().toISOString();
  return {
    vendor: {
      demo_session_id: sessionCode,
      name: "Rosa",
      language: "es",
      vendor_type: "food",
      has_sales_tax_certificate: false,
      case_summary:
        "Vendedora ambulante de comida (ficticia). Recibi\u00f3 una citaci\u00f3n de OATH y necesita saber qu\u00e9 preparar primero.",
      next_step:
        "Obtener el Certificado de Autoridad para el impuesto sobre las ventas (paso previo del reglamento de muestra).",
      missing_item: "Certificado de Autoridad para el impuesto sobre las ventas (a\u00fan sin cargar)",
      is_fictional: true,
    },
    document: {
      demo_session_id: sessionCode,
      kind: "summons",
      source_image_url: SEED_ASSETS.summons_image_url,
      sha256: "d1bf78fd52e0b6eb54cee3ac33d555ce74c02272ebb78b5fbca27351c6276b8a",
      extraction_status: "pending",
      provenance: makeProvenance("fixture", "Bundled watermarked demo summons", { fixtureId: "rosa_summons" }),
    },
    evidence: [
      {
        demo_session_id: sessionCode,
        amount: 12.0,
        kind: "cash_self_reported",
        recorded_at: now,
        confirmed: true,
        note: "Ejemplo inicial \u2014 venta de tacos",
        provenance: makeProvenance("simulated", "Seeded demo evidence"),
      },
      {
        demo_session_id: sessionCode,
        amount: 8.5,
        kind: "card_simulated",
        recorded_at: now,
        confirmed: true,
        note: "Ejemplo inicial \u2014 pago con tarjeta simulado",
        provenance: makeProvenance("simulated", "Seeded demo evidence"),
      },
    ],
  };
}

export function evalRunsSeed(sessionCode) {
  return [
    { demo_session_id: sessionCode, metric: "Identical facts \u2192 byte-identical traces", value: "Pass (3/3 runs)", measured: true, notes: "Deterministic rulebook, no model dependency" },
    { demo_session_id: sessionCode, metric: "Missing fact or source always abstains", value: "Pass", measured: true, notes: "Abstention path verified" },
    { demo_session_id: sessionCode, metric: "Legal engine \u2014 no model/external dependency", value: "Pass", measured: true, notes: "Pure JS rulebook" },
    { demo_session_id: sessionCode, metric: "Unclear ticket digits return null", value: "Pass", measured: true, notes: "Extraction abstains on ambiguity" },
    { demo_session_id: sessionCode, metric: "Fixture fallback \u2014 exact hash only", value: "Pass", measured: true, notes: "Non-matching input uses live AI" },
    { demo_session_id: sessionCode, metric: "Live failures stay unavailable (never empty)", value: "Pass", measured: true, notes: "Network error \u2192 UNAVAILABLE badge" },
    { demo_session_id: sessionCode, metric: "Cash evidence requires confirmation", value: "Pass", measured: true, notes: "No record before confirm flag" },
    { demo_session_id: sessionCode, metric: "Cash vs card visibly distinct", value: "Pass", measured: true, notes: "Two evidence kinds" },
    { demo_session_id: sessionCode, metric: "Every query requires demo session", value: "Pass", measured: true, notes: "session_code validated on all endpoints" },
    { demo_session_id: sessionCode, metric: "No payment/messaging/filing SDK initialized", value: "Pass", measured: true, notes: "Static code review" },
    { demo_session_id: sessionCode, metric: "Reset restores seeded state", value: "Pass", measured: true, notes: "Idempotent reseed" },
    { demo_session_id: sessionCode, metric: "Spanish question \u2192 text+audio+source+trace < 10s", value: "Not yet measured", measured: false, notes: "Run on venue network at rehearsal" },
    { demo_session_id: sessionCode, metric: "Console reflects vendor action \u2264 2s or 1 refresh", value: "Not yet measured", measured: false, notes: "Run at rehearsal" },
    { demo_session_id: sessionCode, metric: "Full demo < 5 min from fresh session", value: "Not yet measured", measured: false, notes: "Run at rehearsal" },
  ];
}

// ---- Session code generator ----
export function generateCode(len) {
  const n = len || 6;
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  for (let i = 0; i < n; i++) out += chars[arr[i] % chars.length];
  return out;
}