import { Image } from "@/components/ui/image";
import ProvenanceBadge from "@/components/sidewalk/ProvenanceBadge";
import {
  Mic, FileText, ShieldCheck, AlertTriangle, ScanLine, Banknote, CreditCard, Clock, Link2,
} from "lucide-react";

export default function CaseDetail({ data }) {
  if (!data) return null;
  const { vendor, documents, evaluations, verifications, evidence } = data;
  const summons = documents.find((d) => d.kind === "summons") || documents[0];
  const latestEval = evaluations[0];
  const latestCheck = verifications[0];
  const cash = evidence.filter((e) => e.kind === "cash_self_reported");
  const card = evidence.filter((e) => e.kind === "card_simulated");

  let trace = [];
  if (latestEval && latestEval.trace) {
    try {
      trace = typeof latestEval.trace === "string" ? JSON.parse(latestEval.trace) : latestEval.trace;
    } catch (e) {
      trace = [];
    }
  }

  return (
    <div className="space-y-5">
      {/* Case summary */}
      <Card>
        <CardHeader icon={FileText} title="Case summary" badge={<FictionalTag />} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="Vendor" value={vendor ? `${vendor.name} — food vendor (fictional)` : "—"} />
          <Field label="Language" value={vendor ? vendor.language.toUpperCase() : "—"} />
          <Field label="Case status" value="Open · preparation step pending" />
          <Field label="Sales-tax certificate" value={vendor ? (vendor.has_sales_tax_certificate ? "On file" : "Not on file") : "—"} />
        </div>
        {vendor && (
          <p className="mt-4 text-sm text-stone-600 italic border-l-2 border-stone-200 pl-3">{vendor.case_summary}</p>
        )}
      </Card>

      {/* Latest vendor interactions */}
      <Card>
        <CardHeader icon={Mic} title="Latest vendor interactions" />
        {evaluations.length === 0 ? (
          <Empty text="No questions asked yet. The vendor asks by voice on the phone." />
        ) : (
          <ul className="divide-y divide-stone-100">
            {evaluations.slice(0, 4).map((ev) => (
              <li key={ev.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-stone-800">
                      <span className="text-stone-400">Q:</span> {ev.question || "(no transcript)"}
                    </p>
                    <p className="text-sm text-stone-600 mt-1">
                      <span className="text-stone-400">A:</span> {ev.answer_text}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase ${ev.abstention ? "text-rose-500" : "text-emerald-600"}`}>
                    {ev.abstention ? "Abstained" : "Answered"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <ProvenanceBadge provenance={ev.provenance} />
                  <span className="text-xs text-stone-400">intent: {ev.intent}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Summons + extraction */}
      {summons && (
        <Card>
          <CardHeader icon={ScanLine} title="Summons — extracted field & source" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-2">Source image</p>
              <a href={summons.source_image_url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-stone-200 group">
                <div className="aspect-[4/3] w-full bg-stone-100">
                  <Image src={summons.source_image_url} alt="Watermarked demo summons" className="w-full h-full" fittingType="fill" />
                </div>
              </a>
              <p className="text-[11px] text-stone-400 mt-1.5 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Linked to extraction below
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400 mb-2">Extracted ticket number</p>
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-4">
                <p className="font-mono text-lg text-stone-900 tracking-wider">
                  {summons.ticket_number || <span className="text-stone-400">— unclear —</span>}
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  Status: <span className="font-medium">{summons.extraction_status}</span>
                </p>
                <div className="mt-2">
                  <ProvenanceBadge provenance={summons.provenance} />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* NYC verification */}
      <Card>
        <CardHeader icon={ShieldCheck} title="NYC public-record lookup" />
        {!latestCheck ? (
          <Empty text="No public lookup yet. The vendor runs it from the Check tab." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs text-stone-400">Ticket queried</p>
                <p className="font-mono text-sm text-stone-900">{latestCheck.normalized_ticket}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-400">Dataset time</p>
                <p className="text-sm text-stone-700 flex items-center gap-1"><Clock className="h-3 w-3" />{fmtTime(latestCheck.dataset_timestamp)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ProvenanceBadge provenance={latestCheck.provenance} />
              <span className={`text-sm font-semibold ${resultColor(latestCheck.result)}`}>{resultLabel(latestCheck.result)}</span>
            </div>
            {latestCheck.result === "not_found" && (
              <p className="text-xs text-stone-500 italic border-l-2 border-stone-200 pl-3">
                No record was returned by NYC Open Data when checked at {fmtTime(latestCheck.dataset_timestamp)}. This does not establish that the notice is fake or invalid.
              </p>
            )}
            {latestCheck.result === "found" && latestCheck.record_data && (
              <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs grid grid-cols-2 gap-2">
                <KV k="Issuing agency" v={latestCheck.record_data.issuing_agency} />
                <KV k="Hearing result" v={latestCheck.record_data.hearing_result} />
                <KV k="Hearing date" v={fmtTime(latestCheck.record_data.hearing_date)} />
                <KV k="Borough" v={latestCheck.record_data.violation_location_borough} />
              </div>
            )}
            {latestCheck.result === "unavailable" && (
              <p className="text-xs text-rose-600">Public source unavailable. A separate sample result is offered to the vendor.</p>
            )}
          </div>
        )}
      </Card>

      {/* Rule trace */}
      {latestEval && (
        <Card>
          <CardHeader icon={FileText} title="Deterministic rule trace" />
          <div className="space-y-2 text-sm">
            <p className="text-xs text-stone-400 font-mono break-all">rulebook hash: {latestEval.rulebook_hash}</p>
            <ul className="space-y-1.5">
              {trace.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${t.satisfied ? "bg-emerald-500" : "bg-stone-300"}`} />
                  <div>
                    <p className="text-stone-800">{t.ruleId}</p>
                    <p className="text-xs text-stone-500">{t.citationLabel}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-stone-500 pt-1">Source: {latestEval.source}</p>
          </div>
        </Card>
      )}

      {/* Evidence */}
      <Card>
        <CardHeader icon={Banknote} title="Evidence — self-reported vs simulated" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EvidenceCol icon={Banknote} title="Cash (self-reported)" items={cash} tone="amber" />
          <EvidenceCol icon={CreditCard} title="Card (simulated)" items={card} tone="slate" />
        </div>
      </Card>

      {/* Missing item nudge */}
      {vendor && (
        <Card>
          <CardHeader icon={AlertTriangle} title="Missing-item nudge (preview)" />
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p>{vendor.missing_item}. A nudge would remind the vendor to upload it — preview only, no message is sent.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function resultLabel(r) {
  return r === "found" ? "Record found" : r === "not_found" ? "No record returned" : "Source unavailable";
}
function resultColor(r) {
  return r === "found" ? "text-emerald-600" : r === "not_found" ? "text-stone-600" : "text-rose-600";
}
function fmtTime(t) {
  if (!t) return "—";
  try {
    return new Date(t).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch (e) {
    return String(t);
  }
}

function Card({ children }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">{children}</div>;
}
function CardHeader({ icon: Icon, title, badge }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-amber-600" />
        <h3 className="font-semibold text-stone-900 text-sm tracking-tight">{title}</h3>
      </div>
      {badge}
    </div>
  );
}
function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-stone-400">{label}</p>
      <p className="text-stone-800">{value}</p>
    </div>
  );
}
function FictionalTag() {
  return <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Fictional</span>;
}
function Empty({ text }) {
  return <p className="text-sm text-stone-400 italic">{text}</p>;
}
function KV({ k, v }) {
  return (
    <div>
      <p className="text-stone-400">{k}</p>
      <p className="text-stone-800 font-medium">{v || "—"}</p>
    </div>
  );
}
function EvidenceCol({ icon: Icon, title, items, tone }) {
  const tones = { amber: "bg-amber-50 border-amber-200", slate: "bg-slate-50 border-slate-200" };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-stone-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-stone-400 italic">None yet</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="font-semibold text-stone-900">${Number(e.amount).toFixed(2)}</p>
              <p className="text-xs text-stone-500">{e.note || ""}</p>
              <p className="text-[10px] text-stone-400">{fmtTime(e.recorded_at)} · {e.confirmed ? "confirmed" : "pending"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}