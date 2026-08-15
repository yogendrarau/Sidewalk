/** UI copy — T1 languages full; honesty labels per config/lang_tiers.json. */
export const T1 = ["es", "bn", "ar", "zh", "en"] as const;
export const T2 = ["ru", "ht", "ko", "ur", "fr", "pl"] as const;

export const LANG_NAMES: Record<string, string> = {
  es: "Español", bn: "বাংলা", ar: "العربية", zh: "中文", en: "English",
  ru: "Русский", ht: "Kreyòl", ko: "한국어", ur: "اردو", fr: "Français", pl: "Polski",
};

type Strings = Record<string, Record<string, string>>;
const S: Strings = {
  tab_chat: { es: "Hablar", en: "Talk", bn: "কথা", ar: "تحدث", zh: "对话" },
  tab_case: { es: "Mi caso", en: "My case", bn: "আমার কেস", ar: "ملفي", zh: "我的案件" },
  tab_check: { es: "Verificar", en: "Check", bn: "যাচাই", ar: "تحقق", zh: "查验" },
  tab_sales: { es: "Ventas", en: "Sales", bn: "বিক্রয়", ar: "مبيعات", zh: "销售" },
  tab_lang: { es: "Idioma", en: "Language", bn: "ভাষা", ar: "اللغة", zh: "语言" },
  hold_to_talk: { es: "Mantenga para hablar", en: "Hold to talk", bn: "কথা বলতে চেপে ধরুন", ar: "اضغط للتحدث", zh: "按住说话" },
  listening: { es: "Escuchando…", en: "Listening…", bn: "শুনছি…", ar: "أستمع…", zh: "正在听…" },
  type_here: { es: "…o escriba aquí", en: "…or type here", bn: "…অথবা লিখুন", ar: "…أو اكتب هنا", zh: "…或在此输入" },
  thinking: { es: "Sidewalk está revisando las reglas…", en: "Sidewalk is checking the rules…", bn: "নিয়ম দেখা হচ্ছে…", ar: "جارٍ مراجعة القواعد…", zh: "正在核对规则…" },
  photo_doc: { es: "Foto de documento", en: "Document photo", bn: "ডকুমেন্টের ছবি", ar: "صورة مستند", zh: "文件照片" },
  photo_summons: { es: "Foto de multa", en: "Ticket photo", bn: "টিকিটের ছবি", ar: "صورة مخالفة", zh: "罚单照片" },
  photo_letter: { es: "Foto de carta", en: "Letter photo", bn: "চিঠির ছবি", ar: "صورة رسالة", zh: "信件照片" },
  paste_msg: { es: "Pegar mensaje sospechoso", en: "Paste suspicious message", bn: "সন্দেহজনক বার্তা", ar: "الصق رسالة مشبوهة", zh: "粘贴可疑信息" },
  share_loc: { es: "¿Puedo pararme aquí?", en: "Can I stand here?", bn: "এখানে দাঁড়াতে পারি?", ar: "هل أقف هنا؟", zh: "能在这里摆摊吗？" },
  check_title: { es: "Verificar antes de pagar", en: "Check before you pay", bn: "টাকা দেওয়ার আগে যাচাই করুন", ar: "تحقق قبل أن تدفع", zh: "付款前先查验" },
  check_sub: { es: "Multas, cartas y ofertas — contra los registros de la ciudad, en segundos.", en: "Tickets, letters, offers — against the city's own records, in seconds.", bn: "টিকিট, চিঠি, অফার — শহরের রেকর্ডের সাথে, সেকেন্ডে।", ar: "مخالفات ورسائل وعروض — مقابل سجلات المدينة في ثوانٍ.", zh: "罚单、信件、报价——秒级对照市政府记录。" },
  status: { es: "Estado", en: "Status", bn: "অবস্থা", ar: "الحالة", zh: "状态" },
  next_deadline: { es: "Próxima fecha", en: "Next deadline", bn: "পরবর্তী তারিখ", ar: "الموعد التالي", zh: "下一个期限" },
  documents: { es: "Documentos", en: "Documents", bn: "ডকুমেন্ট", ar: "المستندات", zh: "文件" },
  next_step: { es: "Siguiente paso", en: "Next step", bn: "পরবর্তী ধাপ", ar: "الخطوة التالية", zh: "下一步" },
  packet: { es: "Mi expediente", en: "My packet", bn: "আমার প্যাকেট", ar: "ملف التقديم", zh: "申请材料" },
  print_packet: { es: "Imprimir expediente", en: "Print packet", bn: "প্রিন্ট", ar: "طباعة", zh: "打印" },
  my_store: { es: "Mi tienda", en: "My store", bn: "আমার দোকান", ar: "متجري", zh: "我的店铺" },
  create_store: { es: "Crear mi tienda con QR", en: "Create my QR store", bn: "QR দোকান তৈরি করুন", ar: "أنشئ متجري برمز QR", zh: "创建二维码店铺" },
  store_explain: { es: "Una página de pagos con tarjeta y un póster QR. Cada venta con tarjeta se vuelve evidencia grado A para su solicitud.", en: "A card-payment page and a QR poster. Every card sale becomes grade-A evidence for your application.", bn: "কার্ড পেমেন্ট পেজ ও QR পোস্টার। প্রতিটি কার্ড বিক্রি গ্রেড-A প্রমাণ হয়।", ar: "صفحة دفع بالبطاقة وملصق QR. كل بيع بالبطاقة يصبح دليلاً من الدرجة A.", zh: "刷卡支付页面和二维码海报。每笔刷卡销售都成为A级证据。" },
  confirm_store: { es: "Activar pagos requiere su confirmación explícita.", en: "Activating payments requires your explicit confirmation.", bn: "পেমেন্ট চালু করতে আপনার স্পষ্ট সম্মতি লাগবে।", ar: "تفعيل المدفوعات يتطلب تأكيدك الصريح.", zh: "开通收款需要您的明确确认。" },
  confirm: { es: "Confirmar", en: "Confirm", bn: "নিশ্চিত করুন", ar: "تأكيد", zh: "确认" },
  cancel: { es: "Cancelar", en: "Cancel", bn: "বাতিল", ar: "إلغاء", zh: "取消" },
  log_cash: { es: "Anotar venta en efectivo", en: "Log a cash sale", bn: "নগদ বিক্রি লিখুন", ar: "سجّل بيعًا نقديًا", zh: "记录现金销售" },
  evidence: { es: "Evidencia de ventas", en: "Sales evidence", bn: "বিক্রির প্রমাণ", ar: "أدلة المبيعات", zh: "销售证据" },
  card_verified: { es: "con tarjeta (grado A)", en: "card-verified (grade A)", bn: "কার্ড-যাচাইকৃত (A)", ar: "موثّق بالبطاقة (A)", zh: "刷卡核实（A级）" },
  self_reported: { es: "auto-reportada (grado B)", en: "self-reported (grade B)", bn: "স্ব-ঘোষিত (B)", ar: "مُبلّغ ذاتيًا (B)", zh: "自报（B级）" },
  reviewed: { es: "Revisado por personas", en: "Reviewed by people", bn: "মানুষ দ্বারা পর্যালোচিত", ar: "روجع بشريًا", zh: "已人工审核" },
  auto_translated: { es: "Traducción automática — aún no revisada por una persona", en: "Auto-translated — not yet reviewed by a person", bn: "স্বয়ংক্রিয় অনুবাদ — এখনো পর্যালোচিত নয়", ar: "ترجمة آلية — لم تُراجع بعد", zh: "自动翻译——尚未经人工审核" },
  sources: { es: "Fuentes", en: "Sources", bn: "সূত্র", ar: "المصادر", zh: "来源" },
  data_as_of: { es: "Datos de la ciudad al", en: "City data as of", bn: "শহরের তথ্য", ar: "بيانات المدينة حتى", zh: "市政数据截至" },
  onboard_lang: { es: "¿En qué idioma le hablo?", en: "Which language should I speak?", bn: "কোন ভাষায় কথা বলব?", ar: "بأي لغة أتحدث؟", zh: "我该说哪种语言？" },
  onboard_kind: { es: "¿Qué vende?", en: "What do you sell?", bn: "আপনি কী বিক্রি করেন?", ar: "ماذا تبيع؟", zh: "您卖什么？" },
  food: { es: "Comida", en: "Food", bn: "খাবার", ar: "طعام", zh: "食品" },
  merch: { es: "Ropa / mercancía", en: "Clothing / merchandise", bn: "কাপড় / পণ্য", ar: "ملابس / بضائع", zh: "服装/商品" },
  onboard_years: { es: "¿Cuántos años vendiendo?", en: "How many years vending?", bn: "কত বছর ধরে বিক্রি করছেন?", ar: "كم سنة تبيع؟", zh: "摆摊几年了？" },
  onboard_cart: { es: "¿Tiene carrito propio?", en: "Do you have your own cart?", bn: "নিজের গাড়ি আছে?", ar: "هل لديك عربة؟", zh: "有自己的餐车吗？" },
  yes: { es: "Sí", en: "Yes", bn: "হ্যাঁ", ar: "نعم", zh: "有" },
  no: { es: "No", en: "No", bn: "না", ar: "لا", zh: "没有" },
  onboard_docs: { es: "¿Qué documentos tiene a mano?", en: "Which documents do you have on hand?", bn: "কোন ডকুমেন্ট আছে?", ar: "ما المستندات المتوفرة؟", zh: "手头有哪些文件？" },
  doc_id: { es: "Pasaporte o ID", en: "Passport or ID", bn: "পাসপোর্ট বা আইডি", ar: "جواز أو هوية", zh: "护照或身份证" },
  doc_addr: { es: "Comprobante de domicilio", en: "Proof of address", bn: "ঠিকানার প্রমাণ", ar: "إثبات عنوان", zh: "地址证明" },
  doc_tax: { es: "Certificado de impuestos", en: "Tax certificate", bn: "ট্যাক্স সার্টিফিকেট", ar: "شهادة ضرائب", zh: "税务证书" },
  none_yet: { es: "Ninguno todavía", en: "None yet", bn: "এখনো নেই", ar: "لا شيء بعد", zh: "还没有" },
  onboard_borough: { es: "¿En qué condado vende?", en: "Which borough do you vend in?", bn: "কোন বরোতে বিক্রি করেন?", ar: "في أي حي تبيع؟", zh: "在哪个区摆摊？" },
  start: { es: "Empezar", en: "Start", bn: "শুরু", ar: "ابدأ", zh: "开始" },
  welcome_title: { es: "Sidewalk", en: "Sidewalk", bn: "Sidewalk", ar: "Sidewalk", zh: "Sidewalk" },
  welcome_sub: { es: "Su trabajador de caso para la licencia de vendedor — con citas legales, en su idioma, con voz.", en: "Your caseworker for the vendor license — legally cited, in your language, by voice.", bn: "লাইসেন্সের জন্য আপনার কেসওয়ার্কার — আইনি উদ্ধৃতিসহ, আপনার ভাষায়, কণ্ঠে।", ar: "مرشد حالتك لرخصة البائع — بمراجع قانونية وبلغتك وبالصوت.", zh: "您的执照申请个案助理——附法律引用、用您的语言、可语音交流。" },
  tap_mic_hint: { es: "Toque el micrófono y pregunte: “¿Puedo obtener una licencia si vendo comida?”", en: "Hold the mic and ask: “Can I get a license if I sell food?”", bn: "মাইক ধরে জিজ্ঞাসা করুন", ar: "اضغط الميكروفون واسأل", zh: "按住麦克风提问" },
};

export function t(key: string, lang: string): string {
  return S[key]?.[lang] ?? S[key]?.en ?? key;
}
export const isT1 = (l: string) => (T1 as readonly string[]).includes(l);
export const isT2 = (l: string) => (T2 as readonly string[]).includes(l);
