/**
 * Caseworker console (v3 §11): queue · case detail (evidence ↔ provenance + inline field
 * correction + trace with citations) · Commerce (stores, graded ledger, webhook provenance,
 * live orders over SSE) · Corrections (merchant feedback + human-corrected fields) · Guard
 * · Autopilot (draft → approved → published) · evals · hidden Platform telemetry (footer glyph).
 */
import { useEffect, useState, useCallback } from "react";

const token = () => localStorage.getItem("console_token") ?? "";
async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", authorization: `Bearer ${token()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("401");
  return (await res.json()) as T;
}

type QueueCase = { vendor_id: string; display_name: string; track: string; status: string; blocking_defects: string[]; next_deadline: { due_at: string; kind: string } | null; hearing_this_week: boolean };
type CaseField = { id: string; field: string; value: string | null; confidence: number | null; tier: string; human_corrected?: boolean };
type CaseDetail = {
  case: { track: string; status: string } | null;
  documents_signed: Array<{ id: string; doc_type: string; url: string; sha256: string }>;
  fields: CaseField[];
  deadlines: Array<{ kind: string; due_at: string }>;
  evidence_summary: { total: number; a_card_verified: number; b_self_reported: number };
  rule_evaluations: Array<{ id: string; question: string; rulebook_version: string; rules_fired: Array<{ rule_id: string; inputs: Record<string, unknown>; outcome: unknown; citation: string }>; abstained: boolean; created_at: string }>;
  messages: Array<{ role: string; text: string; kind: string; at: string; tier?: string }>;
};
type GuardData = { checks: Array<{ kind: string; result: string; dataset_as_of: string; at: string }>; area_signals: Array<{ nta: string; pattern_key: string; count: number }> };
type Draft = { id: string; lang: string; body: string; status: string; channel: string };
type EvalData = { runs: Array<{ suite: string; metrics: Record<string, unknown>; finished_at: string }>; telemetry: Array<{ fn: string; calls: number; ok_rate: number; p50_ms: number; p95_ms: number }> };
type StoreOrder = { order_number: string; total: number; fulfillment: string; placed_at: string; live?: boolean; webhook_receipts: Array<{ webhook_id: string; hmac_ok: boolean; deduped: boolean; at: string }> };
type Store = { vendor_id: string; public_name: string; slug: string; open_state: string; orders: StoreOrder[]; ledger: { a: number; b: number; sum: number } };
type FeedbackData = {
  feedback: Array<{ id: string; flow: string; rating: string; note: string | null; resolution: string; created_at?: string }>;
  corrected_fields: Array<{ id: string; schema_field: string; value: unknown; corrected_value: unknown; model_tier: string }>;
};
type PlatformData = {
  auth: { kind: string; org_id: string; grants: number };
  rls: { model: string; vendor_entities: string[]; public_projection_fields: Record<string, number> };
  automations: Array<{ name: string; at: string; ok: boolean; note?: string }>;
  realtime: { events: number; last_event_at: string | null; last_latency_ms: number | null };
};

