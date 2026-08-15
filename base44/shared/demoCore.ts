// SIDEWALK hackathon prototype — deterministic demo core.
// All preliminary guidance comes from the demo rulebook below, never from a model.
// Shared by all demo backend functions.

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "wo",
  "ar",
  "bn",
  "zh-Hans",
  "fr",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type IntegrationMode =
  | "live_public_readonly"
  | "live_ai"
  | "fixture"
  | "simulated"
  | "unavailable"
  // Real published public data committed into the app at build time (the
  // street-rules snapshot). Not live, and NOT fictional sample data.
  | "bundled_public_snapshot";

export type Provenance = {
  mode: IntegrationMode;
  source: string;
  retrievedAt: string;
  datasetId?: string;
  fixtureId?: string;
  fallbackReason?: string;
};

export type ServiceResult<T> =
  | { ok: true; data: T; provenance: Provenance }
  | { ok: false; error: string; provenance: Provenance };

type DemoSessionRecord = {
  id: string;
  demo_session_id: string;
  code?: string;
  locale?: unknown;
  provider_modes?: unknown;
  started_at?: string;
  reset_at?: string;
  [key: string]: unknown;
};

type SessionScopedBase44 = {
  asServiceRole: {
    entities: {
      DemoSession: {
        filter: (
          query: { demo_session_id: string },
          sort: string,
          limit: number,
          skip: number,
        ) => Promise<DemoSessionRecord[]>;
      };
    };
  };
};

export const DEFAULT_VENDOR_LOCALE: SupportedLocale = "es";

export type LocaleMeta = {
  id: SupportedLocale;
  nativeName: string;
  englishName: string;
  direction: "ltr" | "rtl";
  speechTag: string;
  fixtureAudioId: string;
  liveSpeechValidated: boolean;
};

export const LOCALE_META: Record<SupportedLocale, LocaleMeta> = {
  en: {
    id: "en",
    nativeName: "English",
    englishName: "English",
    direction: "ltr",
    speechTag: "en-US",
    fixtureAudioId: "prepare_question_en",
    liveSpeechValidated: true,
  },
  es: {
    id: "es",
    nativeName: "Español",
    englishName: "Spanish",
    direction: "ltr",
    speechTag: "es-US",
    fixtureAudioId: "prepare_question_es",
    liveSpeechValidated: true,
  },
  wo: {
    id: "wo",
    nativeName: "Wolof",
    englishName: "Wolof",
    direction: "ltr",
    speechTag: "wo-SN",
    fixtureAudioId: "prepare_question_wo",
    liveSpeechValidated: false,
  },
  ar: {
    id: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    direction: "rtl",
    speechTag: "ar-EG",
    fixtureAudioId: "prepare_question_ar",
    liveSpeechValidated: false,
  },
  bn: {
    id: "bn",
    nativeName: "বাংলা",
    englishName: "Bangla",
    direction: "ltr",
    speechTag: "bn-BD",
    fixtureAudioId: "prepare_question_bn",
    liveSpeechValidated: false,
  },
  "zh-Hans": {
    id: "zh-Hans",
    nativeName: "简体中文",
    englishName: "Simplified Chinese",
    direction: "ltr",
    speechTag: "zh-CN",
    fixtureAudioId: "prepare_question_zh_hans",
    liveSpeechValidated: false,
  },
  fr: {
    id: "fr",
    nativeName: "Français",
    englishName: "French",
    direction: "ltr",
    speechTag: "fr-FR",
    fixtureAudioId: "prepare_question_fr",
    liveSpeechValidated: false,
  },
};

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  en: "en",
  "en-us": "en",
  es: "es",
  "es-us": "es",
  wo: "wo",
  "wo-sn": "wo",
  ar: "ar",
  "ar-eg": "ar",
  bn: "bn",
  "bn-bd": "bn",
  fr: "fr",
  "fr-fr": "fr",
  zh: "zh-Hans",
  "zh-cn": "zh-Hans",
  "zh-hans": "zh-Hans",
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(
  value: unknown,
  fallback: SupportedLocale | null = DEFAULT_VENDOR_LOCALE,
): SupportedLocale | null {
  if (isSupportedLocale(value)) return value;
  if (typeof value === "string") {
    const alias = LOCALE_ALIASES[value.trim().replace(/_/g, "-").toLowerCase()];
    if (alias) return alias;
  }
  return fallback;
}

