import { useState, useEffect } from "react";
import { ShieldAlert, X } from "lucide-react";
import { DISCLAIMER, FIRST_USE_WARNING } from "@/lib/sidewalk";

export default function DisclaimerBanner({ variant = "banner" }) {
  const [showFirstUse, setShowFirstUse] = useState(false);

  useEffect(() => {
    if (variant === "firstuse" && !localStorage.getItem("sidewalk_firstuse_seen")) {
      setShowFirstUse(true);
    }
  }, [variant]);

  const dismiss = () => {
    localStorage.setItem("sidewalk_firstuse_seen", "1");
    setShowFirstUse(false);
  };

  return (
    <div className="w-full">
      <div className="w-full bg-stone-900 text-stone-300 text-[10px] sm:text-[11px] tracking-wider uppercase px-4 py-2 text-center font-medium leading-relaxed">
        {DISCLAIMER}
      </div>
      {variant === "firstuse" && showFirstUse && (
        <div className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-[13px] flex items-start gap-3 shadow-sm">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <p className="flex-1 leading-relaxed">{FIRST_USE_WARNING}</p>
          <button onClick={dismiss} className="text-amber-700 hover:text-amber-900 transition-colors" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}