const Chip = ({ children, tone = "stone" }: { children: React.ReactNode; tone?: string }) => {
  const tones: Record<string, string> = {
    stone: "bg-stone-200 text-stone-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700", blue: "bg-sky-100 text-sky-800", white: "bg-white/20 text-white",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
};

const fulfillTone = (f: string) => (f === "ready" ? "green" : f === "accepted" ? "amber" : f === "cancelled" ? "red" : f === "picked_up" ? "stone" : "blue");

const TABS = ["queue", "commerce", "corrections", "guard", "autopilot", "evals"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  queue: "📋 Queue", commerce: "🛒 Commerce", corrections: "✏️ Corrections", guard: "🛡️ Guard", autopilot: "✈️ Autopilot", evals: "📊 Evals",
};

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number] | "platform">("queue");
  const [queue, setQueue] = useState<QueueCase[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [guard, setGuard] = useState<GuardData | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [evals, setEvals] = useState<EvalData | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [fb, setFb] = useState<FeedbackData | null>(null);
  const [platform, setPlatform] = useState<PlatformData | null>(null);
  const [newOrders, setNewOrders] = useState(0);
  const [correcting, setCorrecting] = useState<{ id: string; value: string } | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const q = await api<{ cases: QueueCase[] }>("/api/console/queue");
      setQueue(q.cases);
      setAuthed(true);
      setErr("");
      // preload stores so a live order has a card to land on before the tab is opened
      void api<{ stores: Store[] }>("/api/console/commerce").then((s) => setStores(s.stores));
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!authed) return;
    if (tab === "commerce") void api<{ stores: Store[] }>("/api/console/commerce").then((s) => setStores(s.stores));
    if (tab === "corrections") void api<FeedbackData & { ok: boolean }>("/api/console/feedback").then(setFb);
    if (tab === "guard") void api<GuardData & { ok: boolean }>("/api/console/guard").then(setGuard);
    if (tab === "autopilot") void api<{ drafts: Draft[] }>("/api/console/autopilot").then((d) => setDrafts(d.drafts));
    if (tab === "evals") void api<EvalData & { ok: boolean }>("/api/console/evals").then(setEvals);
    if (tab === "platform") void api<PlatformData & { ok: boolean }>("/api/console/platform").then(setPlatform);
  }, [tab, authed]);
  useEffect(() => {
    setCorrecting(null);
    if (selected) void api<CaseDetail & { ok: boolean }>(`/api/console/case/${selected}`).then(setDetail);
  }, [selected]);

  // Base44-style realtime subscription (org:* topic): live orders without refresh
  useEffect(() => {
    if (!authed) return;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token())}`);
    const onOrder = (e: MessageEvent) => {
      const d = JSON.parse(e.data) as { vendor_id: string; order_number: string; total: number; fulfillment?: string };
      setNewOrders((n) => n + 1);
      setStores((prev) => prev.map((s) => s.vendor_id === d.vendor_id
        ? { ...s, orders: [{ order_number: d.order_number, total: d.total, fulfillment: d.fulfillment ?? "new", placed_at: new Date().toISOString(), live: true, webhook_receipts: [] }, ...s.orders] }
        : s));
    };
    es.addEventListener("order_created", onOrder);
    return () => es.close();
  }, [authed]);

  const saveCorrection = useCallback(async () => {
    if (!correcting || !selected) return;
    await api(`/api/console/field/${correcting.id}`, { corrected_value: correcting.value });
    setCorrecting(null);
    setDetail(await api<CaseDetail & { ok: boolean }>(`/api/console/case/${selected}`));
  }, [correcting, selected]);

  const resolveFeedback = useCallback(async (id: string, resolution: "reviewed" | "fixed") => {
    await api(`/api/console/feedback/${id}`, { resolution });
    setFb(await api<FeedbackData & { ok: boolean }>("/api/console/feedback"));
  }, []);

  const actOnDraft = useCallback(async (id: string, action: "approved" | "sent") => {
    await api(`/api/console/autopilot/${id}`, { action });
    setDrafts((await api<{ drafts: Draft[] }>("/api/console/autopilot")).drafts);
  }, []);

  if (!authed) {
    return (
      <div className="grid h-dvh place-items-center">
        <div className="w-96 rounded-3xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-black text-forest">🗂️ Sidewalk Console</h1>
          <p className="mt-1 text-sm text-stone-500">Caseworker access — org token (RLS-scoped)</p>
          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="org token, e.g. amara-clinic"
            className="mt-4 w-full rounded-xl border-2 border-stone-200 px-4 py-3 outline-none focus:border-leaf" />
          <button onClick={() => { localStorage.setItem("console_token", tokenInput.trim()); void load(); }}
            className="mt-3 w-full rounded-xl bg-forest py-3 font-bold text-white">Enter</button>
          {err && <p className="mt-2 text-sm text-chili">{err}</p>}
        </div>
      </div>
    );
  }

  const slo = evals?.runs.find((r) => r.suite === "qa50")?.metrics as Record<string, number> | undefined;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <h1 className="text-xl font-black text-forest">🗂️ Sidewalk Console <span className="ml-2 align-middle text-xs font-semibold text-stone-400">Amara's clinic</span></h1>
        <nav className="flex gap-1 rounded-full bg-stone-100 p-1">
          {TABS.map((x) => (
            <button key={x} onClick={() => { setTab(x); setSelected(null); if (x === "commerce") setNewOrders(0); }}
              className={`relative rounded-full px-4 py-1.5 text-sm font-bold capitalize ${tab === x ? "bg-forest text-white" : "text-stone-500"}`}>
              {TAB_LABEL[x]}
              {x === "commerce" && newOrders > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-pulse place-items-center rounded-full bg-chili px-1 text-[10px] font-black text-white">{newOrders}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === "queue" && !selected && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {queue.map((c) => (
              <button key={c.vendor_id} onClick={() => setSelected(c.vendor_id)}
                className="rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold">{c.display_name}</span>
                  {c.hearing_this_week && <Chip tone="red">⚖️ hearing this week</Chip>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Chip tone="green">{c.track}</Chip>
                  <Chip tone={c.status === "blocked" ? "red" : c.status === "ready" ? "green" : "amber"}>{c.status}</Chip>
                  {c.blocking_defects.slice(0, 2).map((d) => <Chip key={d}>{`missing: ${d}`}</Chip>)}
                </div>
                {c.next_deadline && <p className="mt-2 text-xs text-stone-500">⏰ {c.next_deadline.due_at.slice(0, 10)} · {c.next_deadline.kind}</p>}
              </button>
            ))}
            {queue.length === 0 && <p className="text-stone-400">No cases yet — run npm run seed.</p>}
          </div>
        )}

        {tab === "queue" && selected && detail && (
          <div>
            <button onClick={() => setSelected(null)} className="mb-3 text-sm font-bold text-leaf">← back to queue</button>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {/* evidence panel: field ↔ source image + calibrated confidence chip + inline correction (Gate 4) */}
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-black">🧾 Evidence panel <span className="text-xs font-semibold text-stone-400">field ↔ source provenance</span></h2>
                {detail.documents_signed.map((d) => (
                  <div key={d.id} className="mb-3 rounded-xl border border-stone-100 p-2">
                    <p className="mb-1 text-xs font-bold text-stone-500">{d.doc_type} · sha {d.sha256.slice(0, 10)}…</p>
                    <img src={d.url} alt={d.doc_type} className="max-h-40 rounded-lg border border-stone-200 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  </div>
                ))}
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-xs text-stone-400"><th>field</th><th>value</th><th>confidence</th><th>tier</th></tr></thead>
                  <tbody>
                    {detail.fields.map((f) => (
                      <tr key={f.id ?? f.field} className="border-t border-stone-100">
                        <td className="py-1 font-semibold">{f.field}</td>
                        <td className="font-mono text-xs">
                          {correcting?.id === f.id ? (
                            <span className="flex items-center gap-1">
                              <input autoFocus value={correcting.value}
                                onChange={(e) => setCorrecting({ id: f.id, value: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") void saveCorrection(); if (e.key === "Escape") setCorrecting(null); }}
                                className="w-24 rounded-lg border border-stone-300 px-1.5 py-0.5 text-xs outline-none focus:border-leaf" />
                              <button onClick={() => void saveCorrection()} className="rounded-full bg-forest px-2 py-0.5 text-[10px] font-bold text-white">Save</button>
                            </span>
                          ) : (
                            <>
                              {f.value ?? "∅ null"}
                              {f.human_corrected
                                ? <span className="ml-1.5"><Chip tone="green">human-corrected</Chip></span>
                                : <button onClick={() => setCorrecting({ id: f.id, value: f.value ?? "" })} className="ml-1.5 text-[10px] font-bold text-leaf underline">Correct</button>}
                            </>
                          )}
                        </td>
                        <td>{f.confidence === null ? <Chip>unverified</Chip> : <Chip tone={f.confidence > 0.85 ? "green" : "amber"}>{Math.round(f.confidence * 100)}%</Chip>}</td>
                        <td><Chip tone="blue">{f.tier}</Chip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-stone-400">Confidence = calibrated empirical field accuracy from the labeled eval set — never model self-report. Corrections apply instantly and outrank extraction.</p>
              </section>

              {/* trace panel: RuleEvaluation with citations */}
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-black">⚖️ Decision traces</h2>
                {detail.rule_evaluations.length === 0 && <p className="text-sm text-stone-400">No evaluations yet.</p>}
                {detail.rule_evaluations.map((ev) => (
                  <details key={ev.id} className="mb-2 rounded-xl border border-stone-100 p-2" open={detail.rule_evaluations.length < 3}>
                    <summary className="cursor-pointer text-sm font-bold">
                      “{ev.question.slice(0, 60)}” {ev.abstained && <Chip tone="amber">abstained</Chip>}
                      <span className="ml-1 text-[10px] font-normal text-stone-400">rulebook {ev.rulebook_version.slice(0, 8)}</span>
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {ev.rules_fired.map((r, i) => (
                        <li key={i} className="rounded-lg bg-stone-50 p-2 text-xs">
                          <b className="text-forest">{r.rule_id}</b> → <span className="font-mono">{JSON.stringify(r.outcome).slice(0, 90)}</span>
                          <p className="mt-0.5 text-[10px] text-amber-700">§ {r.citation}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
                <h3 className="mb-1 mt-4 text-sm font-black">💬 Conversation</h3>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {detail.messages.map((m, i) => (
                    <p key={i} className={`rounded-lg p-1.5 text-xs ${m.role === "vendor" ? "bg-emerald-50" : "bg-stone-50"}`}>
                      <b>{m.role === "vendor" ? "🧑" : "🤖"}</b> {m.text?.slice(0, 140)} {m.tier && <Chip tone="blue">{m.tier}</Chip>}
                    </p>
                  ))}
                </div>
              </section>

              {/* deadlines + evidence + packet */}
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-black">📅 Deadlines</h2>
                <ul className="space-y-1 text-sm">
                  {detail.deadlines.map((d, i) => (
                    <li key={i} className="flex justify-between rounded-lg bg-stone-50 px-2 py-1.5">
                      <span className="capitalize">{d.kind.replace(/_/g, " ")}</span><b>{d.due_at.slice(0, 10)}</b>
                    </li>
                  ))}
                </ul>
                <h2 className="mb-2 mt-4 font-black">💵 Sales evidence</h2>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl bg-emerald-50 p-3 text-center"><p className="text-2xl font-black text-emerald-700">{detail.evidence_summary.a_card_verified}</p><p className="text-[10px] font-bold text-emerald-800">grade A · card</p></div>
                  <div className="flex-1 rounded-xl bg-amber-50 p-3 text-center"><p className="text-2xl font-black text-amber-700">{detail.evidence_summary.b_self_reported}</p><p className="text-[10px] font-bold text-amber-800">grade B · self</p></div>
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === "commerce" && (
          <div>
            <p className="mb-3 text-[11px] text-stone-400">No shopper personal data is mirrored here — Shopify holds buyer contact and payment details.</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {stores.map((s) => (
                <section key={s.vendor_id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="font-black">🛒 {s.public_name} <span className="ml-1 font-mono text-xs font-normal text-stone-400">/shop/{s.slug}</span></h2>
                    <Chip tone={s.open_state === "open" ? "green" : s.open_state === "paused" ? "amber" : "stone"}>{s.open_state}</Chip>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="flex-1 rounded-xl bg-emerald-50 p-3 text-center"><p className="text-2xl font-black text-emerald-700">{s.ledger.a}</p><p className="text-[10px] font-bold text-emerald-800">grade A · card-verified</p></div>
                    <div className="flex-1 rounded-xl bg-amber-50 p-3 text-center"><p className="text-2xl font-black text-amber-700">{s.ledger.b}</p><p className="text-[10px] font-bold text-amber-800">grade B · self-reported</p></div>
                    <div className="flex-1 rounded-xl bg-stone-50 p-3 text-center"><p className="text-2xl font-black">${s.ledger.sum}</p><p className="text-[10px] font-bold text-stone-500">ledger total</p></div>
                  </div>
                  <h3 className="mb-1 mt-4 text-sm font-black">Recent orders</h3>
                  {s.orders.length === 0 && <p className="text-sm text-stone-400">No orders yet.</p>}
                  {s.orders.map((o, i) => (
                    <details key={`${o.order_number}-${i}`} className={`mb-1.5 rounded-xl border p-2 ${o.live ? "border-emerald-300 bg-emerald-50" : "border-stone-100"}`}>
                      <summary className="cursor-pointer text-sm">
                        <span className="font-bold">{o.order_number}</span> {o.live && <Chip tone="green">just now</Chip>}
                        <span className="float-right"><b className="mr-2">${o.total}</b><Chip tone={fulfillTone(o.fulfillment)}>{o.fulfillment}</Chip></span>
                      </summary>
                      <div className="mt-2 rounded-lg bg-stone-50 p-2 text-[11px]">
                        <p className="mb-1 font-bold text-stone-500">Webhook provenance</p>
                        {o.webhook_receipts.length === 0 && <p className="text-stone-400">{o.live ? "Receipt pending — reopen this tab for provenance." : "No receipts recorded."}</p>}
                        {o.webhook_receipts.map((w) => (
                          <p key={w.webhook_id} className="mb-0.5 font-mono">
                            {String(w.webhook_id).slice(0, 18)}… <Chip tone={w.hmac_ok ? "green" : "red"}>{w.hmac_ok ? "hmac ok" : "hmac fail"}</Chip>{" "}
                            {w.deduped && <Chip tone="amber">deduped</Chip>} · {String(w.at).slice(0, 19).replace("T", " ")}
                          </p>
                        ))}
                      </div>
                    </details>
                  ))}
                </section>
              ))}
              {stores.length === 0 && <p className="text-stone-400">No storefronts yet.</p>}
            </div>
          </div>
        )}

        {tab === "corrections" && fb && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-black">💬 Merchant feedback <span className="text-xs font-semibold text-stone-400">rapid correction loop</span></h2>
              {fb.feedback.length === 0 && <p className="text-sm text-stone-400">No feedback yet.</p>}
              {fb.feedback.map((f) => (
                <div key={f.id} className="mb-2 rounded-xl border border-stone-100 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone="blue">{f.flow}</Chip>
                    <Chip tone={f.rating === "helpful" ? "green" : f.rating === "wrong" ? "red" : "amber"}>{f.rating}</Chip>
                    <Chip tone={f.resolution === "fixed" ? "green" : f.resolution === "reviewed" ? "amber" : "stone"}>{f.resolution}</Chip>
                    {f.created_at && <span className="text-[10px] text-stone-400">{String(f.created_at).slice(0, 10)}</span>}
                  </div>
                  {f.note && <p className="mt-1.5 text-sm">“{f.note}”</p>}
                  {f.resolution !== "fixed" && (
                    <div className="mt-2 flex gap-2">
                      {f.resolution === "open" && (
                        <button onClick={() => void resolveFeedback(f.id, "reviewed")} className="rounded-full bg-stone-200 px-3 py-1 text-xs font-bold">Mark reviewed</button>
                      )}
                      <button onClick={() => void resolveFeedback(f.id, "fixed")} className="rounded-full bg-forest px-3 py-1 text-xs font-bold text-white">Mark fixed</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-black">✏️ Human-corrected fields <span className="text-xs font-semibold text-stone-400">corrections outrank extraction</span></h2>
              {fb.corrected_fields.length === 0 && <p className="text-sm text-stone-400">No corrections yet — use the Correct button on any evidence field.</p>}
              {fb.corrected_fields.length > 0 && (
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-xs text-stone-400"><th>field</th><th>extracted</th><th>corrected</th><th>tier</th></tr></thead>
                  <tbody>
                    {fb.corrected_fields.map((f) => (
                      <tr key={f.id} className="border-t border-stone-100">
                        <td className="py-1 font-semibold">{f.schema_field}</td>
                        <td className="font-mono text-xs text-stone-400 line-through">{f.value === null ? "∅ null" : String(f.value)}</td>
                        <td className="font-mono text-xs">{String(f.corrected_value)} <Chip tone="green">human-corrected</Chip></td>
                        <td><Chip tone="blue">{f.model_tier}</Chip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {tab === "guard" && guard && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-black">🗺️ Scam Radar <span className="text-xs font-semibold text-stone-400">aggregate counts by NTA — no vendor references</span></h2>
              <div className="grid grid-cols-2 gap-2">
                {guard.area_signals.map((s, i) => (
                  <div key={i} className={`rounded-xl p-3 ${s.count >= 3 ? "bg-red-50 ring-2 ring-chili" : "bg-stone-50"}`}>
                    <p className="text-xs font-bold text-stone-500">{s.nta}</p>
                    <p className="text-2xl font-black">{s.count} <span className="text-xs font-semibold">{s.count >= 3 ? "🚨 broadcast" : "reports"}</span></p>
                    <Chip tone={s.count >= 3 ? "red" : "amber"}>{s.pattern_key}</Chip>
                  </div>
                ))}
                {guard.area_signals.length === 0 && <p className="text-sm text-stone-400">No signals yet.</p>}
              </div>
            </section>
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-black">🔎 Verification checks</h2>
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs text-stone-400"><th>kind</th><th>result</th><th>data as of</th></tr></thead>
                <tbody>
                  {guard.checks.slice().reverse().map((c, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="py-1">{c.kind}</td>
                      <td><Chip tone={c.result === "found" ? "green" : c.result === "not_found" ? "red" : "amber"}>{c.result}</Chip></td>
                      <td className="text-xs text-stone-500">{String(c.dataset_as_of).slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}

        {tab === "autopilot" && (
          <div className="max-w-3xl space-y-3">
            <p className="text-sm text-stone-500">Agent-drafted outreach — nothing publishes without human approval.</p>
            {drafts.map((d) => (
              <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <Chip tone="blue">{d.channel} · {d.lang}</Chip>
                  <Chip tone={d.status === "published" ? "green" : d.status === "approved" ? "amber" : "stone"}>{d.status}</Chip>
                </div>
                <p className="mt-2 text-sm">{d.body}</p>
                {d.status !== "published" && (
                  <div className="mt-3 flex gap-2">
                    {d.status === "draft" && (
                      <button onClick={() => void actOnDraft(d.id, "approved")} className="rounded-full bg-stone-200 px-4 py-1.5 text-sm font-bold">Approve</button>
                    )}
                    <button onClick={() => void actOnDraft(d.id, "sent")} className="rounded-full bg-forest px-4 py-1.5 text-sm font-bold text-white">Send</button>
                  </div>
                )}
              </div>
            ))}
            {drafts.length === 0 && <p className="text-stone-400">No drafts queued.</p>}
          </div>
        )}

        {tab === "evals" && evals && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-forest p-5 text-white shadow">
              <h2 className="text-sm font-bold uppercase tracking-wide opacity-70">SLO</h2>
              <p className="text-2xl font-black">
                {slo ? `${Math.round(((slo.cited_or_abstained_rate as number) ?? 0) * 100)}%` : "—"} of legal-consequence replies carry a verified citation or an explicit abstention
              </p>
              <p className="text-xs opacity-70">target ≥95% · 5% error budget</p>
            </section>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-black">📊 Eval runs</h2>
                {evals.runs.map((r, i) => (
                  <details key={i} className="mb-1 rounded-xl border border-stone-100 p-2" open={i < 2}>
                    <summary className="cursor-pointer text-sm font-bold">{r.suite} <span className="text-xs font-normal text-stone-400">{String(r.finished_at).slice(0, 16)}</span></summary>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-stone-50 p-2 text-[11px]">{JSON.stringify(r.metrics, null, 1)}</pre>
                  </details>
                ))}
                {evals.runs.length === 0 && <p className="text-sm text-stone-400">Run npm run evals.</p>}
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-black">⚙️ Function telemetry</h2>
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-xs text-stone-400"><th>fn</th><th>calls</th><th>ok</th><th>p50</th><th>p95</th></tr></thead>
                  <tbody>
                    {evals.telemetry.map((t) => (
                      <tr key={t.fn} className="border-t border-stone-100">
                        <td className="py-1 font-mono text-xs">{t.fn}</td><td>{t.calls}</td>
                        <td><Chip tone={t.ok_rate > 0.95 ? "green" : "amber"}>{Math.round(t.ok_rate * 100)}%</Chip></td>
                        <td className="text-xs">{t.p50_ms}ms</td><td className="text-xs">{t.p95_ms}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </div>
        )}

        {tab === "platform" && platform && (
          <div className="mx-auto max-w-4xl">
            <h2 className="font-black">Platform telemetry</h2>
            <p className="mb-4 text-xs text-stone-400">How this workspace runs — identity, data boundaries, background jobs, and live events.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">Signed in</h3>
                <p className="mt-1 text-xl font-black">{platform.auth.org_id}</p>
                <p className="text-sm text-stone-500">{platform.auth.grants} vendor access grant{platform.auth.grants === 1 ? "" : "s"} · role-scoped session</p>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">Entity security</h3>
                <p className="mt-1 text-xl font-black">{platform.rls.vendor_entities.length} vendor entities under row-level security</p>
                <p className="text-sm text-stone-500">
                  Public projections are field-allowlisted{" "}
                  ({Object.entries(platform.rls.public_projection_fields).map(([k, v]) => `${k} ${v}`).join(" · ")} fields).
                </p>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">Latest automation runs</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {platform.automations.map((a, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-stone-50 px-2 py-1.5">
                      <span className="font-mono text-xs">{a.name}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">{String(a.at).slice(0, 16).replace("T", " ")} <Chip tone={a.ok ? "green" : "red"}>{a.ok ? "ok" : "failed"}</Chip></span>
                    </li>
                  ))}
                  {platform.automations.length === 0 && <li className="text-sm text-stone-400">No runs yet.</li>}
                </ul>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-400">Realtime</h3>
                <p className="mt-1 text-xl font-black">{platform.realtime.events} events delivered</p>
                <p className="text-sm text-stone-500">
                  {platform.realtime.last_latency_ms === null ? "No events yet" : `Last event published → flushed in ${platform.realtime.last_latency_ms} ms`}
                  {platform.realtime.last_event_at ? ` · ${String(platform.realtime.last_event_at).slice(0, 19).replace("T", " ")}` : ""}
                </p>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-end border-t border-stone-200 bg-white px-4 py-1">
        <button aria-label="platform telemetry" title="telemetry" onClick={() => { setTab("platform"); setSelected(null); }}
          className={`px-2 text-sm transition ${tab === "platform" ? "text-leaf" : "text-stone-300 hover:text-stone-400"}`}>⌁</button>
      </footer>
    </div>
  );
}
