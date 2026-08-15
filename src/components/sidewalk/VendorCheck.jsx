import { useState } from "react";
import { ScanLine, Loader2, CheckCircle2, AlertCircle, FileSearch, ShieldCheck, BookOpen } from "lucide-react";
import { api } from "@/lib/sidewalk";
import ProvenanceBadge from "@/components/sidewalk/ProvenanceBadge";
import { Image } from "@/components/ui/image";

export default function VendorCheck({ sessionCode, summons }) {
  const [ticket, setTicket] = useState(summons?.ticket_number || null);
  const [extractProv, setExtractProv] = useState(summons?.provenance || null);
  const [extractStatus, setExtractStatus] = useState(summons?.extraction_status || "pending");
  const [extracting, setExtracting] = useState(false);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [sample, setSample] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);

  const imageUrl = summons?.source_image_url;

  const extract = async () => {
    setExtracting(true);
    setExtractStatus("pending");
    const res = await api.extractSummons({ session_code: sessionCode, use_fixture: true });
    setExtracting(false);
    if (res.ok) {
      setTicket(res.data.ticket_number);
      setExtractProv(res.provenance);
      setExtractStatus(res.data.extraction_status);
    } else {
      setExtractStatus("unclear");
    }
  };

  const checkPublic = async () => {
    setChecking(true);
    setCheck(null);
    setSample(null);
    const res = await api.checkSummons({ session_code: sessionCode, ticket_number: ticket });
    setChecking(false);
    setCheck(res);
  };

  const viewSample = async () => {
    setSampleLoading(true);
    const res = await api.checkSummons({ session_code: sessionCode, ticket_number: ticket, use_sample: true });
    setSampleLoading(false);
    setSample(res);
  };

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine className="h-5 w-5 text-amber-600" />
          <h2 className="font-semibold text-stone-900">Verifique su citación</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">Esta es una citación de demostración con marca de agua. No es un documento real.</p>

        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-stone-200 mb-4">
            <div className="aspect-[4/3] w-full bg-stone-100">
              <Image src={imageUrl} alt="Citación de demostración" className="w-full h-full" fittingType="fill" />
            </div>
          </a>
        )}

        <button
          onClick={extract}
          disabled={extracting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-3 disabled:opacity-50 transition-colors"
        >
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          {extracting ? "Extrayendo…" : "Extraer número de la citación"}
        </button>

        {ticket && (
          <div className="mt-4 rounded-xl bg-stone-50 border border-stone-200 p-4">
            <p className="text-[11px] uppercase tracking-wide text-stone-400">Número extraído</p>
            <p className="font-mono text-xl text-stone-900 tracking-wider mt-0.5">{ticket}</p>
            <p className="text-xs text-stone-500 mt-1">Estado: {extractStatus === "extracted" ? "claro" : "confuso"}</p>
            <div className="mt-2"><ProvenanceBadge provenance={extractProv} /></div>
          </div>
        )}
        {extractStatus === "unclear" && !ticket && (
          <p className="mt-3 text-sm text-rose-600">No se pudo leer el número con claridad. Confirme el dígito manualmente.</p>
        )}
      </div>

      {ticket && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold text-stone-900">Consultar registro público de NYC</h2>
          </div>
          <p className="text-xs text-stone-500 mb-4">Consulta pública y de solo lectura al conjunto de datos de OATH. No afiliada a NYC.</p>

          <button
            onClick={checkPublic}
            disabled={checking}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium py-3 disabled:opacity-50 transition-colors"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
            {checking ? "Consultando…" : "Consultar registro público"}
          </button>

          {check && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <ProvenanceBadge provenance={check.provenance} />
                <span className="text-sm font-semibold text-stone-700">{check.ok ? resultEs(check.data.result) : "Fuente no disponible"}</span>
              </div>
              {check.ok && check.data.result === "not_found" && (
                <p className="text-xs text-stone-500 italic border-l-2 border-stone-200 pl-3">
                  No se devolvió ningún registro de NYC Open Data al consultar. Esto no significa que la citación sea falsa o inválida.
                </p>
              )}
              {check.ok && check.data.result === "found" && check.data.record_data && (
                <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs grid grid-cols-2 gap-2">
                  <KV k="Agencia" v={check.data.record_data.issuing_agency} />
                  <KV k="Resultado" v={check.data.record_data.hearing_result} />
                </div>
              )}
              {!check.ok && (
                <p className="text-xs text-rose-600">{check.error}</p>
              )}
              {(!check.ok || (check.ok && check.data.result !== "found")) && (
                <button
                  onClick={viewSample}
                  disabled={sampleLoading}
                  className="mt-1 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium py-2.5 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                >
                  {sampleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                  Ver resultado de muestra
                </button>
              )}
              {sample && sample.ok && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs space-y-1">
                  <ProvenanceBadge provenance={sample.provenance} />
                  <p className="text-stone-700 mt-1">Registro de muestra (ficticio):</p>
                  <KV k="Agencia" v={sample.data.record_data.issuing_agency} />
                  <KV k="Resultado" v={sample.data.record_data.hearing_result} />
                  <KV k="Fecha de audiencia" v={fmtTime(sample.data.record_data.hearing_date)} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold text-stone-900 text-sm">Pasos seguros</h3>
        </div>
        <ul className="space-y-1.5 text-sm text-stone-600">
          <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> Compare cada fecha y monto con el documento original.</li>
          <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> Confirme su próximo paso con la agencia responsable o un proveedor calificado.</li>
          <li className="flex gap-2"><AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" /> No pague ni presente documentos solo por esta guía preliminar.</li>
        </ul>
      </div>
    </div>
  );
}

function resultEs(r) {
  return r === "found" ? "Registro encontrado" : r === "not_found" ? "Sin registro devuelto" : "Fuente no disponible";
}
function fmtTime(t) {
  if (!t) return "—";
  try { return new Date(t).toLocaleDateString("es", { dateStyle: "medium" }); } catch (e) { return String(t); }
}
function KV({ k, v }) {
  return (
    <div>
      <p className="text-stone-400">{k}</p>
      <p className="text-stone-800 font-medium">{v || "—"}</p>
    </div>
  );
}