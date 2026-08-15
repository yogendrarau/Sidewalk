import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Mic, ScanLine, ShoppingCart } from "lucide-react";
import { api } from "@/lib/sidewalk";
import DisclaimerBanner from "@/components/sidewalk/DisclaimerBanner";
import VendorAsk from "@/components/sidewalk/VendorAsk";
import VendorCheck from "@/components/sidewalk/VendorCheck";
import VendorSales from "@/components/sidewalk/VendorSales";

const TABS = [
  { id: "ask", label: "Preguntar", icon: Mic },
  { id: "check", label: "Verificar", icon: ScanLine },
  { id: "sales", label: "Mis Ventas", icon: ShoppingCart },
];

export default function Vendor() {
  const { code } = useParams();
  const [tab, setTab] = useState("ask");
  const [caseData, setCaseData] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const loadCase = useCallback(async () => {
    const res = await api.getCase({ session_code: code });
    if (res.ok) {
      setCaseData(res.data);
      setLoadError(null);
    } else {
      setLoadError(res.error || "Sesión no válida");
    }
  }, [code]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-stone-50">
        <DisclaimerBanner />
        <div className="max-w-md mx-auto px-5 py-16 text-center">
          <p className="text-stone-800 font-semibold mb-2">No se pudo abrir la sesión de demostración</p>
          <p className="text-sm text-stone-500">{loadError}</p>
          <p className="text-xs text-stone-400 mt-4">Escanee el código QR desde la consola para comenzar.</p>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-stone-50">
        <DisclaimerBanner />
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 border-4 border-stone-200 border-t-amber-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const vendor = caseData.vendor;
  const summons = (caseData.documents || []).find((d) => d.kind === "summons") || (caseData.documents || [])[0];
  const evidence = caseData.evidence || [];

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col max-w-md mx-auto relative">
      <DisclaimerBanner variant="firstuse" />

      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-stone-900 flex items-center justify-center">
            <span className="text-amber-400 font-bold text-xs">S</span>
          </div>
          <div>
            <h1 className="font-semibold text-stone-900 text-sm leading-none">SIDEWALK</h1>
            <p className="text-[9px] text-stone-400 uppercase tracking-widest mt-0.5">Asistente demo de IA</p>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24">
        {tab === "ask" && <VendorAsk sessionCode={code} vendor={vendor} />}
        {tab === "check" && <VendorCheck sessionCode={code} summons={summons} />}
        {tab === "sales" && <VendorSales sessionCode={code} evidence={evidence} onChanged={loadCase} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-stone-200 px-2 py-1.5 flex justify-around z-30">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
                active ? "text-amber-700" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.2]" : ""}`} />
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}