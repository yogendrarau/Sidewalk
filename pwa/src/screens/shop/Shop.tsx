/**
 * Shopper storefront /shop/:slug (§10.3): anonymous, sanitized projection only, styled like a
 * clean market stall. Detected-language catalog, cart, checkout in ≤45s cold — no signup, no PII.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { t } from "../../i18n";
import { navigate } from "../../App";
import { buyerId } from "./buyer";

export type PubItem = {
  id: string;
  title_by_lang: Record<string, string>;
  description_by_lang?: Record<string, string> | null;
  price: number;
  currency: string;
  image_url?: string | null;
  availability: string;
  sort_order: number;
};
export type PubStorefront = {
  slug: string; public_name: string; langs?: string[]; category?: string;
  open_state: string; pickup_note?: string | null; public_nta?: string | null;
};
type ShopData = { ok: boolean; storefront: PubStorefront | null; items: PubItem[] };
type Placed = { order_token: string; order_number: string; pickup_code: string; total: number; currency: string };

export function pickShopperLang(items: PubItem[]): string {
  const nav2 = (navigator.language || "en").slice(0, 2).toLowerCase();
  const avail = new Set(items.flatMap((i) => Object.keys(i.title_by_lang ?? {})));
  if (avail.has(nav2)) return nav2;
  if (avail.has("en")) return "en";
  return [...avail][0] ?? "en";
}
export const pubTitle = (i: PubItem, lang: string) =>
  i.title_by_lang?.[lang] ?? i.title_by_lang?.en ?? Object.values(i.title_by_lang ?? {})[0] ?? "—";

export default function Shop({ slug }: { slug: string }) {
  const [data, setData] = useState<ShopData | null>(null);
  const [missing, setMissing] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);

  useEffect(() => {
    void fetch(`/api/shop/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ShopData) => setData(d))
      .catch(() => setMissing(true));
  }, [slug]);

  const lang = useMemo(() => pickShopperLang(data?.items ?? []), [data]);
  const dir = lang === "ar" ? "rtl" : "ltr";

  if (missing || (data && !data.storefront)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream p-8 text-center" dir={dir}>
        <div>
          <p className="text-5xl">🧺</p>
          <p className="mt-3 font-bold text-stone-500">{t("s_no_results", lang)}</p>
          <button onClick={() => navigate("/discover")} className="mt-4 rounded-full bg-forest px-6 py-3 font-bold text-white">
            {t("s_discover", lang)} →
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md space-y-4 bg-cream p-4 pt-8">
        {[36, 28, 28].map((h, i) => <div key={i} className="animate-pulse rounded-3xl bg-stone-200/70" style={{ height: h * 4 }} />)}
      </div>
    );
  }

  const sf = data.storefront!;
  const isOpen = sf.open_state === "open";
  const count = Object.values(cart).reduce((s, q) => s + q, 0);
  const total = data.items.reduce((s, i) => s + (cart[i.id] ?? 0) * Number(i.price), 0);

  // ---- order placed: BIG pickup code (§10.3)
  if (placed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream p-6" dir={dir}>
        <div className="msg-in w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-xl">
          <p className="text-5xl">✅</p>
          <h1 className="mt-2 text-2xl font-black text-forest">{t("s_order_placed", lang)}</h1>
          <p className="mt-1 text-sm text-stone-500">{sf.public_name} · {placed.order_number} · ${placed.total.toFixed(2)}</p>
          <div className="mt-5 rounded-3xl bg-forest py-6 text-white">
            <p className="text-xs font-bold uppercase opacity-70">{t("s_show_code", lang)}</p>
            <p className="mt-1 font-mono text-6xl font-black tracking-widest">{placed.pickup_code}</p>
          </div>
          {sf.pickup_note && <p className="mt-3 text-sm text-stone-500">📍 {sf.pickup_note}</p>}
          <button onClick={() => navigate(`/order/${placed.order_token}`)}
            className="mt-5 w-full rounded-2xl bg-mango py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98]">
            {t("s_track", lang)} →
          </button>
          <button onClick={() => navigate("/orders")} className="mt-3 text-sm font-bold text-stone-400 active:opacity-70">
            🧾 {t("s_my_orders", lang)}
          </button>
        </div>
      </div>
    );
  }

  const checkout = async () => {
    setBusy(true);
    try {
      const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty }));
      const res = await api<{ ok: boolean; data: (Placed & { mode: string; checkout_url?: string }) }>(
        `/api/shop/${slug}/checkout`, { items: lines, lang, buyer_ref: buyerId() });
      if (res.ok && res.data.mode === "shopify" && res.data.checkout_url) {
        window.location.href = res.data.checkout_url; // Shopify-hosted checkout (invariant 14)
      } else if (res.ok) {
        setPlaced(res.data);
        setCart({});
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-cream" dir={dir}>
      {/* market-stall header */}
      <header className="bg-forest px-5 pb-6 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-start justify-between">
            <p className="text-3xl">🧺</p>
            <button onClick={() => navigate("/orders")} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold active:scale-95">
              🧾 {t("s_my_orders", lang)}
            </button>
          </div>
          <h1 className="mt-1 text-3xl font-black leading-tight">{sf.public_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-3 py-1 font-bold ${isOpen ? "bg-emerald-400/30" : "bg-white/20"}`}>
              {isOpen ? `● ${t("s_open", lang)}` : `○ ${t("s_closed", lang)}`}
            </span>
            {sf.public_nta && <span className="rounded-full bg-white/15 px-3 py-1">📍 {sf.public_nta}</span>}
          </div>
          {sf.pickup_note && <p className="mt-2 text-sm opacity-90">🛍️ {t("s_pickup", lang)}: {sf.pickup_note}</p>}
        </div>
      </header>

      {!isOpen && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <p className="rounded-3xl bg-white p-5 text-center font-bold text-stone-500 shadow-sm">🌙 {t("s_closed_msg", lang)}</p>
        </div>
      )}

      {/* catalog */}
      <main className="mx-auto max-w-md space-y-3 px-4 py-4 pb-32">
        {data.items.map((i) => {
          const soldOut = i.availability !== "available";
          const qty = cart[i.id] ?? 0;
          return (
            <div key={i.id} className={`flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ${soldOut ? "opacity-60" : ""}`}>
              {i.image_url && (
                <img src={i.image_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold">{pubTitle(i, lang)}</p>
                {i.description_by_lang?.[lang] && <p className="truncate text-xs text-stone-400">{i.description_by_lang[lang]}</p>}
                <p className="mt-0.5 text-2xl font-black text-forest">${Number(i.price).toFixed(2)}</p>
              </div>
              {soldOut ? (
                <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-500">{t("avail_sold_out", lang)}</span>
              ) : isOpen ? (
                qty === 0 ? (
                  <button onClick={() => setCart((c) => ({ ...c, [i.id]: 1 }))}
                    className="shrink-0 rounded-full bg-mango px-5 py-3 font-bold text-white shadow active:scale-95">
                    + {t("s_add", lang)}
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-2 rounded-full bg-stone-100 px-2 py-1.5">
                    <button onClick={() => setCart((c) => ({ ...c, [i.id]: Math.max(0, qty - 1) }))}
                      aria-label="−" className="grid h-9 w-9 place-items-center rounded-full bg-white text-lg font-black shadow-sm active:scale-95">−</button>
                    <span className="w-5 text-center text-lg font-black">{qty}</span>
                    <button onClick={() => setCart((c) => ({ ...c, [i.id]: qty + 1 }))}
                      aria-label="+" className="grid h-9 w-9 place-items-center rounded-full bg-forest text-lg font-black text-white shadow-sm active:scale-95">+</button>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
        {data.items.length === 0 && (
          <p className="rounded-3xl border-2 border-dashed border-stone-300 p-8 text-center text-stone-400">🧺</p>
        )}
      </main>

      {/* cart bar */}
      {isOpen && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-white/95 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur">
          <button onClick={() => void checkout()} disabled={busy}
            className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-forest px-5 py-4 text-white shadow-lg active:scale-[0.98]">
            <span className="font-bold">🛒 {count}</span>
            <span className="text-lg font-black">{busy ? "…" : `${t("s_checkout", lang)} · $${total.toFixed(2)}`}</span>
            <span className="text-xl">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
