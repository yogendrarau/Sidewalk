/** My Case (§10 screen 2): Propel-style single glance — status, next deadline, missing document, packet. */
import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";

type CaseData = {
  ok: boolean;
  case: { status?: string } | null;
  track: string | null;
  documents: { required: string[]; missing: string[]; notes: Record<string, string> } | null;
  next_steps: Array<{ step: string; duration_days_range: [number, number] | null; note?: string; citation: string }>;
  timeline_days_range: [number, number] | null;
  next_deadline: { kind: string; due_at: string; source: string } | null;
  deadlines: Array<{ kind: string; due_at: string }>;
};
type Packet = {
  ok: boolean;
  data: {
    vendor: { display_name: string };
    checklist: Array<{ doc: string; note: string; present: boolean }>;
    fields: Array<{ doc_type: string; field: string; value: string | null; confidence: number | null }>;
    evidence: { total: number; a_count: number; b_count: number; sum_a: number; sum_b: number };
    filing_note: string;
    rulebook_version: string;
  };
};

const STEP_LABEL: Record<string, Record<string, string>> = {
  nys_sales_tax_certificate: { es: "Certificado de impuestos del estado", en: "State sales tax certificate" },
  food_protection_course: { es: "Curso de protección de alimentos", en: "Food protection course" },
  submit_license_application: { es: "Presentar la solicitud", en: "Submit the application" },
  await_general_window_2027: { es: "Esperar la ventana 2027", en: "Wait for the 2027 window" },
};
const DOC_LABEL: Record<string, Record<string, string>> = {
  identity_document: { es: "Identidad (pasaporte extranjero OK)", en: "Identity (foreign passport OK)" },
  proof_of_address: { es: "Comprobante de domicilio", en: "Proof of address" },
  nys_sales_tax_certificate: { es: "Certificado de impuestos", en: "Tax certificate" },
  food_protection_certificate: { es: "Certificado del curso", en: "Course certificate" },
  commissary_agreement: { es: "Acuerdo de comisaría", en: "Commissary agreement" },
};
const lbl = (map: Record<string, Record<string, string>>, k: string, lang: string) => map[k]?.[lang] ?? map[k]?.en ?? k;

export default function MyCase({ lang }: { lang: string }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [packet, setPacket] = useState<Packet["data"] | null>(null);

  useEffect(() => {
    void api<CaseData>("/api/case").then(setData);
  }, []);

  if (!data) return <p className="p-8 text-center text-stone-400">⏳</p>;
  const docsHave = (data.documents?.required.length ?? 0) - (data.documents?.missing.length ?? 0);
  const docsNeed = data.documents?.required.length ?? 0;
  const pct = docsNeed ? Math.round((docsHave / docsNeed) * 100) : 0;
  const weeks = (d: [number, number] | null) => (d ? `${Math.round(d[0] / 7)}–${Math.round(d[1] / 7)} sem.` : "—");

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-5">
      <h1 className="text-2xl font-black text-forest">📂 {t("tab_case", lang)}</h1>

      <section className="flex items-center gap-4 rounded-3xl bg-forest p-5 text-white shadow-lg">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(#fbbf24 ${pct * 3.6}deg, rgba(255,255,255,.2) 0deg)` }}>
          <div className="grid h-16 w-16 place-items-center rounded-full bg-forest text-lg font-black">{docsHave}/{docsNeed}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide opacity-70">{t("status", lang)}</p>
          <p className="truncate text-lg font-extrabold capitalize">{data.case?.status ?? "intake"} · {data.track === "supervisory_food" ? "🌮" : "👕"} {data.track ?? "?"}</p>
          <p className="text-xs opacity-80">{t("documents", lang)}: {pct}%</p>
        </div>
      </section>

      {data.next_deadline && (
        <section className="rounded-3xl border-l-8 border-mango bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-stone-400">⏰ {t("next_deadline", lang)}</p>
          <p className="text-xl font-extrabold">{data.next_deadline.due_at.slice(0, 10)}</p>
          <p className="text-sm capitalize text-stone-500">{data.next_deadline.kind.replace(/_/g, " ")} · {data.next_deadline.source}</p>
        </section>
      )}

      {data.next_steps[0] && (
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-stone-400">👣 {t("next_step", lang)}</p>
          <p className="text-lg font-extrabold">{lbl(STEP_LABEL, data.next_steps[0].step, lang)}</p>
          <p className="text-sm text-stone-500">
            {weeks(data.next_steps[0].duration_days_range)} · total: {weeks(data.timeline_days_range)}
          </p>
        </section>
      )}

      {data.documents && (
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase text-stone-400">🗂️ {t("documents", lang)}</p>
          <ul className="space-y-2">
            {data.documents.required.map((d) => {
              const missing = data.documents!.missing.includes(d);
              return (
                <li key={d} className="flex items-center gap-2 text-[15px]">
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black text-white ${missing ? "bg-stone-300" : "bg-leaf"}`}>
                    {missing ? "•" : "✓"}
                  </span>
                  <span className={missing ? "text-stone-500" : "font-semibold"}>{lbl(DOC_LABEL, d, lang)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-stone-400">📄 {t("packet", lang)}</p>
          <button
            onClick={() => void api<Packet>("/api/packet").then((p) => { if (p.ok) { setPacket(p.data); setTimeout(() => window.print(), 350); } })}
            className="rounded-full bg-forest px-4 py-2 text-sm font-bold text-white active:scale-95">
            🖨️ {t("print_packet", lang)}
          </button>
        </div>
        {packet && (
          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm">
            <h2 className="text-lg font-black">Sidewalk — Application Packet</h2>
            <p className="text-xs text-stone-500">Rulebook {packet.rulebook_version} · {new Date().toISOString().slice(0, 10)}</p>
            <ul className="list-inside space-y-1">
              {packet.checklist.map((c) => (
                <li key={c.doc}>{c.present ? "✅" : "⬜"} <b>{lbl(DOC_LABEL, c.doc, lang)}</b> <span className="text-stone-500">{c.note}</span></li>
              ))}
            </ul>
            {packet.fields.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead><tr className="text-stone-400"><th>doc</th><th>field</th><th>value</th><th>conf.</th></tr></thead>
                <tbody>
                  {packet.fields.map((f, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td>{f.doc_type}</td><td>{f.field}</td><td className="font-mono">{f.value ?? "∅"}</td>
                      <td>{f.confidence === null ? "unverified" : `${Math.round(f.confidence * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p>💵 {t("evidence", lang)}: {packet.evidence.a_count} {t("card_verified", lang)} (${packet.evidence.sum_a.toFixed(0)}) + {packet.evidence.b_count} {t("self_reported", lang)} (${packet.evidence.sum_b.toFixed(0)})</p>
            <p className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-900">🔒 {packet.filing_note}</p>
          </div>
        )}
      </section>
    </div>
  );
}
