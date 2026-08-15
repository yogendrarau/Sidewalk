/**
 * Shopper order page /order/:token (§10.3): the secret token IS the authorization.
 * Status timeline new→accepted→ready→picked_up with realtime updates and the pickup code.
 */
import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n";
import { navigate } from "../../App";

type PubOrder = {
  order_number: string; items: Array<{ title: string; qty: number; unit_price: number }>;
  total: number; currency: string; fulfillment: string; placed_at: string; pickup_code?: string;
};
type PubStorefront = { slug?: string; public_name?: string; open_state?: string; pickup_note?: string | null };
type OrderData = { ok: boolean; order: PubOrder; storefront: PubStorefront | null };

const STEPS = ["new", "accepted", "ready", "picked_up"] as const;

export default function OrderTrack({ token }: { token: string }) {
  const [data, setData] = useState<OrderData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void fetch(`/api/order/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: OrderData) => setData(d))
      .catch(() => setMissing(true));
  }, [token]);

  // realtime: `accepted` and `ready` appear without refresh (§10.3)
  useEffect(() => {
    const es = new EventSource(`/api/events?order=${token}`);
    const h = (e: Event) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { fulfillment?: string };
        if (d.fulfillment) setData((prev) => (prev ? { ...prev, order: { ...prev.order, fulfillment: d.fulfillment! } } : prev));
      } catch { /* keep last known state */ }
    };
    es.addEventListener("order_status", h);
    return () => { es.removeEventListener("order_status", h); es.close(); };
  }, [token]);

  const lang = useMemo(() => {
    const nav2 = (navigator.language || "en").slice(0, 2).toLowerCase();
    return ["es", "en", "bn", "ar", "zh"].includes(nav2) ? nav2 : "en";
  }, []);
  const dir = lang === "ar" ? "rtl" : "ltr";

  if (missing) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream p-8 text-center" dir={dir}>
        <div>
          <p className="text-5xl">🔎</p>
          <p className="mt-3 font-bold text-stone-500">{t("s_no_results", lang)}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md space-y-4 bg-cream p-4 pt-8">
        {[40, 30].map((h, i) => <div key={i} className="animate-pulse rounded-3xl bg-stone-200/70" style={{ height: h * 4 }} />)}
      </div>
    );
  }

  const o = data.order;
  const cancelled = o.fulfillment === "cancelled";
  const stepIdx = STEPS.indexOf(o.fulfillment as (typeof STEPS)[number]);
  const stepLabel: Record<string, string> = {
    new: t("s_status_new", lang), accepted: t("s_status_accepted", lang),
    ready: t("s_status_ready", lang), picked_up: t("s_status_picked_up", lang),
  };

  return (
    <div className="min-h-dvh bg-cream" dir={dir}>
      <header className="bg-forest px-5 pb-5 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-bold uppercase opacity-70">{t("s_order", lang)}</p>
          <h1 className="text-2xl font-black">{o.order_number} · ${Number(o.total).toFixed(2)}</h1>
          {data.storefront?.public_name && (
            <button onClick={() => data.storefront?.slug && navigate(`/shop/${data.storefront.slug}`)} className="mt-1 text-sm underline opacity-90">
              🧺 {data.storefront.public_name}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        {cancelled ? (
          <p className="rounded-3xl bg-white p-6 text-center text-lg font-bold text-stone-500 shadow-sm">✕ {t("s_status_cancelled", lang)}</p>
        ) : (
          <>
            {/* timeline */}
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <ul className="space-y-0">
                {STEPS.map((s, i) => {
                  const done = i < stepIdx;
                  const current = i === stepIdx;
                  return (
                    <li key={s} className="flex items-stretch gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${
                          done ? "bg-leaf text-white" : current ? "recording bg-mango text-white" : "bg-stone-100 text-stone-400"
                        }`}>
                          {done ? "✓" : i + 1}
                        </span>
                        {i < STEPS.length - 1 && <span className={`w-1 flex-1 rounded ${i < stepIdx ? "bg-leaf" : "bg-stone-100"}`} />}
                      </div>
                      <p className={`pb-6 pt-1.5 text-[16px] ${current ? "font-black text-forest" : done ? "font-semibold" : "text-stone-400"}`}>
                        {stepLabel[s]}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* pickup code */}
            {o.pickup_code && o.fulfillment !== "picked_up" && (
              <section className="rounded-3xl bg-forest py-6 text-center text-white shadow-lg">
                <p className="text-xs font-bold uppercase opacity-70">{t("s_show_code", lang)}</p>
                <p className="mt-1 font-mono text-6xl font-black tracking-widest">{o.pickup_code}</p>
              </section>
            )}
          </>
        )}

        {/* items */}
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <ul className="divide-y divide-stone-100 text-sm">
            {o.items.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="font-semibold">{l.qty}× {l.title}</span>
                <span className="font-black text-forest">${(Number(l.unit_price) * l.qty).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-stone-100 pt-2 text-end text-lg font-black">
            {t("s_total", lang)}: ${Number(o.total).toFixed(2)}
          </p>
          {data.storefront?.pickup_note && <p className="mt-2 text-sm text-stone-500">📍 {data.storefront.pickup_note}</p>}
        </section>
      </main>
    </div>
  );
}
