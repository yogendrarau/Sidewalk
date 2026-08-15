/**
 * Rule-engine templates — the deterministic narration tier (invariant 5's final fallback).
 * Every legal-fact sentence carries a citation index [n] into the citations array the
 * caller provides. Sentences are short; one idea each; voice-first friendly.
 * T1 langs es/bn/ar/zh/en. Missing key in a language → English text (never silent downgrade:
 * the reply carries lang_fallback so the UI can label it).
 */
export type Tmpl = (p: Record<string, unknown>) => string[];

const STEP_NAMES: Record<string, Record<string, string>> = {
  nys_sales_tax_certificate: {
    en: "the New York State sales tax certificate", es: "el certificado de impuestos sobre ventas del Estado de Nueva York",
    bn: "নিউ ইয়র্ক স্টেট সেলস ট্যাক্স সার্টিফিকেট", ar: "شهادة ضريبة المبيعات لولاية نيويورك", zh: "纽约州销售税证书",
  },
  food_protection_course: {
    en: "the food protection course", es: "el curso de protección de alimentos",
    bn: "খাদ্য সুরক্ষা কোর্স", ar: "دورة سلامة الغذاء", zh: "食品保护课程",
  },
  submit_license_application: {
    en: "submitting the license application", es: "presentar la solicitud de licencia",
    bn: "লাইসেন্সের আবেদন জমা দেওয়া", ar: "تقديم طلب الرخصة", zh: "提交执照申请",
  },
  await_general_window_2027: {
    en: "waiting for the 2027 general-license window", es: "esperar la ventana de licencias generales de 2027",
    bn: "২০২৭ সালের সাধারণ লাইসেন্স উইন্ডোর জন্য অপেক্ষা", ar: "انتظار فترة الرخص العامة 2027", zh: "等待2027年普通执照窗口",
  },
};
const DOC_NAMES: Record<string, Record<string, string>> = {
  identity_document: { en: "an identity document — a foreign passport is accepted", es: "un documento de identidad — se acepta el pasaporte extranjero", bn: "পরিচয়পত্র — বিদেশি পাসপোর্ট গ্রহণযোগ্য", ar: "وثيقة هوية — جواز السفر الأجنبي مقبول", zh: "身份证件——接受外国护照" },
  proof_of_address: { en: "proof of address", es: "comprobante de domicilio", bn: "ঠিকানার প্রমাণ", ar: "إثبات العنوان", zh: "地址证明" },
  nys_sales_tax_certificate: { en: "the state sales tax certificate", es: "el certificado estatal de impuestos", bn: "স্টেট সেলস ট্যাক্স সার্টিফিকেট", ar: "شهادة ضريبة المبيعات", zh: "州销售税证书" },
  food_protection_certificate: { en: "the food protection certificate", es: "el certificado del curso de alimentos", bn: "খাদ্য সুরক্ষা সার্টিফিকেট", ar: "شهادة سلامة الغذاء", zh: "食品保护证书" },
  commissary_agreement: { en: "a commissary agreement", es: "un acuerdo de comisaría de comida", bn: "কমিসারি চুক্তি", ar: "اتفاقية المفوضية الغذائية", zh: "餐车基地协议" },
};
export const stepName = (s: string, lang: string) => STEP_NAMES[s]?.[lang] ?? STEP_NAMES[s]?.en ?? s;
export const docName = (d: string, lang: string) => DOC_NAMES[d]?.[lang] ?? DOC_NAMES[d]?.en ?? d;

type Lang = "en" | "es" | "bn" | "ar" | "zh";

