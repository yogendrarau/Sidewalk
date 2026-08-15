/** Six-question screener + "launch your store now?" (§10.1) → track + checklist + useful first result. */
import { useState } from "react";
import { api, setLang, getLang } from "../api";
import { t, LANG_NAMES, T1, T2 } from "../i18n";
import { speak } from "../speech";

const Btn = ({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) => (
  <button
    onClick={onClick}
    className={`w-full rounded-2xl border-2 px-5 py-4 text-left text-lg font-semibold shadow-sm transition active:scale-[0.98] ${
      active ? "border-leaf bg-leaf text-white" : "border-stone-200 bg-white text-ink"
    }`}
  >
    {children}
  </button>
);

export default function Onboard({ onDone }: { onDone: (firstQuestion: string, launchStore: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [lang, setL] = useState(getLang());
  const [kind, setKind] = useState<"food" | "merchandise" | null>(null);
  const [years, setYears] = useState<string | null>(null);
  const [cart, setCart] = useState<string | null>(null);
  const [docs, setDocs] = useState<string[]>([]);
  const [borough, setBorough] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const next = () => setStep((s) => s + 1);

  const finish = async (launchStore: boolean) => {
    setBusy(true);
    await api("/api/onboard", {
      lang, vending_kind: kind ?? "food", years_vending: years, cart_status: cart,
      documents_on_hand: docs, borough, display_name: "", radar_opt_in: true,
      launch_store_now: launchStore,
    });
    const greeting: Record<string, string> = {
      es: "Hola. Soy Sidewalk, su trabajador de caso. Pregúnteme lo que quiera — hablando o escribiendo.",
      en: "Hi. I'm Sidewalk, your caseworker. Ask me anything — talk or type.",
      bn: "নমস্কার। আমি Sidewalk, আপনার কেসওয়ার্কার।", ar: "مرحبًا. أنا Sidewalk، مرشد حالتك.", zh: "您好，我是Sidewalk，您的个案助理。",
    };
    speak([greeting[lang] ?? greeting.en], lang);
    const firstQ: Record<string, string> = {
      es: "¿Puedo obtener una licencia si vendo comida?",
      en: "Can I get a license if I sell food?",
      bn: "খাবার বিক্রি করলে কি লাইসেন্স পেতে পারি?",
      ar: "هل أستطيع الحصول على رخصة إذا كنت أبيع الطعام؟",
      zh: "我卖食品能拿到执照吗？",
    };
    onDone(kind === "merchandise" ? "" : firstQ[lang] ?? firstQ.es, launchStore);
  };

  const steps: React.ReactNode[] = [
    // 0 — language
    <div key="l" className="space-y-3">
      <h2 className="text-2xl font-extrabold">🌐 {t("onboard_lang", lang)}</h2>
      {T1.map((l) => (
        <Btn key={l} active={lang === l} onClick={() => { setL(l); setLang(l); }}>
          {LANG_NAMES[l]} <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">✓ {t("reviewed", l)}</span>
        </Btn>
      ))}
      <details className="pt-1 text-sm text-stone-500">
        <summary className="cursor-pointer font-semibold">+ {T2.map((l) => LANG_NAMES[l]).join(" · ")}</summary>
        <div className="mt-2 space-y-2">
          {T2.map((l) => (
            <Btn key={l} active={lang === l} onClick={() => { setL(l); setLang(l); }}>
              {LANG_NAMES[l]} <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">{t("auto_translated", lang)}</span>
            </Btn>
          ))}
        </div>
      </details>
      <button onClick={next} className="mt-3 w-full rounded-2xl bg-forest px-5 py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98]">
        {t("start", lang)} →
      </button>
    </div>,
    // 1 — what do you sell
    <div key="k" className="space-y-3">
      <h2 className="text-2xl font-extrabold">🛒 {t("onboard_kind", lang)}</h2>
      <Btn active={kind === "food"} onClick={() => { setKind("food"); next(); }}>🌮 {t("food", lang)}</Btn>
      <Btn active={kind === "merchandise"} onClick={() => { setKind("merchandise"); next(); }}>👕 {t("merch", lang)}</Btn>
    </div>,
    // 2 — years
    <div key="y" className="space-y-3">
      <h2 className="text-2xl font-extrabold">📅 {t("onboard_years", lang)}</h2>
      {["<1", "1–5", "5–15", "15+"].map((y) => (
        <Btn key={y} active={years === y} onClick={() => { setYears(y); next(); }}>{y}</Btn>
      ))}
    </div>,
    // 3 — cart
    <div key="c" className="space-y-3">
      <h2 className="text-2xl font-extrabold">🛺 {t("onboard_cart", lang)}</h2>
      <Btn active={cart === "own"} onClick={() => { setCart("own"); next(); }}>✅ {t("yes", lang)}</Btn>
      <Btn active={cart === "none"} onClick={() => { setCart("none"); next(); }}>❌ {t("no", lang)}</Btn>
    </div>,
    // 4 — documents on hand
    <div key="d" className="space-y-3">
      <h2 className="text-2xl font-extrabold">🗂️ {t("onboard_docs", lang)}</h2>
      {[
        ["identity_document", `🪪 ${t("doc_id", lang)}`],
        ["proof_of_address", `🏠 ${t("doc_addr", lang)}`],
        ["nys_sales_tax_certificate", `🧾 ${t("doc_tax", lang)}`],
      ].map(([id, label]) => (
        <Btn key={id} active={docs.includes(id)} onClick={() => setDocs((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))}>
          {label} {docs.includes(id) ? "✓" : ""}
        </Btn>
      ))}
      <button onClick={next} className="mt-2 w-full rounded-2xl bg-forest px-5 py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98]">
        {docs.length ? "→" : t("none_yet", lang) + " →"}
      </button>
    </div>,
    // 5 — borough
    <div key="b" className="space-y-3">
      <h2 className="text-2xl font-extrabold">🗽 {t("onboard_borough", lang)}</h2>
      {["Queens", "Brooklyn", "Manhattan", "Bronx", "Staten Island"].map((b) => (
        <Btn key={b} active={borough === b} onClick={() => { setBorough(b); next(); }}>{b}</Btn>
      ))}
    </div>,
    // 6 — launch a store now? (§10.1 — ends with a useful result, never a generic dashboard)
    <div key="s" className="space-y-3">
      <h2 className="text-2xl font-extrabold">🏪 {t("onboard_launch", lang)}</h2>
      <p className="text-sm text-stone-500">{t("store_explain", lang)}</p>
      <Btn onClick={() => void finish(true)}>🚀 {t("launch_yes", lang)}</Btn>
      <Btn onClick={() => void finish(false)}>🕐 {t("launch_later", lang)}</Btn>
    </div>,
  ];

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-cream" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="px-6 pb-2 pt-10 text-center">
        <div className="mx-auto mb-3 h-16 w-16"><img src="/icon.svg" alt="" /></div>
        <h1 className="text-3xl font-black tracking-tight text-forest">{t("welcome_title", lang)}</h1>
        <p className="mt-1 text-sm text-stone-600">{t("welcome_sub", lang)}</p>
      </header>
      <div className="mx-6 mb-1 h-1.5 shrink-0 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-mango transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">{busy ? <p className="animate-pulse pt-8 text-center text-lg">⏳</p> : steps[step]}</div>
    </div>
  );
}