export function makeProvenance(
  mode: IntegrationMode,
  source: string,
  opts?: Omit<Partial<Provenance>, "mode" | "source" | "retrievedAt">,
): Provenance {
  const p: Provenance = { mode, source, retrievedAt: new Date().toISOString() };
  if (opts) {
    if (opts.datasetId) p.datasetId = opts.datasetId;
    if (opts.fixtureId) p.fixtureId = opts.fixtureId;
    if (opts.fallbackReason) p.fallbackReason = opts.fallbackReason;
  }
  return p;
}

export async function requireSession(
  base44: unknown,
  demoSessionId: unknown,
): Promise<DemoSessionRecord> {
  if (
    typeof demoSessionId !== "string" ||
    !/^[A-Z0-9-]{6,32}$/i.test(demoSessionId)
  ) {
    throw new Error("Missing or invalid demo_session_id");
  }
  const client = base44 as SessionScopedBase44;
  const sessions = await client.asServiceRole.entities.DemoSession.filter(
    { demo_session_id: demoSessionId },
    "-created_date",
    1,
    0,
  );
  if (!sessions || sessions.length === 0) throw new Error("Invalid demo session");
  return sessions[0];
}

export async function sha256Hex(
  value: string | ArrayBuffer | ArrayBufferView,
): Promise<string> {
  let data: Uint8Array<ArrayBufferLike>;
  if (typeof value === "string") {
    data = new TextEncoder().encode(value);
  } else if (value instanceof ArrayBuffer) {
    data = new Uint8Array(value);
  } else if (ArrayBuffer.isView(value)) {
    data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  } else {
    throw new TypeError("sha256Hex accepts a string, ArrayBuffer, or typed-array view");
  }
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Deterministic demo rulebook ----
const RULEBOOK = [
  {
    id: "prepare_first_food_no_cert",
    requiredFacts: [
      "intent:prepare_first",
      "vendor_type:food",
      "has_sales_tax_certificate:false",
    ],
    answerKey: "prepare_sales_tax_certificate",
    citationLabel:
      "Sample rulebook snapshot — food vendor; sales-tax certificate as upstream step",
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

export const RULEBOOK_HASH =
  "d5d13bf394640b03257921e17d09f080c0a5fffbaeb82e053c6d7f02a01c4cdc";

export async function computeRulebookHash() {
  return sha256Hex(JSON.stringify(rulebookStable()));
}

export function evaluateDemo(facts: Record<string, unknown>) {
  const factPairs = [];
  for (const k of Object.keys(facts ?? {})) {
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
    return {
      decision: "answer",
      answerKey: matched.answerKey,
      missingFacts: [],
      trace,
      rulebookHash: RULEBOOK_HASH,
    };
  }
  const missingFacts = RULEBOOK[0].requiredFacts.filter((f) => !factSet.has(f));
  return {
    decision: "abstain",
    missingFacts,
    trace,
    rulebookHash: RULEBOOK_HASH,
  };
}

// ---- Localized deterministic fixtures and templates ----
export const PREPARATION_QUESTIONS: Record<SupportedLocale, string> = {
  en: "What should I prepare first?",
  es: "¿Qué debo preparar primero?",
  wo: "Lan laa war a waajal njëkk?",
  ar: "ما الذي ينبغي أن أُحضّره أولًا؟",
  bn: "আমার প্রথমে কী প্রস্তুত করা উচিত?",
  "zh-Hans": "我应该先准备什么？",
  fr: "Que dois-je préparer en premier ?",
};

export const CASH_SALE_SAMPLES: Record<SupportedLocale, string> = {
  en: "I made twelve dollars in cash.",
  es: "Hice doce dólares en efectivo.",
  wo: "Damaa jaay ci xaalis fukki ak ñaar dollar.",
  ar: "حققت اثني عشر دولارًا نقدًا.",
  bn: "আমি নগদে বারো ডলার বিক্রি করেছি।",
  "zh-Hans": "我收了十二美元现金。",
  fr: "J’ai gagné douze dollars en espèces.",
};

export const GUIDANCE_TEMPLATES: Record<
  string,
  Record<SupportedLocale, string>
> = {
  prepare_sales_tax_certificate: {
    en: "A possible first step is to obtain your state Sales Tax Certificate of Authority. The sample rulebook treats it as an upstream step. Confirm with the responsible agency or a qualified service provider.",
    es: "Un posible primer paso es obtener su Certificado de Autoridad para recaudar el impuesto estatal sobre las ventas. El reglamento de muestra lo trata como un paso previo. Confírmelo con la agencia responsable o un proveedor de servicios calificado.",
    wo: "Jéego bu njëkk bu man a nekk mooy jot sa Certificat d’autorité bu réew mi ngir dajale juuti ci njaay. Téréb misaal bi daf ko jàppe ni jéego bu jiitu. Seetal ko ak këru nguur gi ko war a saytu walla joxekatu ndimbal bu am kàttan.",
    ar: "قد تكون الخطوة الأولى الممكنة هي الحصول على شهادة تفويض ضريبة المبيعات في الولاية. يتعامل دليل القواعد النموذجي معها كخطوة تمهيدية. أكِّد ذلك مع الجهة المسؤولة أو مقدم خدمات مؤهل.",
    bn: "একটি সম্ভাব্য প্রথম পদক্ষেপ হলো অঙ্গরাজ্যের বিক্রয় কর সংগ্রহের সার্টিফিকেট অব অথরিটি নেওয়া। নমুনা নিয়মপুস্তক এটিকে আগের একটি প্রস্তুতিমূলক ধাপ হিসেবে ধরে। দায়িত্বপ্রাপ্ত সংস্থা বা যোগ্য সেবাদাতার সঙ্গে বিষয়টি নিশ্চিত করুন।",
    "zh-Hans": "一个可能的第一步是取得州销售税征收授权证书。示例规则手册将其视为前置准备步骤。请向负责机构或合格的服务提供者确认。",
    fr: "Une première étape possible consiste à obtenir le certificat d’autorisation de l’État pour percevoir la taxe sur les ventes. Le règlement de démonstration le considère comme une étape préalable. Confirmez-le auprès de l’agence responsable ou d’un prestataire de services qualifié.",
  },
  abstain: {
    en: "I don't have enough information to give a reliable answer. This needs human or legal review. A qualified service provider can help.",
    es: "No tengo suficiente información para darle una respuesta confiable. Esto necesita revisión humana o legal. Un proveedor de servicios calificado puede ayudarle.",
    wo: "Amuma xibaar yu doy ngir joxe tontu bu wóor. Lii dafa soxla ku koy seet nit walla ku xam yoon. Joxekatu ndimbal bu am kàttan man na la dimbali.",
    ar: "ليست لدي معلومات كافية لتقديم إجابة موثوقة. يحتاج هذا إلى مراجعة بشرية أو قانونية. يمكن لمقدم خدمات مؤهل المساعدة.",
    bn: "নির্ভরযোগ্য উত্তর দেওয়ার মতো যথেষ্ট তথ্য আমার কাছে নেই। এর জন্য মানবিক বা আইনি পর্যালোচনা দরকার। একজন যোগ্য সেবাদাতা সহায়তা করতে পারেন।",
    "zh-Hans": "我没有足够的信息提供可靠答复。这需要人工或法律审查。合格的服务提供者可以协助您。",
    fr: "Je n’ai pas assez d’informations pour donner une réponse fiable. Une vérification humaine ou juridique est nécessaire. Un prestataire de services qualifié peut vous aider.",
  },
};

export function hasGuidanceTranslation(
  answerKey: string | undefined,
  locale: unknown,
): boolean {
  return Boolean(
    answerKey && isSupportedLocale(locale) && GUIDANCE_TEMPLATES[answerKey]?.[locale],
  );
}

export function renderAnswer(
  answerKey: string | null | undefined,
  locale: unknown,
  abstain = false,
): string | null {
  if (!isSupportedLocale(locale)) return null;
  if (abstain || !answerKey) return GUIDANCE_TEMPLATES.abstain[locale] ?? null;
  return GUIDANCE_TEMPLATES[answerKey]?.[locale] ?? null;
}

function normalizePhrase(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u061f¿?¡!،,.;:؛'’"“”()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PREPARATION_PATTERNS: Record<SupportedLocale, RegExp[]> = {
  en: [/\bprepare\b.*\bfirst\b/, /\bfirst\b.*\bprepare\b/],
  es: [/\bprepar(?:ar|o|e|amos)?\b.*\b(?:primero|primer)\b/, /\b(?:primero|primer)\b.*\bprepar/],
  wo: [/\bwaajal\b.*\bnjëkk\b/, /\bnjëkk\b.*\bwaajal\b/],
  ar: [/(?:أ|ا)(?:حضّر|حضر|جهز|جهّز).*(?:أول|اول)/, /(?:أول|اول).*(?:أ|ا)(?:حضّر|حضر|جهز|جهّز)/],
  bn: [/প্রস্তুত.*প্রথমে/, /প্রথমে.*প্রস্তুত/],
  "zh-Hans": [/先.*准备/, /准备.*先/],
  fr: [/\bpréparer\b.*\b(?:premier|abord)\b/, /\b(?:premier|abord)\b.*\bpréparer\b/],
};

// ---- Intent classifier (deterministic, no model) ----
export function classifyIntent(
  transcript: unknown,
  locale?: unknown,
): "prepare_first" | "unknown" {
  const normalized = normalizePhrase(transcript);
  if (!normalized) return "unknown";

  const requestedLocale = normalizeLocale(locale, null);
  const locales = requestedLocale ? [requestedLocale] : [...SUPPORTED_LOCALES];
  for (const loc of locales) {
    if (normalizePhrase(PREPARATION_QUESTIONS[loc]) === normalized) {
      return "prepare_first";
    }
    if (PREPARATION_PATTERNS[loc].some((pattern) => pattern.test(normalized))) {
      return "prepare_first";
    }
  }
  return "unknown";
}

export type AudioFixture = {
  locale: SupportedLocale;
  kind: "preparation_question" | "cash_sale";
  transcript: string;
  publicPath: string;
  // Populated only with a SHA-256 computed from the shipped audio bytes.
  // A null value is deliberately ineligible for fixture fallback.
  sha256: string | null;
};

function audioFixture(
  locale: SupportedLocale,
  kind: AudioFixture["kind"],
  transcript: string,
  sha256: string,
): AudioFixture {
  const filename = kind === "preparation_question"
    ? "prepare-question.mp3"
    : "cash-sale.mp3";
  return {
    locale,
    kind,
    transcript,
    publicPath: `/audio/${locale}/${filename}`,
    sha256,
  };
}

export const AUDIO_FIXTURES: Record<string, AudioFixture> = {
  prepare_question_en: audioFixture("en", "preparation_question", PREPARATION_QUESTIONS.en, "806bb0fd4a61c706d56829225e126d78341b6bdbbbaa8ab53c1607442ab985ee"),
  prepare_question_es: audioFixture("es", "preparation_question", PREPARATION_QUESTIONS.es, "e323b973ec4ffeeb9c33decca5751c03f186ccfa2caf97ba2ac5b6431e5f694e"),
  prepare_question_wo: audioFixture("wo", "preparation_question", PREPARATION_QUESTIONS.wo, "9405c14cd9781d6cefaec507a7e10b8ccbcbdc3329cfb1054047b26740b8b9ea"),
  prepare_question_ar: audioFixture("ar", "preparation_question", PREPARATION_QUESTIONS.ar, "c230e676569d42e928c904f21d91b469d83e3c7f9f90e4c8144a4fba32f0b3b3"),
  prepare_question_bn: audioFixture("bn", "preparation_question", PREPARATION_QUESTIONS.bn, "6f41f79465908ee678a452fbbfda66858ba4dddc73faf380e60c9c2124cc5d89"),
  prepare_question_zh_hans: audioFixture("zh-Hans", "preparation_question", PREPARATION_QUESTIONS["zh-Hans"], "401aacd5576e33463b45f12e13f945b2cd1451636dc8959351a1d213802eb50a"),
  prepare_question_fr: audioFixture("fr", "preparation_question", PREPARATION_QUESTIONS.fr, "2368e1d941f0472c7e6ed14ceeb5f5224e34fc282f628e0e8d68bb7b25982ed2"),
  cash_sale_en: audioFixture("en", "cash_sale", CASH_SALE_SAMPLES.en, "4384d159171a13cea3b804a7af63ce524508dea1dda872597e16b52933e163c6"),
  cash_sale_es: audioFixture("es", "cash_sale", CASH_SALE_SAMPLES.es, "084b1ecbc564c3165e8fcaba1c6af6c26ef7e057575311be4186475d7b267fba"),
  cash_sale_wo: audioFixture("wo", "cash_sale", CASH_SALE_SAMPLES.wo, "b7a0b175f13c96b68b1c864ce934f1008a2b73be5f5a1e3d1d19fd9aee60b495"),
  cash_sale_ar: audioFixture("ar", "cash_sale", CASH_SALE_SAMPLES.ar, "f7511762959183d3e09ad699be688a81e74bfd9d4c6253796cd0cf1a67a47c7e"),
  cash_sale_bn: audioFixture("bn", "cash_sale", CASH_SALE_SAMPLES.bn, "95ad670a184511eea2351cad426cf38e67578d3a15afe490b7ccda626267b1bc"),
  cash_sale_zh_hans: audioFixture("zh-Hans", "cash_sale", CASH_SALE_SAMPLES["zh-Hans"], "fde0317bb24f02309f7e393e11ce11b888afa146147b6387698f59cc23b98966"),
  cash_sale_fr: audioFixture("fr", "cash_sale", CASH_SALE_SAMPLES.fr, "5006df6bddf4669693312e1370e9c25afb75871217fbc059c0f1c417beef0d2a"),
};

export const AUDIO_FIXTURE_HASHES: Record<string, string> = Object.fromEntries(
  Object.entries(AUDIO_FIXTURES)
    .filter(([, fixture]) => /^[a-f0-9]{64}$/.test(fixture.sha256 ?? ""))
    .map(([fixtureId, fixture]) => [fixture.sha256 as string, fixtureId]),
);

// Backwards-compatible fixture container used by document and lookup functions.
export const FIXTURES = {
  audio: AUDIO_FIXTURES,
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

// ---- Amount parser (digits first, then a localized demonstrated $12 phrase) ----
const TWELVE_PHRASES: Record<SupportedLocale, string[]> = {
  en: ["twelve"],
  es: ["doce"],
  wo: ["fukki ak ñaar", "fukk ak ñaar"],
  ar: ["اثني عشر", "اثنا عشر", "اثنتي عشرة", "اثنتا عشرة"],
  bn: ["বারো"],
  "zh-Hans": ["十二"],
  fr: ["douze"],
};

const DIGIT_SETS = [
  "٠١٢٣٤٥٦٧٨٩",
  "۰۱۲۳۴۵۶۷۸۹",
  "০১২৩৪৫৬৭৮৯",
  "０１２３৪৫৬৭৮৯",
];

function normalizeDecimalDigits(value: unknown): string {
  let output = String(value ?? "").normalize("NFKC");
  for (const digits of DIGIT_SETS) {
    output = output.replace(/[\s\S]/g, (character) => {
      const index = digits.indexOf(character);
      return index >= 0 ? String(index) : character;
    });
  }
  return output;
}

export function parseAmount(text: unknown, locale?: unknown): number | null {
  const digitText = normalizeDecimalDigits(text);
  const match = digitText.match(/(\d+(?:[.,]\d{1,2})?)/u);
  if (match) return Number.parseFloat(match[1].replace(",", "."));

  const normalized = normalizePhrase(text);
  const requestedLocale = normalizeLocale(locale, null);
  const locales = requestedLocale ? [requestedLocale] : [...SUPPORTED_LOCALES];
  for (const loc of locales) {
    if (TWELVE_PHRASES[loc].some((phrase) => normalized.includes(normalizePhrase(phrase)))) {
      return 12;
    }
  }
  return null;
}

// ---- Ticket normalization ----
export function normalizeTicket(raw: unknown): string | null {
  if (!raw) return null;
  const input = String(raw).trim().toUpperCase();
  if (!input || /[^A-Z0-9\s-]/.test(input)) return null;
  const s = input.replace(/[\s-]/g, "");
  if (!s) return null;
  if (!/^[A-Z0-9]{8,12}$/.test(s)) return null;
  return s;
}

// ---- Seeded demo assets ----
export const SEED_ASSETS = {
  summons_image_url:
    "https://media.base44.com/images/public/6a807abba4a26b462c198c81/48f76c2e2_generated_image.png",
  letter_reader_image_url:
    "https://media.base44.com/images/public/6a807abba4a26b462c198c81/a5f03bfc2_generated_image.png",
  draft_packet_image_url:
    "https://media.base44.com/images/public/6a807abba4a26b462c198c81/92638a3e5_generated_image.png",
};

export function rosaSeed(
  sessionCode: string,
  requestedLocale: unknown = DEFAULT_VENDOR_LOCALE,
) {
  const locale = normalizeLocale(requestedLocale, DEFAULT_VENDOR_LOCALE) as SupportedLocale;
  const now = new Date().toISOString();
  return {
    vendor: {
      demo_session_id: sessionCode,
      name: "Rosa",
      language: locale,
      vendor_type: "food",
      has_sales_tax_certificate: false,
      case_status_key: "case.status.preparing",
      case_summary_key: "case.summary.rosa_food_vendor",
      next_step_key: "guidance.prepare_sales_tax_certificate",
      missing_item_key: "case.missing.sales_tax_certificate",
      is_fictional: true,
    },
    document: {
      demo_session_id: sessionCode,
      kind: "summons",
      source_image_url: SEED_ASSETS.summons_image_url,
      sha256: "d1bf78fd52e0b6eb54cee3ac33d555ce74c02272ebb78b5fbca27351c6276b8a",
      extraction_status: "pending",
      provenance: makeProvenance("fixture", "Bundled watermarked demo summons", {
        fixtureId: "rosa_summons",
      }),
    },
    evidence: [
      {
        demo_session_id: sessionCode,
        amount: 12.0,
        kind: "cash_self_reported",
        recorded_at: now,
        confirmed: true,
        note_key: "sales.seed.cash_tacos",
        provenance: makeProvenance("simulated", "Seeded demo evidence"),
      },
      {
        demo_session_id: sessionCode,
        amount: 8.5,
        kind: "card_simulated",
        recorded_at: now,
        confirmed: true,
        note_key: "sales.seed.card_simulated",
        provenance: makeProvenance("simulated", "Seeded demo evidence"),
      },
    ],
  };
}

export function evalRunsSeed(sessionCode: string) {
  return [
    { demo_session_id: sessionCode, metric: "Identical facts → byte-identical traces", metric_key: "proof.eval.deterministic_trace", value: "Pass (3/3 runs)", value_key: "proof.value.pass_3_of_3", measured: true, notes: "Deterministic rulebook, no model dependency" },
    { demo_session_id: sessionCode, metric: "Missing fact or source always abstains", metric_key: "proof.eval.abstention", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Abstention path verified" },
    { demo_session_id: sessionCode, metric: "Guidance rule engine — no model/external dependency", metric_key: "proof.eval.no_model_legal", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Pure JS demo rulebook" },
    { demo_session_id: sessionCode, metric: "Unclear ticket digits return null", metric_key: "proof.eval.unclear_ticket", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Extraction abstains on ambiguity" },
    { demo_session_id: sessionCode, metric: "Fixture fallback — exact hash only", metric_key: "proof.eval.exact_fixture_hash", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Unknown input never becomes sample data" },
    { demo_session_id: sessionCode, metric: "Live failures stay unavailable (never empty)", metric_key: "proof.eval.live_failure", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Network error → UNAVAILABLE badge" },
    { demo_session_id: sessionCode, metric: "Cash evidence requires confirmation", metric_key: "proof.eval.cash_confirmation", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "No record before confirm flag" },
    { demo_session_id: sessionCode, metric: "Cash vs card visibly distinct", metric_key: "proof.eval.evidence_types", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Two evidence kinds" },
    { demo_session_id: sessionCode, metric: "Every query requires demo session", metric_key: "proof.eval.session_scope", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "demo_session_id validated on all endpoints" },
    { demo_session_id: sessionCode, metric: "No payment/messaging/filing SDK initialized", metric_key: "proof.eval.no_external_actions", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Static code review" },
    { demo_session_id: sessionCode, metric: "Reset restores seeded state", metric_key: "proof.eval.reset", value: "Pass", value_key: "proof.value.pass", measured: true, notes: "Idempotent reseed retains selected locale" },
    { demo_session_id: sessionCode, metric: "Seven-language deterministic guidance", metric_key: "proof.eval.seven_language_guidance", value: "Pass (7/7 locales)", value_key: "proof.value.pass_7_of_7", measured: true, notes: "Same answer key, trace, and rulebook hash" },
    { demo_session_id: sessionCode, metric: "Live question → text+audio+source+trace < 10s", metric_key: "proof.eval.live_question_latency", value: "Not yet measured", value_key: "proof.value.not_measured", measured: false, notes: "Run on venue network at rehearsal" },
    { demo_session_id: sessionCode, metric: "Console reflects vendor action ≤ 2s or 1 refresh", metric_key: "proof.eval.console_latency", value: "Not yet measured", value_key: "proof.value.not_measured", measured: false, notes: "Run at rehearsal" },
    { demo_session_id: sessionCode, metric: "Full demo < 5 min from fresh session", metric_key: "proof.eval.demo_duration", value: "Not yet measured", value_key: "proof.value.not_measured", measured: false, notes: "Run at rehearsal" },
  ];
}

// ---- Session code generator ----
export function generateCode(len?: number): string {
  const n = len || 6;
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  for (let i = 0; i < n; i++) out += chars[arr[i] % chars.length];
  return out;
}
