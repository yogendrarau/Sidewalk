import { useEffect, useState } from "react";
import { api, getLang } from "./api";
import { t } from "./i18n";
import Onboard from "./screens/Onboard";
import Chat from "./screens/Chat";
import MyCase from "./screens/MyCase";
import Check from "./screens/Check";
import Sales from "./screens/Sales";
import Language from "./screens/Language";

export type Tab = "chat" | "case" | "check" | "sales" | "lang";

export default function App() {
  const [onboarded, setOnboarded] = useState<boolean>(() => localStorage.getItem("sidewalk_onboarded") === "1");
  const [tab, setTab] = useState<Tab>("chat");
  const [lang, setLangState] = useState(getLang());
  const [seed, setSeed] = useState<string | null>(null); // first message to auto-send after onboarding

  useEffect(() => {
    void api("/api/config").catch(() => {});
  }, []);

  if (!onboarded) {
    return (
      <Onboard
        onDone={(firstQuestion) => {
          localStorage.setItem("sidewalk_onboarded", "1");
          setLangState(getLang());
          setSeed(firstQuestion);
          setOnboarded(true);
        }}
      />
    );
  }

  const tabs: Array<{ id: Tab; icon: string; label: string }> = [
    { id: "chat", icon: "💬", label: t("tab_chat", lang) },
    { id: "case", icon: "📂", label: t("tab_case", lang) },
    { id: "check", icon: "🛡️", label: t("tab_check", lang) },
    { id: "sales", icon: "🧾", label: t("tab_sales", lang) },
    { id: "lang", icon: "🌐", label: t("tab_lang", lang) },
  ];

  return (
    <div className="flex h-dvh flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      <main className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {tab === "chat" && <Chat lang={lang} seed={seed} onSeedConsumed={() => setSeed(null)} />}
        {tab === "case" && <MyCase lang={lang} />}
        {tab === "check" && <Check lang={lang} />}
        {tab === "sales" && <Sales lang={lang} />}
        {tab === "lang" && <Language lang={lang} onChange={(l) => setLangState(l)} />}
      </main>
      <nav className="no-print sticky bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md justify-around">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              aria-label={x.label}
              className={`flex min-w-16 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-semibold ${
                tab === x.id ? "text-forest" : "text-stone-400"
              }`}
            >
              <span className={`text-2xl leading-none ${tab === x.id ? "" : "grayscale opacity-70"}`}>{x.icon}</span>
              {x.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
