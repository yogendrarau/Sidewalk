/**
 * Discover /discover (§10.3): opt-in catalog search for nearby open vendors and items.
 * Anonymous, sanitized projections only. Not a delivery marketplace.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import { navigate } from "../../App";
import { pickShopperLang, pubTitle, type PubItem, type PubStorefront } from "./Shop";

type Card = PubStorefront & { items: PubItem[] };

export default function Discover() {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<Card[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (query: string) => {
    void fetch(`/api/discover?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; data?: { storefronts: Card[] } }) => setCards(d.ok ? (d.data?.storefronts ?? []) : []))
      .catch(() => setCards([]));
  };

  useEffect(() => { search(""); }, []);
  const onType = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 250);
  };

  const lang = useMemo(() => pickShopperLang(cards?.flatMap((c) => c.items) ?? []), [cards]);
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="min-h-dvh bg-cream" dir={dir}>
      <header className="bg-forest px-5 pb-5 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <h1 className="text-3xl font-black">🧺 {t("s_discover", lang)}</h1>
          <input
            value={q}
            onChange={(e) => onType(e.target.value)}
            placeholder={t("s_search", lang)}
            className="mt-3 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[15px] text-ink outline-none"
          />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-4 py-4">
        {cards === null && [32, 32].map((h, i) => <div key={i} className="animate-pulse rounded-3xl bg-stone-200/70" style={{ height: h * 4 }} />)}
        {cards?.length === 0 && (
          <p className="rounded-3xl border-2 border-dashed border-stone-300 p-8 text-center font-bold text-stone-400">{t("s_no_results", lang)}</p>
        )}
        {cards?.map((c) => (
          <button
            key={c.slug}
            onClick={() => navigate(`/shop/${c.slug}`)}
            className="block w-full rounded-3xl bg-white p-4 text-start shadow-sm transition active:scale-[0.98]"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-lg font-extrabold">{c.category === "food" ? "🌮" : "🛍️"} {c.public_name}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                c.open_state === "open" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
              }`}>
                {c.open_state === "open" ? `● ${t("s_open", lang)}` : `○ ${t("s_closed", lang)}`}
              </span>
            </div>
            {c.public_nta && <p className="text-xs text-stone-400">📍 {c.public_nta}</p>}
            {c.items.length > 0 && (
              <p className="mt-1 truncate text-sm text-stone-500">
                {c.items.slice(0, 3).map((i) => `${pubTitle(i, lang)} $${Number(i.price).toFixed(2)}`).join(" · ")}
              </p>
            )}
            <p className="mt-2 text-sm font-bold text-leaf">{t("s_view_store", lang)} →</p>
          </button>
        ))}
      </main>
    </div>
  );
}