const T: Record<Lang, Record<string, Tmpl>> = {
  en: {
    ask_vending_kind: () => ["Do you sell food, or merchandise like clothing or accessories?"],
    track_supervisory_food: (p) => [
      `You would apply on the supervisory food-vendor track. [1]`,
      `The city issues 2,200 of these licenses per year through 2031. [1]`,
    ],
    track_general_2027: () => [
      `You would apply on the new general-vendor track. [1]`,
      `About 10,500 new licenses start in 2027. [1]`,
    ],
    next_step: (p) => [
      `Your next step is ${p.step_name}. [1]`,
      ...(p.duration ? [`It usually takes ${p.duration}. [1]`] : []),
      ...(p.note ? [`${p.note} [1]`] : []),
      ...(p.timeline ? [`Altogether, the honest timeline to file is about ${p.timeline}.`] : []),
    ],
    fee: (p) => [
      `The license costs $${p.amount} for ${p.term} years. [1]`,
      `Honorably discharged veterans and their surviving spouses or domestic partners do not pay this fee. [1]`,
      ...(p.waived ? ["Based on what you told me, that waiver applies to you. [1]"] : []),
    ],
    docs_missing: (p) => [
      `Your file has ${p.have} of ${p.need} documents.`,
      `Still missing: ${p.missing_list}. [1]`,
    ],
    docs_complete: () => ["Your document file is complete. [1]"],
    summons_found: (p) => [
      `I found ticket ${p.ticket} in the city's court records. [1]`,
      `Your hearing is on ${p.hearing_date}.`,
      ...(p.status ? [`Current status: ${p.status}.`] : []),
      ...(p.penalty_note ? [`For this kind of charge, recorded penalties have ranged around ${p.penalty_note}.`] : []),
      `Bring your ID and any photos or receipts from that day.`,
      `Data as of ${p.as_of}.`,
    ],
    summons_not_found: (p) => [
      `That ticket number is not in the city's file as of the last data publication (${p.as_of}). [1]`,
      `City inspectors never collect money on the street. [1]`,
      `Every real civil fine goes to an OATH hearing, never to a person's pocket. [1]`,
      `If someone is pressuring you to pay, this looks like a scam.`,
      `You can talk to ${p.referral} — free help, in your language.`,
    ],
    summons_unclear: () => [
      "I could not read the ticket number clearly, and I never guess digits.",
      "Please send a closer photo of the number, or type it.",
    ],
    criminal_instrument: (p) => [
      `This looks like a criminal court summons, not a civil OATH ticket. [1]`,
      `That is a different, more serious document: it needs a court appearance. [1]`,
      `I don't give advice on criminal matters — please contact ${p.referral} right away. [1]`,
    ],
    broker_registered: (p) => [
      `"${p.name}" does appear in the city's business registry. [1]`,
      `Being registered does not mean their offer is legal — no one can legally sell or rent you a permit place in line.`,
      `Data as of ${p.as_of}.`,
    ],
    broker_not_registered: (p) => [
      `"${p.name}" is not in the city's business registry as of the last data publication (${p.as_of}). [1]`,
      `Be careful: paying a stranger to "get you a license faster" is a known scam pattern.`,
      `The real license fee is $50 for two years, paid only to the city. [2]`,
    ],
    broker_price_warning: (p) => [
      `They are asking $${p.asked}. The real city fee is $${p.real} for two years. [1]`,
      `There is no paid fast lane. Anyone selling one is selling a scam.`,
    ],
    cash_logged: (p) => [
      `Logged: $${p.amount} cash sale.`,
      `Your ledger now has ${p.count} records — ${p.a_count} card-verified and ${p.b_count} self-reported.`,
    ],
    letter_explained: (p) => [
      `This letter is from ${p.sender}.`,
      `It is about: ${p.subject}.`,
      ...(p.amount ? [`It mentions an amount of $${p.amount}.`] : []),
      ...(p.deadline ? [`There is a deadline: ${p.deadline}. I have added it to your reminders.`] : []),
      ...(p.next ? [`${p.next}`] : []),
    ],
    placement_partial: () => [
      `I cannot compute the exact legal distances yet — those numbers must come from the city code, and they are not verified in my rulebook. [1]`,
      `Here is the physical checklist to walk through where you stand:`,
    ],
    radar_broadcast: (p) => [
      `Neighborhood alert: ${p.count} vendors near you reported the same scam pattern this week (${p.pattern}).`,
      `Do not pay anyone on the street. Reply STOP to leave these alerts.`,
    ],
    heat_note: () => [
      `Heat advisory today. You have the right to shade, water, and breaks under the June 2026 executive order. [1]`,
      `Cooling sites are open — ask me for the nearest one. A state credit exists for cooling equipment. [1]`,
    ],
    referral_indeterminate: (p) => [
      `The rules I can verify do not decide this question, so I will not guess.`,
      `${p.referral} can help — free, and in your language.`,
    ],
    t2_honesty: (p) => [`Responses in ${p.lang} are automatically translated and not yet reviewed by a person.`],
  },
  es: {
    ask_vending_kind: () => ["¿Vende comida, o mercancía como ropa o accesorios?"],
    track_supervisory_food: () => [
      "Usted aplicaría por la vía de licencia supervisora de comida. [1]",
      "La ciudad emite 2,200 de estas licencias por año hasta 2031. [1]",
    ],
    track_general_2027: () => [
      "Usted aplicaría por la nueva vía de vendedor general. [1]",
      "Cerca de 10,500 licencias nuevas empiezan en 2027. [1]",
    ],
    next_step: (p) => [
      `Su próximo paso es ${p.step_name}. [1]`,
      ...(p.duration ? [`Normalmente toma ${p.duration}. [1]`] : []),
      ...(p.note ? [`${p.note} [1]`] : []),
      ...(p.timeline ? [`En total, el tiempo honesto para presentar es de unos ${p.timeline}.`] : []),
    ],
    fee: (p) => [
      `La licencia cuesta $${p.amount} por ${p.term} años. [1]`,
      "Los veteranos con baja honorable y sus cónyuges o parejas sobrevivientes no pagan esta tarifa. [1]",
      ...(p.waived ? ["Según lo que me dijo, esa exención le aplica a usted. [1]"] : []),
    ],
    docs_missing: (p) => [
      `Su expediente tiene ${p.have} de ${p.need} documentos.`,
      `Todavía falta: ${p.missing_list}. [1]`,
    ],
    docs_complete: () => ["Su expediente de documentos está completo. [1]"],
    summons_found: (p) => [
      `Encontré la multa ${p.ticket} en los registros del tribunal de la ciudad. [1]`,
      `Su audiencia es el ${p.hearing_date}.`,
      ...(p.status ? [`Estado actual: ${p.status}.`] : []),
      ...(p.penalty_note ? [`Para este tipo de cargo, las multas registradas han estado alrededor de ${p.penalty_note}.`] : []),
      "Lleve su identificación y cualquier foto o recibo de ese día.",
      `Datos al ${p.as_of}.`,
    ],
    summons_not_found: (p) => [
      `Ese número de multa no está en el archivo de la ciudad según la última publicación de datos (${p.as_of}). [1]`,
      "Los inspectores de la ciudad nunca cobran dinero en la calle. [1]",
      "Toda multa civil real va a una audiencia de OATH, nunca al bolsillo de una persona. [1]",
      "Si alguien lo está presionando para pagar, esto parece una estafa.",
      `Puede hablar con ${p.referral} — ayuda gratis, en su idioma.`,
    ],
    summons_unclear: () => [
      "No pude leer el número de la multa con claridad, y nunca adivino dígitos.",
      "Por favor mande una foto más cercana del número, o escríbalo.",
    ],
    criminal_instrument: (p) => [
      "Esto parece una citación de corte criminal, no una multa civil de OATH. [1]",
      "Es un documento diferente y más serio: requiere presentarse en corte. [1]",
      `No doy consejos en asuntos criminales — contacte a ${p.referral} de inmediato. [1]`,
    ],
    broker_registered: (p) => [
      `"${p.name}" sí aparece en el registro de negocios de la ciudad. [1]`,
      "Estar registrado no significa que su oferta sea legal — nadie puede venderle ni rentarle legalmente un lugar en la fila de permisos.",
      `Datos al ${p.as_of}.`,
    ],
    broker_not_registered: (p) => [
      `"${p.name}" no está en el registro de negocios de la ciudad según la última publicación de datos (${p.as_of}). [1]`,
      "Cuidado: pagar a un desconocido para \"conseguirle la licencia más rápido\" es un patrón conocido de estafa.",
      "La tarifa real de la licencia es $50 por dos años, pagada solo a la ciudad. [2]",
    ],
    broker_price_warning: (p) => [
      `Le están pidiendo $${p.asked}. La tarifa real de la ciudad es $${p.real} por dos años. [1]`,
      "No existe una vía rápida pagada. Quien venda una, vende una estafa.",
    ],
    cash_logged: (p) => [
      `Registrado: venta en efectivo de $${p.amount}.`,
      `Su libro ahora tiene ${p.count} registros — ${p.a_count} verificados con tarjeta y ${p.b_count} auto-reportados.`,
    ],
    letter_explained: (p) => [
      `Esta carta es de ${p.sender}.`,
      `Trata de: ${p.subject}.`,
      ...(p.amount ? [`Menciona un monto de $${p.amount}.`] : []),
      ...(p.deadline ? [`Hay una fecha límite: ${p.deadline}. La agregué a sus recordatorios.`] : []),
      ...(p.next ? [`${p.next}`] : []),
    ],
    placement_partial: () => [
      "Todavía no puedo calcular las distancias legales exactas — esos números deben venir del código de la ciudad, y no están verificados en mi libro de reglas. [1]",
      "Aquí está la lista física para revisar dónde se para:",
    ],
    radar_broadcast: (p) => [
      `Alerta del barrio: ${p.count} vendedores cerca de usted reportaron el mismo patrón de estafa esta semana (${p.pattern}).`,
      "No le pague a nadie en la calle. Responda ALTO para salir de estas alertas.",
    ],
    heat_note: () => [
      "Aviso de calor hoy. Usted tiene derecho a sombra, agua y descansos bajo la orden ejecutiva de junio de 2026. [1]",
      "Los centros de enfriamiento están abiertos — pregúnteme por el más cercano. Existe un crédito estatal para equipo de enfriamiento. [1]",
    ],
    referral_indeterminate: (p) => [
      "Las reglas que puedo verificar no deciden esta pregunta, así que no voy a adivinar.",
      `${p.referral} puede ayudar — gratis, y en su idioma.`,
    ],
    t2_honesty: (p) => [`Las respuestas en ${p.lang} son traducidas automáticamente y aún no han sido revisadas por una persona.`],
  },
  bn: {
    ask_vending_kind: () => ["আপনি কি খাবার বিক্রি করেন, নাকি কাপড় বা জিনিসপত্রের মতো পণ্য?"],
    track_supervisory_food: () => [
      "আপনি সুপারভাইজরি ফুড-ভেন্ডর লাইসেন্সের পথে আবেদন করবেন। [1]",
      "শহর ২০৩১ সাল পর্যন্ত প্রতি বছর ২,২০০টি এই লাইসেন্স দেয়। [1]",
    ],
    track_general_2027: () => [
      "আপনি নতুন সাধারণ-বিক্রেতা পথে আবেদন করবেন। [1]",
      "২০২৭ সালে প্রায় ১০,৫০০ নতুন লাইসেন্স শুরু হয়। [1]",
    ],
    next_step: (p) => [
      `আপনার পরবর্তী ধাপ: ${p.step_name}। [1]`,
      ...(p.duration ? [`সাধারণত ${p.duration} সময় লাগে। [1]`] : []),
      ...(p.timeline ? [`মোট সময়সীমা প্রায় ${p.timeline}।`] : []),
    ],
    fee: (p) => [
      `লাইসেন্সের ফি $${p.amount}, ${p.term} বছরের জন্য। [1]`,
      "সম্মানজনকভাবে অব্যাহতিপ্রাপ্ত ভেটেরান এবং তাঁদের জীবিত স্বামী/স্ত্রীদের এই ফি দিতে হয় না। [1]",
    ],
    summons_found: (p) => [
      `টিকিট ${p.ticket} শহরের আদালতের রেকর্ডে পাওয়া গেছে। [1]`,
      `আপনার শুনানি ${p.hearing_date} তারিখে।`,
      "সেদিনের ছবি বা রসিদ থাকলে সাথে আনুন।",
      `তথ্য ${p.as_of} পর্যন্ত।`,
    ],
    summons_not_found: (p) => [
      `এই টিকিট নম্বরটি শেষ ডেটা প্রকাশ (${p.as_of}) অনুযায়ী শহরের ফাইলে নেই। [1]`,
      "শহরের পরিদর্শকরা কখনো রাস্তায় টাকা নেন না। [1]",
      "প্রতিটি আসল জরিমানা OATH শুনানিতে যায়। [1]",
      "কেউ টাকা দিতে চাপ দিলে, এটি প্রতারণা হতে পারে।",
      `${p.referral}-এর সাথে কথা বলুন — বিনামূল্যে, আপনার ভাষায়।`,
    ],
    summons_unclear: () => [
      "টিকিট নম্বরটি পরিষ্কারভাবে পড়তে পারিনি, আর আমি কখনো সংখ্যা অনুমান করি না।",
      "দয়া করে নম্বরের আরও কাছের ছবি পাঠান, বা টাইপ করুন।",
    ],
    criminal_instrument: (p) => [
      "এটি ক্রিমিনাল কোর্টের সমন মনে হচ্ছে, সিভিল OATH টিকিট নয়। [1]",
      "এটি ভিন্ন এবং আরও গুরুতর কাগজ: আদালতে যেতে হবে। [1]",
      `আমি ক্রিমিনাল বিষয়ে পরামর্শ দিই না — এখনই ${p.referral}-এর সাথে যোগাযোগ করুন। [1]`,
    ],
    cash_logged: (p) => [
      `লেখা হয়েছে: $${p.amount} নগদ বিক্রি।`,
      `আপনার খাতায় এখন ${p.count}টি রেকর্ড।`,
    ],
    t2_honesty: (p) => [`${p.lang} ভাষার উত্তর স্বয়ংক্রিয়ভাবে অনূদিত এবং এখনো কোনো ব্যক্তি পর্যালোচনা করেননি।`],
  },
  ar: {
    ask_vending_kind: () => ["هل تبيع طعامًا، أم بضائع مثل الملابس أو الإكسسوارات؟"],
    track_supervisory_food: () => [
      "ستتقدم عبر مسار رخصة البائع الغذائي الإشرافية. [1]",
      "تصدر المدينة 2,200 من هذه الرخص سنويًا حتى 2031. [1]",
    ],
    track_general_2027: () => [
      "ستتقدم عبر مسار البائع العام الجديد. [1]",
      "حوالي 10,500 رخصة جديدة تبدأ في 2027. [1]",
    ],
    next_step: (p) => [
      `خطوتك التالية: ${p.step_name}. [1]`,
      ...(p.duration ? [`عادةً تستغرق ${p.duration}. [1]`] : []),
      ...(p.timeline ? [`الجدول الزمني الكامل حوالي ${p.timeline}.`] : []),
    ],
    fee: (p) => [
      `رسوم الرخصة $${p.amount} لمدة ${p.term} سنتين. [1]`,
      "المحاربون القدامى المسرّحون بشرف وأزواجهم الباقون على قيد الحياة معفون من هذه الرسوم. [1]",
    ],
    summons_found: (p) => [
      `وجدت المخالفة ${p.ticket} في سجلات محكمة المدينة. [1]`,
      `جلستك يوم ${p.hearing_date}.`,
      "أحضر هويتك وأي صور أو إيصالات من ذلك اليوم.",
      `البيانات حتى ${p.as_of}.`,
    ],
    summons_not_found: (p) => [
      `رقم المخالفة هذا ليس في ملف المدينة حسب آخر نشر للبيانات (${p.as_of}). [1]`,
      "مفتشو المدينة لا يجمعون المال في الشارع أبدًا. [1]",
      "كل غرامة مدنية حقيقية تذهب إلى جلسة OATH. [1]",
      "إذا كان أحد يضغط عليك للدفع، فهذا يبدو احتيالًا.",
      `يمكنك التحدث مع ${p.referral} — مساعدة مجانية بلغتك.`,
    ],
    summons_unclear: () => [
      "لم أستطع قراءة رقم المخالفة بوضوح، وأنا لا أخمّن الأرقام أبدًا.",
      "أرسل صورة أقرب للرقم من فضلك، أو اكتبه.",
    ],
    criminal_instrument: (p) => [
      "هذه تبدو مذكرة محكمة جنائية، وليست مخالفة OATH مدنية. [1]",
      "هذه وثيقة مختلفة وأكثر خطورة: تتطلب الحضور إلى المحكمة. [1]",
      `لا أقدم نصائح في المسائل الجنائية — اتصل بـ${p.referral} فورًا. [1]`,
    ],
    cash_logged: (p) => [
      `تم التسجيل: بيع نقدي بمبلغ $${p.amount}.`,
      `دفترك الآن يحتوي على ${p.count} سجلًا.`,
    ],
    t2_honesty: (p) => [`الردود بلغة ${p.lang} مترجمة آليًا ولم يراجعها شخص بعد.`],
  },
  zh: {
    ask_vending_kind: () => ["您是卖食品，还是卖服装、饰品等商品？"],
    track_supervisory_food: () => [
      "您将通过监督类食品小贩执照途径申请。 [1]",
      "到2031年，市政府每年发放2,200个此类执照。 [1]",
    ],
    track_general_2027: () => [
      "您将通过新的普通小贩途径申请。 [1]",
      "2027年起约有10,500个新执照。 [1]",
    ],
    next_step: (p) => [
      `您的下一步是${p.step_name}。 [1]`,
      ...(p.duration ? [`通常需要${p.duration}。 [1]`] : []),
      ...(p.timeline ? [`总的诚实时间线约为${p.timeline}。`] : []),
    ],
    fee: (p) => [
      `执照费用为$${p.amount}，有效期${p.term}年。 [1]`,
      "光荣退伍的军人及其在世配偶或伴侣免交此费。 [1]",
    ],
    summons_found: (p) => [
      `在市法院记录中找到了罚单${p.ticket}。 [1]`,
      `您的听证会在${p.hearing_date}。`,
      "请带上证件和当天的任何照片或收据。",
      `数据截至${p.as_of}。`,
    ],
    summons_not_found: (p) => [
      `根据最近一次数据发布（${p.as_of}），该罚单号不在市政府档案中。 [1]`,
      "市检查员绝不会在街上收钱。 [1]",
      "每张真正的民事罚单都会进入OATH听证程序。 [1]",
      "如果有人催您付钱，这很可能是骗局。",
      `您可以联系${p.referral}——免费，有您语言的服务。`,
    ],
    summons_unclear: () => [
      "我无法清楚地读出罚单号码，我从不猜测数字。",
      "请拍一张更近的号码照片，或直接输入号码。",
    ],
    criminal_instrument: (p) => [
      "这看起来是刑事法庭传票，不是民事OATH罚单。 [1]",
      "这是不同且更严重的文件：需要出庭。 [1]",
      `我不提供刑事事务建议——请立即联系${p.referral}。 [1]`,
    ],
    cash_logged: (p) => [
      `已记录：$${p.amount}现金销售。`,
      `您的账本现在有${p.count}条记录。`,
    ],
    t2_honesty: (p) => [`${p.lang}的回复为机器自动翻译，尚未经人工审核。`],
  },
};

export function renderTemplate(
  lang: string,
  key: string,
  params: Record<string, unknown>,
): { sentences: string[]; lang_used: string; lang_fallback: boolean } {
  const l = (["en", "es", "bn", "ar", "zh"].includes(lang) ? lang : "en") as Lang;
  const tmpl = T[l][key] ?? T.en[key];
  if (!tmpl) return { sentences: [`(missing template: ${key})`], lang_used: "en", lang_fallback: true };
  const fellBack = !T[l][key] && l !== "en";
  return { sentences: tmpl(params), lang_used: fellBack ? "en" : l, lang_fallback: fellBack };
}
