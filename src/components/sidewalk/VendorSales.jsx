import { useState } from "react";
import { Banknote, CreditCard, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { api } from "@/lib/sidewalk";
import ProvenanceBadge from "@/components/sidewalk/ProvenanceBadge";
import VoiceRecorder from "@/components/sidewalk/VoiceRecorder";

export default function VendorSales({ sessionCode, evidence, onChanged }) {
  const [transcript, setTranscript] = useState("");
  const [transProv, setTransProv] = useState(null);
  const [pending, setPending] = useState(null); // { amount }
  const [busy, setBusy] = useState(false);
  const [cardAmount, setCardAmount] = useState("8.50");
  const [cardBusy, setCardBusy] = useState(false);
  const [error, setError] = useState(null);

  const cash = evidence.filter((e) => e.kind === "cash_self_reported");
  const card = evidence.filter((e) => e.kind === "card_simulated");

  const onTranscript = async (text, prov) => {
    setTranscript(text);
    setTransProv(prov);
    setError(null);
    setBusy(true);
    const res = await api.recordCash({ session_code: sessionCode, amount: text, confirmed: false });
    setBusy(false);
    if (res.ok && res.data.requires_confirmation) {
      setPending({ amount: res.data.amount });
    } else if (res.ok) {
      setPending(null);
      setError("No se pudo leer un monto válido.");
    } else {
      setError(res.error || "No se pudo leer el monto.");
    }
  };

  const confirmCash = async () => {
    if (!pending) return;
    setBusy(true);
    const res = await api.recordCash({ session_code: sessionCode, amount: pending.amount, confirmed: true });
    setBusy(false);
    if (res.ok) {
      setPending(null);
      setTranscript("");
      onChanged();
    } else {
      setError(res.error || "No se pudo guardar.");
    }
  };

  const cancelCash = () => {
    setPending(null);
  };

  const runCheckout = async () => {
    const amt = parseFloat(cardAmount);
    if (!amt || amt <= 0) return;
    setCardBusy(true);
    const res = await api.checkout({ session_code: sessionCode, amount: amt });
    setCardBusy(false);
    if (res.ok) onChanged();
  };

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
        Estas ventas son <span className="font-semibold">evidencia de demostración</span>. La aceptación como prueba de licencia no está garantizada. No se contacta ningún servicio de pago real.
      </div>

      {/* Cash self-reported */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Banknote className="h-5 w-5 text-amber-600" />
          <h2 className="font-semibold text-stone-900">Registrar venta en efectivo</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">Diga el monto, por ejemplo: “Hice doce dólares”. Debe confirmar antes de guardarlo.</p>

        {!pending ? (
          <>
            <VoiceRecorder
              sessionCode={sessionCode}
              onTranscript={onTranscript}
              sampleFixtureId="cash_sample"
              sampleLabel="Usar monto de muestra ($12)"
            />
            {transcript && (
              <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
                <p className="text-[11px] text-stone-400">Usted dijo:</p>
                <p className="text-stone-800">{transcript}</p>
                {transProv && <div className="mt-2"><ProvenanceBadge provenance={transProv} /></div>}
              </div>
            )}
            {busy && <p className="mt-3 text-sm text-stone-400 animate-pulse">Leyendo monto…</p>}
            {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          </>
        ) : (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-sm text-stone-700">Confirmar venta en efectivo de:</p>
            <p className="text-3xl font-bold text-stone-900 my-1">${Number(pending.amount).toFixed(2)}</p>
            <p className="text-xs text-stone-500 mb-3">Esta es evidencia autoinformada. No se mueve dinero.</p>
            <div className="flex gap-2">
              <button
                onClick={confirmCash}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Confirmar
              </button>
              <button
                onClick={cancelCash}
                className="rounded-xl border border-stone-300 text-stone-600 text-sm font-medium px-4 py-2.5 hover:bg-stone-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simulated card */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="h-5 w-5 text-stone-500" />
          <h2 className="font-semibold text-stone-900">Pago con tarjeta (simulado)</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">Simula un evento de tarjeta. No se contacta ningún servicio de pago.</p>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            value={cardAmount}
            onChange={(e) => setCardAmount(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={runCheckout}
            disabled={cardBusy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-50"
          >
            {cardBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Simular
          </button>
        </div>
      </div>

      {/* Evidence list */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-stone-900 text-sm mb-3">Mis ventas registradas</h3>
        <div className="space-y-2">
          {evidence.length === 0 && <p className="text-sm text-stone-400 italic">Aún no hay ventas.</p>}
          {cash.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 mb-1">Efectivo (autoinformado)</p>
              {cash.map((e) => (
                <EvidenceRow key={e.id} e={e} tone="amber" />
              ))}
            </div>
          )}
          {card.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Tarjeta (simulada)</p>
              {card.map((e) => (
                <EvidenceRow key={e.id} e={e} tone="slate" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({ e, tone }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50",
    slate: "border-slate-200 bg-slate-50",
  };
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <div>
        <p className="font-semibold text-stone-900 text-sm">${Number(e.amount).toFixed(2)}</p>
        <p className="text-[11px] text-stone-500">{e.note || ""}</p>
      </div>
      <ProvenanceBadge provenance={e.provenance} />
    </div>
  );
}