import { useState } from "react";
import { Mic, Volume2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { api, speak } from "@/lib/sidewalk";
import ProvenanceBadge from "@/components/sidewalk/ProvenanceBadge";
import VoiceRecorder from "@/components/sidewalk/VoiceRecorder";

export default function VendorAsk({ sessionCode, vendor }) {
  const [transcript, setTranscript] = useState("");
  const [transProv, setTransProv] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

  const onTranscript = async (text, prov) => {
    setTranscript(text);
    setTransProv(prov);
    setAnswer(null);
    setBusy(true);
    const res = await api.answer({ session_code: sessionCode, transcript: text, locale: "es" });
    setBusy(false);
    if (res.ok) {
      setAnswer(res.data);
      speak(res.data.answer_text, "es");
    } else {
      setAnswer({ error: res.error || "No se pudo responder." });
    }
  };

  return (
    <div className="px-4 py-5 space-y-5">
      {vendor && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-400">Su caso</p>
              <p className="font-semibold text-stone-900 text-sm">{vendor.name} · Vendedora de comida</p>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 border border-stone-200 rounded-full px-2 py-0.5">Demo</span>
          </div>
          <div className="mt-3 space-y-2 text-[13px]">
            <div className="flex gap-2">
              <span className="text-stone-400 flex-shrink-0">Próximo paso:</span>
              <span className="text-stone-700">{vendor.next_step}</span>
            </div>
            <div className="flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-stone-700">{vendor.missing_item}</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Mic className="h-5 w-5 text-amber-600" />
          <h2 className="font-semibold text-stone-900">Pregunte a su asistente demo</h2>
        </div>
        <p className="text-xs text-stone-500 mb-5">Hable en español. La respuesta es una posible guía, no una decisión oficial.</p>
        <VoiceRecorder sessionCode={sessionCode} onTranscript={onTranscript} />

        {transcript && (
          <div className="mt-5 rounded-xl bg-stone-50 p-3 text-sm">
            <p className="text-[11px] text-stone-400 mb-0.5">Usted dijo:</p>
            <p className="text-stone-800">{transcript}</p>
            {transProv && <div className="mt-2"><ProvenanceBadge provenance={transProv} /></div>}
          </div>
        )}

        {busy && <p className="mt-4 text-sm text-stone-400 animate-pulse">Preparando guía…</p>}

        {answer && !answer.error && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Guía preliminar de demostración</span>
                <button
                  onClick={() => speak(answer.answer_text, "es")}
                  className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium"
                >
                  <Volume2 className="h-4 w-4" /> Escuchar
                </button>
              </div>
              <p className="text-[15px] text-stone-800 leading-relaxed">{answer.answer_text}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ProvenanceBadge provenance={{ mode: "fixture", source: answer.source }} />
              <span className="text-xs text-stone-500">{answer.source}</span>
            </div>
            <button
              onClick={() => setTraceOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            >
              {traceOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {traceOpen ? "Ocultar regla de muestra" : "Ver regla de muestra"}
            </button>
            {traceOpen && (
              <div className="rounded-lg bg-stone-50 p-3 text-xs space-y-1 border border-stone-200">
                <p className="text-stone-500">Regla: <span className="font-mono text-stone-700">{answer.answer_key || "abstención"}</span></p>
                <p className="text-stone-500">Decisión: <span className="text-stone-700">{answer.decision === "answer" ? "respuesta" : "abstención — necesita revisión humana/legal"}</span></p>
                {answer.missing_facts && answer.missing_facts.length > 0 && (
                  <p className="text-rose-500">Datos faltantes: {answer.missing_facts.join(", ")}</p>
                )}
              </div>
            )}
          </div>
        )}
        {answer && answer.error && <p className="mt-4 text-sm text-rose-600">{answer.error}</p>}
      </div>

      <p className="text-center text-[11px] text-stone-400 px-6 leading-relaxed">
        Asistente demo de IA — no es abogado, trabajador social oficial ni servicio del gobierno. Confirme con la agencia responsable.
      </p>
    </div>
  );
}
