/**
 * My Store (§10.1 #4, §10.2 — the star): launch flow (menu photo → draft → big-type price
 * confirmation → publish, confirm-gated per invariant 9) and the live store: preview + QR,
 * catalog with confirm-gated availability changes, orders board with realtime arrivals,
 * voice cash log, graded A/B ledger. Prices are NEVER prefilled when the draft has none.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, sendInbound, uploadMedia } from "../api";
import { t } from "../i18n";
import { asrSupported, startListening, speak } from "../speech";

type Item = {
  id: string; title_by_lang: Record<string, string>; price: number;
  availability: string; sort_order: number; image_url?: string | null;
};
type OrderLine = { title: string; qty: number; unit_price: number };
type Order = {
  id: string; order_number: string; items: OrderLine[]; total: number; currency: string;
  fulfillment: string; placed_at: string; pickup_code?: string;
};
type StoreData = {
  ok: boolean;
  storefront: { id: string; slug: string; public_name: string; open_state: string; qr_url: string } | null;
  items: Item[];
  orders: Order[];
  shopper_url: string | null;
  evidence: { total: number; a_count: number; b_count: number; sum: number; recent: Array<{ amount: number; at: string; grade: string }> };
};
type DraftRow = { title: string; price: string }; // price "" = missing → highlighted, never prefilled
type LaunchResult = { slug: string; shopper_url: string; qr_url: string };

const itemTitle = (i: Item, lang: string) =>
  i.title_by_lang?.[lang] ?? i.title_by_lang?.en ?? Object.values(i.title_by_lang ?? {})[0] ?? "—";

function ConfirmModal({ title, note, confirmLabel, danger, busy, onCancel, onConfirm, lang }: {
  title: string; note: string; confirmLabel: string; danger?: boolean; busy: boolean;
  onCancel: () => void; onConfirm: () => void; lang: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" onClick={onCancel}>
      <div className="msg-in w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">{title}</p>
        <p className={`mt-1 rounded-2xl p-3 text-sm font-semibold ${danger ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
          ✋ {note}
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-xl border-2 border-stone-300 py-3 font-bold">{t("cancel", lang)}</button>
          <button onClick={onConfirm} disabled={busy}
            className={`flex-1 rounded-xl py-3 font-bold text-white active:scale-95 ${danger ? "bg-chili" : "bg-mango"}`}>
            {busy ? "…" : `✓ ${confirmLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Store({ lang }: { lang: string }) {
  const [data, setData] = useState<StoreData | null>(null);
  const [busy, setBusy] = useState(false);

  // launch flow
  const [phase, setPhase] = useState<"start" | "draft" | "confirm" | "done">("start");
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [publicName, setPublicName] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [launched, setLaunched] = useState<LaunchResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // manage view
  const [showQr, setShowQr] = useState(false);
  const [availTarget, setAvailTarget] = useState<{ item: Item; to: "available" | "sold_out" } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [listening, setListening] = useState(false);
  const [cashToast, setCashToast] = useState<string | null>(null);

  const refresh = useCallback(() => void api<StoreData>("/api/store").then(setData).catch(() => {}), []);
  useEffect(refresh, [refresh]);

  // realtime (§10.3 / Gate 3): new order arrives without refresh
  useEffect(() => {
    const onCreated = (e: Event) => {
      const d = (e as CustomEvent).detail as { order_id?: string; order_number?: string; total?: number; currency?: string; items?: OrderLine[] };
      if (!d.order_id) return;
      setData((prev) => {
        if (!prev || prev.orders.some((o) => o.id === d.order_id)) return prev;
        const order: Order = {
          id: String(d.order_id), order_number: String(d.order_number ?? "#"), items: d.items ?? [],
          total: Number(d.total ?? 0), currency: String(d.currency ?? "USD"),
          fulfillment: "new", placed_at: new Date().toISOString(),
        };
        return { ...prev, orders: [order, ...prev.orders] };
      });
      setTimeout(refresh, 800); // reconcile pickup code + grade-A ledger from the server
    };
    const onOther = () => refresh();
    window.addEventListener("sidewalk:order_created", onCreated);
    window.addEventListener("sidewalk:order_status", onOther);
    window.addEventListener("sidewalk:catalog_changed", onOther);
    window.addEventListener("sidewalk:storefront_ready", onOther);
    return () => {
      window.removeEventListener("sidewalk:order_created", onCreated);
      window.removeEventListener("sidewalk:order_status", onOther);
      window.removeEventListener("sidewalk:catalog_changed", onOther);
      window.removeEventListener("sidewalk:storefront_ready", onOther);
    };
  }, [refresh]);

  if (!data) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        {[40, 28, 28].map((h, i) => <div key={i} className="animate-pulse rounded-3xl bg-stone-200/70" style={{ height: h * 4 }} />)}
      </div>
    );
  }

  // ---------------- launch flow (no storefront yet) ----------------
  if (!data.storefront) {
    const validRows = draft.filter((r) => r.title.trim().length > 0);
    const missingPrice = validRows.filter((r) => !(Number(r.price) > 0));
    const canContinue = validRows.length > 0 && missingPrice.length === 0;

    const onMenuPhoto = async (f: File | null) => {
      if (!f) return;
      setBusy(true);
      try {
        const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
        const { sha256 } = await uploadMedia(f, ext);
        const res = await api<{ ok: boolean; data: { items: Array<{ title: string; price_usd: number | null }> } }>(
          "/api/store/draft", { sha256, ext });
        const items = res.ok ? res.data.items : [];
        // price is NEVER prefilled when the draft has none (invariant 2 / §10.2)
        setDraft(items.length
          ? items.map((i) => ({ title: i.title, price: i.price_usd === null ? "" : String(i.price_usd) }))
          : [{ title: "", price: "" }]);
        setPhase("draft");
      } finally {
        setBusy(false);
      }
    };

    const publish = async () => {
      setBusy(true);
      try {
        const res = await api<{ ok: boolean; data: LaunchResult }>("/api/storefront", {
          confirm: true, // explicit merchant confirmation — this button IS the gate (invariant 9)
          lang,
          public_name: publicName.trim() || undefined,
          pickup_note: pickupNote.trim() || undefined,
          products: validRows.map((r) => ({ title: r.title.trim(), price_usd: Number(r.price) })),
        });
        if (res.ok) { setLaunched(res.data); setPhase("done"); refresh(); }
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-5">
        <h1 className="text-2xl font-black text-forest">🏪 {t("my_store", lang)}</h1>

        {phase === "start" && (
          <>
            <p className="text-sm text-stone-500">{t("store_explain", lang)}</p>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex w-full items-center gap-4 rounded-3xl bg-forest p-6 text-left text-white shadow-lg active:scale-[0.98]">
              <span className="text-4xl">📷</span>
              <span>
                <span className="block text-lg font-extrabold">{busy ? "…" : t("photo_menu", lang)}</span>
                <span className="block text-sm opacity-80">{t("publish_store_sub", lang)}</span>
              </span>
            </button>
            <button onClick={() => { setDraft([{ title: "", price: "" }]); setPhase("draft"); }}
              className="flex w-full items-center gap-4 rounded-3xl border-2 border-stone-200 bg-white p-6 text-left shadow-sm active:scale-[0.98]">
              <span className="text-4xl">✍️</span>
              <span className="text-lg font-extrabold">{t("add_by_hand", lang)}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => void onMenuPhoto(e.target.files?.[0] ?? null)} />
          </>
        )}

        {phase === "draft" && (
          <>
            <h2 className="text-lg font-extrabold">📝 {t("draft_title", lang)}</h2>
            <p className="text-sm text-stone-500">{t("draft_sub", lang)}</p>
            <div className="space-y-2">
              {draft.map((row, i) => {
                const priceMissing = row.title.trim().length > 0 && !(Number(row.price) > 0);
                return (
                  <div key={i} className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm">
                    <input
                      value={row.title}
                      onChange={(e) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))}
                      placeholder={t("item_name", lang)}
                      className="h-12 min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 text-[15px] font-semibold outline-none focus:border-leaf"
                    />
                    <div className={`flex h-12 w-28 items-center rounded-xl border-2 px-2 ${
                      priceMissing ? "border-mango bg-amber-50" : "border-stone-200 bg-stone-50"
                    }`}>
                      <span className="text-stone-400">$</span>
                      <input
                        value={row.price}
                        onChange={(e) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, price: e.target.value.replace(/[^0-9.]/g, "") } : r)))}
                        placeholder={t("price", lang)}
                        inputMode="decimal"
                        aria-label={`${t("price", lang)} — ${row.title || t("item_name", lang)}`}
                        className="w-full min-w-0 bg-transparent px-1 text-[15px] font-bold outline-none"
                      />
                    </div>
                    <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label={t("cancel", lang)}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-400 active:bg-stone-100">✕</button>
                  </div>
                );
              })}
            </div>
            {missingPrice.length > 0 && (
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">⚠️ {t("price_missing", lang)} · {missingPrice.length}</p>
            )}
            <button onClick={() => setDraft((d) => [...d, { title: "", price: "" }])}
              className="w-full rounded-2xl border-2 border-dashed border-stone-300 py-3 font-bold text-stone-500 active:bg-stone-50">
              {t("add_item", lang)}
            </button>
            <div className="flex gap-2">
              <button onClick={() => setPhase("start")} className="flex-1 rounded-2xl border-2 border-stone-300 py-4 font-bold">{t("cancel", lang)}</button>
              <button onClick={() => setPhase("confirm")} disabled={!canContinue}
                className="flex-1 rounded-2xl bg-forest py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-40">
                {t("continue_btn", lang)} →
              </button>
            </div>
          </>
        )}

        {phase === "confirm" && (
          <>
            <h2 className="text-lg font-extrabold">✋ {t("confirm_prices_title", lang)}</h2>
            <p className="text-sm text-stone-500">{t("confirm_prices_sub", lang)}</p>
            <div className="divide-y divide-stone-100 rounded-3xl bg-white p-2 shadow-sm">
              {validRows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-3">
                  <p className="min-w-0 flex-1 truncate text-[16px] font-bold">{r.title}</p>
                  {/* price in large type — the merchant confirms exactly what goes live (§10.2) */}
                  <p className="text-3xl font-black text-forest">${Number(r.price).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <input value={publicName} onChange={(e) => setPublicName(e.target.value)} placeholder={t("store_name", lang)}
              className="h-12 w-full rounded-2xl border-2 border-stone-200 bg-white px-4 text-[15px] font-semibold outline-none focus:border-leaf" />
            <input value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} placeholder={t("pickup_note_lbl", lang)} maxLength={120}
              className="h-12 w-full rounded-2xl border-2 border-stone-200 bg-white px-4 text-[15px] outline-none focus:border-leaf" />
            <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">✋ {t("confirm_store", lang)}</p>
            <div className="flex gap-2">
              <button onClick={() => setPhase("draft")} className="flex-1 rounded-2xl border-2 border-stone-300 py-4 font-bold">{t("cancel", lang)}</button>
              <button onClick={() => void publish()} disabled={busy}
                className="flex-1 rounded-2xl bg-mango py-4 text-lg font-black text-white shadow-lg active:scale-[0.98]">
                {busy ? "…" : `✓ ${t("publish_btn", lang)}`}
              </button>
            </div>
          </>
        )}

        {phase === "done" && launched && (
          <section className="msg-in rounded-3xl bg-white p-5 text-center shadow-sm">
            <p className="text-4xl">🎉</p>
            <h2 className="mt-1 text-xl font-black text-forest">{t("store_live", lang)}</h2>
            <img src={launched.qr_url} alt="QR" className="mx-auto mt-3 w-52 rounded-2xl border-4 border-forest" />
            <p className="mt-2 text-sm font-bold text-stone-600">{t("share_qr", lang)}</p>
            <a href={launched.shopper_url} target="_blank" rel="noreferrer"
              className="mt-1 block truncate text-sm font-semibold text-leaf underline">{launched.shopper_url}</a>
            <button onClick={() => { setLaunched(null); refresh(); }}
              className="mt-4 w-full rounded-2xl bg-forest py-4 text-lg font-bold text-white shadow-lg active:scale-[0.98]">
              {t("manage_store", lang)} →
            </button>
          </section>
        )}
      </div>
    );
  }

  // ---------------- manage view (storefront exists) ----------------
  const sf = data.storefront;
  const board: Array<{ key: string; label: string; orders: Order[] }> = [
    { key: "new", label: t("o_new", lang), orders: data.orders.filter((o) => o.fulfillment === "new") },
    { key: "accepted", label: t("o_accepted", lang), orders: data.orders.filter((o) => o.fulfillment === "accepted") },
    { key: "ready", label: t("o_ready", lang), orders: data.orders.filter((o) => o.fulfillment === "ready") },
  ];
  const doneCount = data.orders.filter((o) => o.fulfillment === "picked_up" || o.fulfillment === "cancelled").length;

  const advance = async (o: Order, to: string) => {
    setBusy(true);
    await api(`/api/store/order/${o.id}/status`, { to }).catch(() => {});
    setBusy(false);
    refresh();
  };

  const voiceLog = () => {
    if (!asrSupported()) return;
    setListening(true);
    startListening(lang, async (text) => {
      setListening(false);
      const res = await sendInbound({ kind: "text", text: `vendí en efectivo ${text}` });
      if (res.ok) {
        setCashToast(res.data.reply.text.replace(/\[\d+\]/g, ""));
        speak(res.data.reply.sentences, lang);
        refresh();
        setTimeout(() => setCashToast(null), 6000);
      }
    }, () => setListening(false));
  };

  const nextMove: Record<string, { to: string; label: string } | null> = {
    new: { to: "accepted", label: t("btn_accept", lang) },
    accepted: { to: "ready", label: t("btn_ready", lang) },
    ready: { to: "picked_up", label: t("btn_picked", lang) },
  };

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5 pb-28">
      {/* store header: preview, state, QR */}
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black text-forest">🏪 {sf.public_name}</h1>
            <span className={`mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
              sf.open_state === "open" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
            }`}>
              {sf.open_state === "open" ? `● ${t("s_open", lang)}` : `○ ${t("s_closed", lang)}`}
            </span>
          </div>
          <button onClick={() => setShowQr((q) => !q)} className="rounded-2xl border-2 border-stone-200 px-3 py-2 text-sm font-bold active:bg-stone-50">
            {showQr ? "✕" : "QR"}
          </button>
        </div>
        {showQr && <img src={sf.qr_url} alt="QR" className="mx-auto mt-3 w-52 rounded-2xl border-4 border-forest" />}
        {data.shopper_url && (
          <a href={data.shopper_url} target="_blank" rel="noreferrer"
            className="mt-2 block truncate text-sm font-semibold text-leaf underline">
            👀 {t("live_preview", lang)} — {data.shopper_url}
          </a>
        )}
      </section>

      {/* orders board */}
      <section>
        <p className="mb-1 px-1 text-xs font-bold uppercase text-stone-400">🛎️ {t("orders_title", lang)}</p>
        {data.orders.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            {t("no_orders", lang)}
          </div>
        )}
        <div className="space-y-3">
          {board.map((col) =>
            col.orders.length === 0 ? null : (
              <div key={col.key}>
                <p className={`mb-1 px-1 text-xs font-black uppercase ${col.key === "new" ? "text-mango" : col.key === "ready" ? "text-leaf" : "text-stone-400"}`}>
                  {col.label} · {col.orders.length}
                </p>
                <ul className="space-y-2">
                  {col.orders.map((o) => (
                    <li key={o.id} className="msg-in rounded-3xl bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-extrabold">{o.order_number} · ${Number(o.total).toFixed(2)}</p>
                        {o.pickup_code && (
                          <span className="rounded-full bg-stone-100 px-2.5 py-1 font-mono text-xs font-bold">{o.pickup_code}</span>
                        )}
                      </div>
                      {o.items.length > 0 && (
                        <p className="mt-0.5 truncate text-sm text-stone-500">
                          {o.items.map((l) => `${l.qty}× ${l.title}`).join(" · ")}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        {nextMove[o.fulfillment] && (
                          <button onClick={() => void advance(o, nextMove[o.fulfillment]!.to)} disabled={busy}
                            className={`flex-1 rounded-xl py-3 font-bold text-white active:scale-95 ${o.fulfillment === "new" ? "bg-forest" : "bg-leaf"}`}>
                            ✓ {nextMove[o.fulfillment]!.label}
                          </button>
                        )}
                        <button onClick={() => setCancelTarget(o)} aria-label={t("cancel_order", lang)}
                          className="rounded-xl border-2 border-stone-200 px-4 py-3 font-bold text-stone-500 active:bg-stone-50">✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
        {doneCount > 0 && <p className="mt-2 px-1 text-xs text-stone-400">🗂️ {t("order_history", lang)}: {doneCount}</p>}
      </section>

      {/* catalog with confirm-gated availability */}
      <section>
        <p className="mb-1 px-1 text-xs font-bold uppercase text-stone-400">🧺 {t("catalog_title", lang)}</p>
        <ul className="divide-y divide-stone-100 rounded-3xl bg-white p-2 shadow-sm">
          {data.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-2 py-3">
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[15px] font-bold ${i.availability === "sold_out" ? "text-stone-400 line-through" : ""}`}>
                  {itemTitle(i, lang)}
                </p>
                <p className="text-sm font-black text-forest">${Number(i.price).toFixed(2)}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                i.availability === "available" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
              }`}>
                {i.availability === "available" ? t("avail_available", lang) : t("avail_sold_out", lang)}
              </span>
              <button
                onClick={() => setAvailTarget({ item: i, to: i.availability === "available" ? "sold_out" : "available" })}
                className="rounded-xl border-2 border-stone-200 px-3 py-2 text-xs font-bold active:bg-stone-50"
              >
                {i.availability === "available" ? t("mark_sold_out", lang) : t("mark_available", lang)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* graded evidence + voice cash log */}
      <section className="rounded-3xl bg-forest p-5 text-white shadow-lg">
        <p className="text-xs uppercase tracking-wide opacity-70">{t("evidence", lang)}</p>
        <p className="text-3xl font-black">${data.evidence.sum.toFixed(0)}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-400/30 px-3 py-1">A × {data.evidence.a_count} · {t("card_verified", lang)}</span>
          <span className="rounded-full bg-amber-400/30 px-3 py-1">B × {data.evidence.b_count} · {t("self_reported", lang)}</span>
        </div>
      </section>
      <button onClick={voiceLog}
        className={`w-full rounded-3xl py-5 text-lg font-black text-white shadow-lg transition active:scale-[0.98] ${listening ? "recording bg-chili" : "bg-mango"}`}>
        🎤 {listening ? t("listening", lang) : t("log_cash", lang)}
      </button>
      {cashToast && <p className="msg-in rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">✓ {cashToast}</p>}

      {/* confirm gates (invariant 9 — each physically blocks) */}
      {availTarget && (
        <ConfirmModal
          lang={lang}
          title={`${itemTitle(availTarget.item, lang)} → ${availTarget.to === "sold_out" ? t("avail_sold_out", lang) : t("avail_available", lang)}`}
          note={t("confirm_change_note", lang)}
          confirmLabel={t("confirm", lang)}
          busy={busy}
          onCancel={() => setAvailTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            await api("/api/store/item", {
              confirm: true, lang,
              item: {
                id: availTarget.item.id,
                title: itemTitle(availTarget.item, lang),
                price_usd: Number(availTarget.item.price),
                availability: availTarget.to,
                sort_order: Number(availTarget.item.sort_order ?? 0),
              },
            }).catch(() => {});
            setBusy(false);
            setAvailTarget(null);
            refresh();
          }}
        />
      )}
      {cancelTarget && (
        <ConfirmModal
          lang={lang}
          danger
          title={`${t("cancel_order", lang)} ${cancelTarget.order_number}`}
          note={t("cancel_order_note", lang)}
          confirmLabel={t("cancel_order", lang)}
          busy={busy}
          onCancel={() => setCancelTarget(null)}
          onConfirm={async () => {
            setBusy(true);
            await api(`/api/store/order/${cancelTarget.id}/status`, { to: "cancelled", confirm_cancel: true }).catch(() => {});
            setBusy(false);
            setCancelTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
