import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MinusCircle, ShieldCheck } from "lucide-react";
import { api } from "@/lib/sidewalk";

export default function ProofPanel({ sessionCode }) {
  const [proof, setProof] = useState(null);

  useEffect(() => {
    let active = true;
    api.getProof({ session_code: sessionCode }).then((res) => {
      if (active && res.ok) setProof(res.data);
    });
    return () => {
      active = false;
    };
  }, [sessionCode]);

  const measured = (m) => (m.measured ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <MinusCircle className="h-4 w-4 text-stone-300" />);

  return (
    <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold text-stone-900 tracking-tight">Proof & honest boundaries</h2>
      </div>
      <p className="text-sm text-stone-500 mb-5 max-w-2xl">
        Every number below comes from an actual test run. Unmeasured targets say “Not yet measured.”
      </p>

      {proof && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2">Provider modes</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(proof.provider_modes || {}).map(([k, v]) => (
                <span key={k} className="text-[11px] rounded-lg bg-stone-50 border border-stone-200 px-2.5 py-1 text-stone-600">
                  <span className="font-semibold text-stone-800">{k}:</span> {v}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2">Test results</h3>
            <ul className="divide-y divide-stone-100">
              {(proof.eval_runs || []).map((m, i) => (
                <li key={i} className="flex items-start gap-3 py-2">
                  {measured(m)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-stone-800">{m.metric}</p>
                    <p className="text-xs text-stone-500">{m.notes}</p>
                  </div>
                  <span className={`text-xs font-semibold ${m.measured ? "text-emerald-600" : "text-stone-400"}`}>
                    {m.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ProofList title="Demonstrated" tone="emerald" items={proof.demonstrated} icon={CheckCircle2} />
            <ProofList title="Production design" tone="sky" items={proof.production_design} icon={ShieldCheck} />
            <ProofList title="Not evaluated" tone="stone" items={proof.not_evaluated} icon={XCircle} />
          </div>
        </div>
      )}
    </section>
  );
}

function ProofList({ title, items, icon: Icon, tone }) {
  const tones = {
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-200",
    sky: "text-sky-600 bg-sky-50 border-sky-200",
    stone: "text-stone-500 bg-stone-50 border-stone-200",
  };
  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-4 w-4 ${tones[tone].split(" ")[0]}`} />
        <h4 className="text-xs font-semibold uppercase tracking-widest text-stone-500">{title}</h4>
      </div>
      <ul className="space-y-1.5">
        {(items || []).map((it, i) => (
          <li key={i} className="text-xs text-stone-600 leading-relaxed flex gap-1.5">
            <span className="text-stone-300">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}