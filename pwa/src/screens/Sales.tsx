/** My Sales (§10 screen 4): QR, payment link, graded evidence summary, voice cash-log button. */
import { useEffect, useState } from "react";
import { api, sendInbound } from "../api";
import { t } from "../i18n";
import { asrSupported, startListening, speak } from "../speech";

type SalesData = {
  ok: boolean;
  storefront: { payment_link_url: string; qr_url: string } | null;
  evidence: { total: number; a_count: number; b_count: number; sum: number; recent: Array<{ kind: string; amount: number; at: string; grade: string }> };
};

export default function Sales({ lang }: { lang: string }) {
  const [data, setData] = useState<SalesData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => void api<SalesData>("/api/sales").then(setData);
  useEffect(refresh, []);

  const createStore = async () => {
    setBusy(true);
    const res = await api<{ ok: boolean }>("/api/storefront", { confirm: true, products: [
      { title: "Plato del día / Daily plate", price_usd: 12 },
      { title: "Agua fresca", price_usd: 3 },
    ]});
    setBusy(false);
    setConfirming(false);
    if (res.ok) refresh();
  };

  const voiceLog = () => {
    if (!asrSupported()) return;
    setListening(true);
    startListening(lang, async (text) => {
      setListening(false);
      setBusy(true);
      const res = await sendInbound({ kind: "text", text: `vendí en efectivo ${text}` });
      setBusy(false);
      if (res.ok) {
        setToast(res.data.reply.text.replace(/\[\d+\]/g, ""));
        speak(res.data.reply.sentences, lang);
        refresh();
        setTimeout(() => setToast(null), 6000);
      }
    }, () => setListening(false));
  };

  if (!data) return <p className="p-8 text-center text-stone-400">⏳</p>;

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <h1 className="text-2xl font-black text-forest">🧾 {t("tab_sales", lang)}</h1>

      {!data.storefront ? (
        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-4xl">🏪</p>
          <h2 className="mt-1 text-lg font-extrabold">{t("my_store", lang)}</h2>
          <p className="mt-1 text-sm text-stone-500">{t("store_explain", lang)}</p>
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="mt-4 w-full rounded-2xl bg-forest py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98]">
              {t("create_store", lang)}
            </button>
          ) : (
            <div className="mt-4 rounded-2xl border-2 border-mango bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">✋ {t("confirm_store", lang)}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setConfirming(false)} className="flex-1 rounded-xl border-2 border-stone-300 py-3 font-bold">{t("cancel", lang)}</button>
                <button onClick={() => void createStore()} disabled={busy}
                  className="flex-1 rounded-xl bg-mango py-3 font-bold text-white active:scale-95">{busy ? "…" : `✓ ${t("confirm", lang)}`}</button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-3xl bg-white p-5 text-center shadow-sm">
          <h2 className="text-lg font-extrabold">🏪 {t("my_store", lang)}</h2>
          <img src={data.storefront.qr_url} alt="QR" className="mx-auto mt-2 w-52 rounded-2xl border-4 border-forest" />
          <a href={data.storefront.payment_link_url} target="_blank" rel="noreferrer"
            className="mt-2 block truncate text-sm font-semibold text-leaf underline">{data.storefront.payment_link_url}</a>
          <p className="mt-1 text-[11px] text-stone-400">💳 → grade A</p>
        </section>
      )}

      <section className="rounded-3xl bg-forest p-5 text-white shadow-lg">
        <p className="text-xs uppercase tracking-wide opacity-70">{t("evidence", lang)}</p>
        <p className="text-3xl font-black">${data.evidence.sum.toFixed(0)}</p>
        <div className="mt-2 flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-400/30 px-3 py-1">A × {data.evidence.a_count} · {t("card_verified", lang)}</span>
          <span className="rounded-full bg-amber-400/30 px-3 py-1">B × {data.evidence.b_count} · {t("self_reported", lang)}</span>
        </div>
      </section>

      <button onClick={voiceLog}
        className={`w-full rounded-3xl py-5 text-lg font-black text-white shadow-lg transition active:scale-[0.98] ${listening ? "recording bg-chili" : "bg-mango"}`}>
        🎤 {listening ? t("listening", lang) : t("log_cash", lang)}
      </button>
      {toast && <p className="msg-in rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">✓ {toast}</p>}

      {data.evidence.recent.length > 0 && (
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <ul className="divide-y divide-stone-100 text-sm">
            {data.evidence.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>{r.grade === "A_card_verified" ? "💳" : "💵"} ${Number(r.amount).toFixed(2)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.grade === "A_card_verified" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {r.grade === "A_card_verified" ? "A" : "B"}
                </span>
                <span className="text-xs text-stone-400">{String(r.at).slice(5, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
