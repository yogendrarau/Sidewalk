/** Buyer account: order history for this device's buyer ref. Ported concept from the
 * marketplace prototype's buyer workspace — here it's populated by real orders. */
import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { navigate } from "../../App";
import { buyerId, buyerName, setBuyerName } from "./buyer";

type BuyerOrder = {
  order_number: string; total: number; currency: string; fulfillment: string;
  placed_at: string; pickup_code?: string; token: string;
  store: { public_name: string; slug: string } | null;
};

const CHIP: Record<string, string> = {
  new: "bg-amber-100 text-amber-900", accepted: "bg-sky-100 text-sky-800",
  ready: "bg-emerald-100 text-emerald-800", picked_up: "bg-stone-100 text-stone-500",
  cancelled: "bg-red-100 text-red-700",
};

export default function MyOrders() {
  const lang = (navigator.language || "en").slice(0, 2);
  const [orders, setOrders] = useState<BuyerOrder[] | null>(null);
  const [name, setName] = useState(buyerName());

  useEffect(() => {
    void fetch(`/api/buyer/orders?buyer=${buyerId()}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; orders: BuyerOrder[] }) => setOrders(d.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-forest px-5 pb-6 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-3xl">🧾</p>
          <h1 className="mt-1 text-3xl font-black">{t("s_my_orders", lang)}</h1>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setBuyerName(e.target.value); }}
              placeholder={t("s_your_name", lang)}
              className="w-full max-w-56 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold placeholder-white/50 outline-none focus:bg-white/25"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {orders === null && [28, 28].map((h, i) => (
          <div key={i} className="animate-pulse rounded-3xl bg-stone-200/70" style={{ height: h * 4 }} />
        ))}

        {orders?.length === 0 && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <p className="text-5xl">🧺</p>
            <p className="mt-3 font-bold text-stone-500">{t("s_no_orders_yet", lang)}</p>
            <button onClick={() => navigate("/discover")}
              className="mt-4 rounded-full bg-forest px-6 py-3 font-bold text-white active:scale-95">
              {t("s_discover", lang)} →
            </button>
          </div>
        )}

        {orders?.map((o) => (
          <button key={o.token} onClick={() => navigate(`/order/${o.token}`)}
            className="flex w-full items-center justify-between rounded-3xl bg-white p-4 text-start shadow-sm active:scale-[0.99]">
            <div className="min-w-0">
              <p className="truncate font-bold">{o.store?.public_name ?? "—"}</p>
              <p className="text-lg font-black text-forest">{o.order_number} · ${Number(o.total).toFixed(2)}</p>
              <p className="text-xs text-stone-400">{String(o.placed_at).slice(0, 16).replace("T", " · ")}</p>
            </div>
            <span className={`ms-3 shrink-0 rounded-full px-3 py-1 text-xs font-bold ${CHIP[o.fulfillment] ?? "bg-stone-100"}`}>
              {o.fulfillment.replace(/_/g, " ")}
            </span>
          </button>
        ))}
      </main>
    </div>
  );
}
