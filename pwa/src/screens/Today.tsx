/**
 * Today (§10.1 #1, default route): greeting, store open/closed control, ONE primary next
 * action, urgent deadline, latest order, compact progress ring. Never a feed.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { navigate } from "../App";
import { STEP_LABEL, lbl } from "./MyCase";

type StoreData = {
  ok: boolean;
  storefront: { id: string; open_state: string; public_name?: string } | null;
  orders: Array<{ id: string; order_number: string; total: number; fulfillment: string; placed_at: string }>;
  shopper_url: string | null;
};
type CaseData = {
  ok: boolean;
  documents: { required: string[]; missing: string[] } | null;
  next_steps: Array<{ step: string }>;
  next_deadline: { kind: string; due_at: string } | null;
};

const Skeleton = () => (
  <div className="mx-auto max-w-md space-y-4 px-4 py-5">
    {[24, 32, 20].map((h, i) => (
      <div key={i} className="animate-pulse rounded-3xl bg-stone-200/70" style={{ height: `${h * 4}px` }} />
    ))}
  </div>
);

export default function Today({ lang, onOpenAssistant }: { lang: string; onOpenAssistant: () => void }) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [caze, setCaze] = useState<CaseData | null>(null);
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(() => {
    void api<StoreData>("/api/store").then(setStore).catch(() => {});
    void api<CaseData>("/api/case").then(setCaze).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    const h = () => refresh();
    const names = ["sidewalk:order_created", "sidewalk:order_status", "sidewalk:storefront_ready"];
    names.forEach((n) => window.addEventListener(n, h));
    return () => names.forEach((n) => window.removeEventListener(n, h));
  }, [refresh]);

  if (!store || !caze) return <Skeleton />;

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "greeting_morning" : hour < 18 ? "greeting_afternoon" : "greeting_evening", lang);
  const isOpen = store.storefront?.open_state === "open";
  const newestNew = store.orders.find((o) => o.fulfillment === "new");
  const latest = store.orders[0] ?? null;

  // ONE primary next action (§3.2 #2) — computed client-side, in priority order
  const action = !store.storefront
    ? { icon: "🏪", title: t("publish_store", lang), sub: t("publish_store_sub", lang), go: () => navigate("/app/store") }
    : (caze.documents?.missing.length ?? 0) > 0 && caze.next_steps[0]
      ? { icon: "👣", title: lbl(STEP_LABEL, caze.next_steps[0].step, lang), sub: t("next_step", lang), go: () => navigate("/app/case") }
      : newestNew
        ? { icon: "🛎️", title: `${t("accept_order_cta", lang)} ${newestNew.order_number}`, sub: `$${Number(newestNew.total).toFixed(2)}`, go: () => navigate("/app/store") }
        : caze.next_steps[0]
          ? { icon: "👣", title: lbl(STEP_LABEL, caze.next_steps[0].step, lang), sub: t("next_step", lang), go: () => navigate("/app/case") }
          : { icon: "💬", title: t("ask_anything", lang), sub: t("tap_mic_hint", lang), go: onOpenAssistant };

  const docsNeed = caze.documents?.required.length ?? 0;
  const docsHave = docsNeed - (caze.documents?.missing.length ?? 0);
  const pct = docsNeed ? Math.round((docsHave / docsNeed) * 100) : 0;
  const daysLeft = caze.next_deadline
    ? Math.max(0, Math.ceil((new Date(caze.next_deadline.due_at).getTime() - Date.now()) / 86_400_000))
    : null;

  const statusChip: Record<string, string> = {
    new: t("o_new", lang), accepted: t("o_accepted", lang), ready: t("o_ready", lang),
    picked_up: t("o_picked_up", lang), cancelled: t("o_cancelled", lang),
  };

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-forest">☀️ {greeting}</h1>
          {store.storefront?.public_name && <p className="text-sm text-stone-500">{store.storefront.public_name}</p>}
        </div>
        <div
          className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(#f59e0b ${pct * 3.6}deg, #e7e5e4 0deg)` }}
          aria-label={`${t("documents", lang)} ${pct}%`}
        >
          <div className="grid h-11 w-11 place-items-center rounded-full bg-cream text-xs font-black text-forest">
            {docsHave}/{docsNeed}
          </div>
        </div>
      </header>

      {/* store open/closed control */}
      {store.storefront && (
        <section className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${isOpen ? "bg-leaf" : "bg-stone-300"}`} />
            <p className="font-bold">{isOpen ? t("store_is_open", lang) : t("store_is_closed", lang)}</p>
          </div>
          <button
            disabled={toggling}
            onClick={async () => {
              setToggling(true);
              await api("/api/store/state", { open_state: isOpen ? "closed" : "open" }).catch(() => {});
              setToggling(false);
              refresh();
            }}
            className={`rounded-full px-4 py-2 text-sm font-bold text-white active:scale-95 ${isOpen ? "bg-stone-400" : "bg-leaf"}`}
          >
            {toggling ? "…" : isOpen ? t("btn_close_store", lang) : t("btn_open_store", lang)}
          </button>
        </section>
      )}

      {/* ONE primary next action */}
      <section>
        <p className="mb-1 px-1 text-xs font-bold uppercase text-stone-400">⭐ {t("today_next", lang)}</p>
        <button
          onClick={action.go}
          className="flex w-full items-center gap-4 rounded-3xl bg-forest p-5 text-left text-white shadow-lg transition active:scale-[0.98]"
        >
          <span className="text-4xl">{action.icon}</span>
          <span className="min-w-0">
            <span className="block text-lg font-extrabold leading-snug">{action.title}</span>
            <span className="block truncate text-sm opacity-80">{action.sub}</span>
          </span>
          <span className="ms-auto text-2xl opacity-70">›</span>
        </button>
      </section>

      {/* the assistant, always one tap away — the voice loop is the product's front door */}
      <button
        onClick={onOpenAssistant}
        className="flex w-full items-center gap-4 rounded-3xl border-2 border-leaf/30 bg-white p-4 text-left shadow-sm transition active:scale-[0.98]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-leaf text-2xl text-white">🎤</span>
        <span className="min-w-0">
          <span className="block font-extrabold text-forest">{t("ask_anything", lang)}</span>
          <span className="block truncate text-sm text-stone-500">{t("tap_mic_hint", lang)}</span>
        </span>
        <span className="ms-auto text-xl text-stone-300">›</span>
      </button>

      {/* urgent deadline */}
      {caze.next_deadline && (
        <button onClick={() => navigate("/app/case")} className="block w-full rounded-3xl border-s-8 border-mango bg-white p-4 text-start shadow-sm active:scale-[0.99]">
          <p className="text-xs font-bold uppercase text-stone-400">⏰ {t("next_deadline", lang)}</p>
          <p className="text-xl font-extrabold">
            {caze.next_deadline.due_at.slice(0, 10)}
            {daysLeft !== null && <span className={`ms-2 text-sm font-bold ${daysLeft <= 7 ? "text-chili" : "text-stone-400"}`}>({daysLeft}d)</span>}
          </p>
          <p className="text-sm capitalize text-stone-500">{caze.next_deadline.kind.replace(/_/g, " ")}</p>
        </button>
      )}

      {/* latest order */}
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase text-stone-400">🧾 {t("latest_order", lang)}</p>
        {latest ? (
          <button onClick={() => navigate("/app/store")} className="mt-1 flex w-full items-center justify-between text-start active:opacity-70">
            <div>
              <p className="text-lg font-extrabold">{latest.order_number} · ${Number(latest.total).toFixed(2)}</p>
              <p className="text-xs text-stone-400">{String(latest.placed_at).slice(5, 16).replace("T", " · ")}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${
              latest.fulfillment === "new" ? "bg-amber-100 text-amber-900"
                : latest.fulfillment === "ready" ? "bg-emerald-100 text-emerald-800"
                : "bg-stone-100 text-stone-600"
            }`}>
              {statusChip[latest.fulfillment] ?? latest.fulfillment}
            </span>
          </button>
        ) : (
          <p className="mt-1 text-sm text-stone-500">{store.storefront ? t("no_orders", lang) : t("publish_store_sub", lang)}</p>
        )}
      </section>
    </div>
  );
}
