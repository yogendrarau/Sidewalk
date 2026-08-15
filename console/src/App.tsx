/**
 * Caseworker console (§11): queue · case detail (evidence ↔ provenance + trace with citations)
 * · Guard tab (checks log + Scam Radar NTA tiles) · Autopilot queue · live eval tab.
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
type CaseDetail = {
  case: { track: string; status: string } | null;
  documents_signed: Array<{ id: string; doc_type: string; url: string; sha256: string }>;
  fields: Array<{ field: string; value: string | null; confidence: number | null; tier: string }>;
  deadlines: Array<{ kind: string; due_at: string }>;
  evidence_summary: { total: number; a_card_verified: number; b_self_reported: number };
  rule_evaluations: Array<{ id: string; question: string; rulebook_version: string; rules_fired: Array<{ rule_id: string; inputs: Record<string, unknown>; outcome: unknown; citation: string }>; abstained: boolean; created_at: string }>;
  messages: Array<{ role: string; text: string; kind: string; at: string; tier?: string }>;
};
type GuardData = { checks: Array<{ kind: string; result: string; dataset_as_of: string; at: string }>; area_signals: Array<{ nta: string; pattern_key: string; count: number }> };
type Draft = { id: string; lang: string; body: string; status: string; channel: string };
type EvalData = { runs: Array<{ suite: string; metrics: Record<string, unknown>; finished_at: string }>; telemetry: Array<{ fn: string; calls: number; ok_rate: number; p50_ms: number; p95_ms: number }> };

const Chip = ({ children, tone = "stone" }: { children: React.ReactNode; tone?: string }) => {
  const tones: Record<string, string> = {
    stone: "bg-stone-200 text-stone-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700", blue: "bg-sky-100 text-sky-800", white: "bg-white/20 text-white",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
};

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tab, setTab] = useState<"queue" | "guard" | "autopilot" | "evals">("queue");
  const [queue, setQueue] = useState<QueueCase[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [guard, setGuard] = useState<GuardData | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [evals, setEvals] = useState<EvalData | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const q = await api<{ cases: QueueCase[] }>("/api/console/queue");
      setQueue(q.cases);
      setAuthed(true);
      setErr("");
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!authed) return;
    if (tab === "guard") void api<GuardData & { ok: boolean }>("/api/console/guard").then(setGuard);
    if (tab === "autopilot") void api<{ drafts: Draft[] }>("/api/console/autopilot").then((d) => setDrafts(d.drafts));
    if (tab === "evals") void api<EvalData & { ok: boolean }>("/api/console/evals").then(setEvals);
  }, [tab, authed]);
  useEffect(() => {
    if (selected) void api<CaseDetail & { ok: boolean }>(`/api/console/case/${selected}`).then(setDetail);
  }, [selected]);

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
          {(["queue", "guard", "autopilot", "evals"] as const).map((x) => (
            <button key={x} onClick={() => { setTab(x); setSelected(null); }}
              className={`rounded-full px-4 py-1.5 text-sm font-bold capitalize ${tab === x ? "bg-forest text-white" : "text-stone-500"}`}>
              {x === "queue" ? "📋 Queue" : x === "guard" ? "🛡️ Guard" : x === "autopilot" ? "✈️ Autopilot" : "📊 Evals"}
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
              {/* evidence panel: field ↔ source image + calibrated confidence chip */}
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
                    {detail.fields.map((f, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        <td className="py-1 font-semibold">{f.field}</td>
                        <td className="font-mono text-xs">{f.value ?? "∅ null"}</td>
                        <td>{f.confidence === null ? <Chip>unverified</Chip> : <Chip tone={f.confidence > 0.85 ? "green" : "amber"}>{Math.round(f.confidence * 100)}%</Chip>}</td>
                        <td><Chip tone="blue">{f.tier}</Chip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-stone-400">Confidence = calibrated empirical field accuracy from the labeled eval set — never model self-report.</p>
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
            <p className="text-sm text-stone-500">Agent-drafted outreach — nothing sends without human approval.</p>
            {drafts.map((d) => (
              <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <Chip tone="blue">{d.channel} · {d.lang}</Chip>
                  <Chip tone={d.status === "sent" ? "green" : d.status === "approved" ? "amber" : "stone"}>{d.status}</Chip>
                </div>
                <p className="mt-2 text-sm">{d.body}</p>
                {d.status === "draft" && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void api(`/api/console/autopilot/${d.id}`, { action: "approved" }).then(() => api<{ drafts: Draft[] }>("/api/console/autopilot").then((x) => setDrafts(x.drafts)))}
                      className="rounded-full bg-stone-200 px-4 py-1.5 text-sm font-bold">Approve</button>
                    <button onClick={() => void api(`/api/console/autopilot/${d.id}`, { action: "sent" }).then(() => api<{ drafts: Draft[] }>("/api/console/autopilot").then((x) => setDrafts(x.drafts)))}
                      className="rounded-full bg-forest px-4 py-1.5 text-sm font-bold text-white">Approve + send</button>
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
      </main>
    </div>
  );
}
