/** Language (§10 screen 5): tier picker with honesty labels — never a silent downgrade. */
import { setLang } from "../api";
import { t, T1, T2, LANG_NAMES } from "../i18n";

export default function Language({ lang, onChange }: { lang: string; onChange: (l: string) => void }) {
  const pick = (l: string) => { setLang(l); onChange(l); };
  const Row = ({ l, tier }: { l: string; tier: 1 | 2 }) => (
    <button onClick={() => pick(l)}
      className={`flex w-full items-center justify-between rounded-2xl border-2 px-5 py-4 text-left shadow-sm transition active:scale-[0.98] ${
        lang === l ? "border-leaf bg-leaf text-white" : "border-stone-200 bg-white"
      }`}>
      <span className="text-lg font-bold">{LANG_NAMES[l]}</span>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
        tier === 1 ? (lang === l ? "bg-white/20" : "bg-emerald-100 text-emerald-800") : (lang === l ? "bg-white/20" : "bg-amber-100 text-amber-800")
      }`}>
        {tier === 1 ? `✓ ${t("reviewed", lang)}` : `🤖 ${t("auto_translated", lang)}`}
      </span>
    </button>
  );

  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-5">
      <h1 className="text-2xl font-black text-forest">🌐 {t("tab_lang", lang)}</h1>
      <p className="text-xs font-bold uppercase text-stone-400">Tier 1</p>
      {T1.map((l) => <Row key={l} l={l} tier={1} />)}
      <p className="pt-2 text-xs font-bold uppercase text-stone-400">Tier 2</p>
      {T2.map((l) => <Row key={l} l={l} tier={2} />)}
      <p className="rounded-2xl bg-stone-100 p-3 text-[11px] leading-relaxed text-stone-500">
        Tier 3: ~100 more languages, best effort, always labeled — never silently downgraded.
      </p>
    </div>
  );
}
