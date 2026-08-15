import { useState, useEffect, useCallback } from "react";
import { Play, RefreshCw, RotateCcw, QrCode as QrIcon, Users, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/sidewalk";
import DisclaimerBanner from "@/components/sidewalk/DisclaimerBanner";
import QrCode from "@/components/sidewalk/QrCode";
import CaseDetail from "@/components/sidewalk/CaseDetail";
import RoadmapPanel from "@/components/sidewalk/RoadmapPanel";
import ProofPanel from "@/components/sidewalk/ProofPanel";

const SEEDED_QUEUE = [
  { name: "Rosa", type: "Food vendor", status: "Active demo", current: true },
  { name: "Marcos", type: "Street vendor", status: "Queued (fictional)", current: false },
  { name: "Lucía", type: "Food vendor", status: "Queued (fictional)", current: false },
];

export default function Console() {
  const [sessionCode, setSessionCode] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);

  const startSession = async () => {
    setStarting(true);
    const res = await api.startSession({});
    setStarting(false);
    if (res.ok) setSessionCode(res.data.session_code);
  };

  const refresh = useCallback(async () => {
    if (!sessionCode) return;
    const res = await api.getCase({ session_code: sessionCode });
    if (res.ok) setCaseData(res.data);
  }, [sessionCode]);

  useEffect(() => {
    if (!sessionCode) return;
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [sessionCode, refresh]);

  const reset = async () => {
    setResetting(true);
    await api.reset({ session_code: sessionCode });
    setResetting(false);
    refresh();
  };

  const newSession = () => {
    setSessionCode(null);
    setCaseData(null);
  };

  const vendorUrl = sessionCode ? `${window.location.origin}/p/${sessionCode}` : "";

  return (
    <div className="min-h-screen bg-stone-50">
      <DisclaimerBanner />
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-stone-900 flex items-center justify-center">
              <span className="text-amber-400 font-bold text-sm">S</span>
            </div>
            <div>
              <h1 className="font-semibold text-stone-900 tracking-tight leading-none">SIDEWALK</h1>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-0.5">Caseworker console · AI demo assistant</p>
            </div>
          </div>
          {sessionCode && (
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg px-2.5 py-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
              <button
                onClick={reset}
                disabled={resetting}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {resetting ? "Resetting…" : "Reset"}
              </button>
              <button
                onClick={newSession}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-200 rounded-lg px-2.5 py-1.5"
              >
                New session
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {!sessionCode ? (
          <StartView starting={starting} onStart={startSession} />
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sticky top-20">
                  <div className="flex items-center gap-2 mb-1">
                    <QrIcon className="h-4 w-4 text-amber-600" />
                    <h2 className="font-semibold text-stone-900 text-sm">Scan to open Rosa's app</h2>
                  </div>
                  <p className="text-xs text-stone-500 mb-4">No account needed. Opens the Spanish vendor PWA on a phone.</p>
                  <div className="flex justify-center">
                    <QrCode value={vendorUrl} size={200} />
                  </div>
                  <div className="mt-4 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-stone-400">Session code</p>
                    <p className="font-mono text-lg text-stone-900 tracking-widest">{sessionCode}</p>
                    <p className="text-[11px] text-stone-400 mt-1 break-all">{vendorUrl}</p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-3">
                <CaseDetail data={caseData} />
              </div>
            </div>

            <RoadmapPanel />

            <div>
              <button
                onClick={() => setProofOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900"
              >
                {proofOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {proofOpen ? "Hide" : "Show"} proof & honest boundaries
              </button>
              {proofOpen && <ProofPanel sessionCode={sessionCode} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StartView({ starting, onStart }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium px-3 py-1 mb-5">
        Hackathon prototype · Judge-ready
      </div>
      <h2 className="text-3xl font-semibold text-stone-900 tracking-tight mb-3">
        Turn a frightening document into a source-linked next step.
      </h2>
      <p className="text-stone-500 leading-relaxed mb-8">
        SIDEWALK is an AI demo assistant for street vendors. Start a demo session, scan the QR with a phone, and walk Rosa
        through voice guidance, summons checking, and a sales paper trail — then watch it all appear here in the caseworker console.
      </p>
      <button
        onClick={onStart}
        disabled={starting}
        className="inline-flex items-center gap-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-6 py-3.5 disabled:opacity-50 transition-colors"
      >
        <Play className="h-4 w-4" />
        {starting ? "Starting demo session…" : "Start demo session"}
      </button>

      <div className="mt-12 text-left">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-stone-400" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400">Institutional vision · seeded queue</h3>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100 shadow-sm">
          {SEEDED_QUEUE.map((q) => (
            <div key={q.name} className={`flex items-center justify-between px-4 py-3 ${q.current ? "bg-amber-50/50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${q.current ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-500"}`}>
                  {q.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-900">{q.name} <span className="text-stone-400 font-normal">· {q.type}</span></p>
                  <p className="text-xs text-stone-400">{q.status}</p>
                </div>
              </div>
              {q.current && <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Demo focus</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-400 mt-2">The demo centers on Rosa. Others are fictional placeholders for the institutional vision.</p>
      </div>
    </div>
  );
}