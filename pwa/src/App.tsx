/**
 * App shell + minimal hand-rolled router (§10.1): pathname + history.pushState, no deps.
 * Merchant surface: /app/today /app/case /app/guard /app/store /app/profile (fixed 5-tab nav,
 * never reordered) with a persistent voice/camera action above the nav that opens the
 * assistant as a full-height sheet. Shopper surface: /shop/:slug /discover /order/:token.
 */
import { useEffect, useState } from "react";
import { api, deviceId, getLang } from "./api";
import { t } from "./i18n";
import Onboard from "./screens/Onboard";
import Chat from "./screens/Chat";
import Today from "./screens/Today";
import MyCase from "./screens/MyCase";
import Guard from "./screens/Guard";
import Store from "./screens/Store";
import Profile from "./screens/Profile";
import Shop from "./screens/shop/Shop";
import Discover from "./screens/shop/Discover";
import OrderTrack from "./screens/shop/OrderTrack";
import MyOrders from "./screens/shop/MyOrders";

export function navigate(path: string) {
  if (window.location.pathname !== path) history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

const MERCHANT_TABS = ["today", "case", "guard", "store", "profile"] as const;

export default function App() {
  const path = usePath();
  const [onboarded, setOnboarded] = useState<boolean>(() => localStorage.getItem("sidewalk_onboarded") === "1");
  const [lang, setLangState] = useState(getLang());
  const [seed, setSeed] = useState<string | null>(null); // first message to auto-send after onboarding
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; sub?: string } | null>(null);

  useEffect(() => {
    void api("/api/config").catch(() => {});
  }, []);

  const isMerchant = path === "/" || path.startsWith("/app");

  // root → default route
  useEffect(() => {
    if (path === "/" || path === "/app" || path === "/app/") {
      history.replaceState({}, "", "/app/today");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [path]);

  // Base44-realtime emulation bus (§11): one SSE per merchant session; screens listen on window.
  useEffect(() => {
    if (!isMerchant || !onboarded) return;
    const es = new EventSource(`/api/events?device_id=${deviceId()}`);
    const names = ["order_created", "order_status", "notification", "catalog_changed", "storefront_ready"];
    const handlers = names.map((name) => {
      const h = (e: Event) => {
        let detail: Record<string, unknown> = {};
        try { detail = JSON.parse((e as MessageEvent).data) as Record<string, unknown>; } catch { /* keep {} */ }
        window.dispatchEvent(new CustomEvent(`sidewalk:${name}`, { detail }));
        if (name === "order_created") {
          setToast({
            title: `🛎️ ${t("new_order_toast", getLang())} ${String(detail.order_number ?? "")}`,
            sub: detail.total != null ? `$${Number(detail.total).toFixed(2)}` : undefined,
          });
          setTimeout(() => setToast(null), 6000);
        }
      };
      es.addEventListener(name, h);
      return { name, h };
    });
    return () => { handlers.forEach(({ name, h }) => es.removeEventListener(name, h)); es.close(); };
  }, [isMerchant, onboarded]);

  // ---- shopper surface (anonymous; clean market-stall styling, no merchant chrome)
  if (path.startsWith("/shop/")) return <Shop slug={path.split("/")[2] ?? ""} />;
  if (path.startsWith("/order/")) return <OrderTrack token={path.split("/")[2] ?? ""} />;
  if (path === "/discover") return <Discover />;
  if (path === "/orders") return <MyOrders />;

  // ---- merchant surface
  if (!onboarded) {
    return (
      <Onboard
        onDone={(firstQuestion, launchStore) => {
          localStorage.setItem("sidewalk_onboarded", "1");
          setLangState(getLang());
          setOnboarded(true);
          if (launchStore) {
            navigate("/app/store");
          } else {
            navigate("/app/today");
            if (firstQuestion) { setSeed(firstQuestion); setSheetOpen(true); }
          }
        }}
      />
    );
  }

  const seg = path.split("/")[2] ?? "today";
  const tab = (MERCHANT_TABS as readonly string[]).includes(seg) ? seg : "today";
  const tabs: Array<{ id: string; icon: string; label: string }> = [
    { id: "today", icon: "☀️", label: t("tab_today", lang) },
    { id: "case", icon: "📂", label: t("tab_case", lang) },
    { id: "guard", icon: "🛡️", label: t("tab_guard", lang) },
    { id: "store", icon: "🏪", label: t("my_store", lang) },
    { id: "profile", icon: "👤", label: t("tab_profile", lang) },
  ];

  return (
    <div className="flex h-dvh flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      <main className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {tab === "today" && <Today lang={lang} onOpenAssistant={() => setSheetOpen(true)} />}
        {tab === "case" && <MyCase lang={lang} />}
        {tab === "guard" && <Guard lang={lang} />}
        {tab === "store" && <Store lang={lang} />}
        {tab === "profile" && <Profile lang={lang} onLangChange={(l) => setLangState(l)} />}
      </main>

      {/* persistent voice/camera action ABOVE the nav (§10.1) */}
      {!sheetOpen && (
        <button
          onClick={() => setSheetOpen(true)}
          aria-label={t("hold_to_talk", lang)}
          className="no-print fixed right-4 z-30 grid h-16 w-16 place-items-center rounded-full bg-leaf text-white shadow-2xl transition active:scale-95"
          style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
        >
          <span className="text-2xl leading-none">🎤</span>
          <span className="-mt-1 text-[10px] leading-none">📷</span>
        </button>
      )}

      <nav className="no-print sticky bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md justify-around">
          {tabs.map((x) => (
            <button
              key={x.id}
              onClick={() => navigate(`/app/${x.id}`)}
              aria-label={x.label}
              aria-current={tab === x.id ? "page" : undefined}
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

      {toast && (
        <div className="msg-in fixed left-1/2 top-4 z-50 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-forest px-5 py-3 text-white shadow-2xl">
          <p className="font-bold">{toast.title}</p>
          {toast.sub && <p className="text-sm opacity-80">{toast.sub}</p>}
        </div>
      )}

      {/* assistant sheet — the existing Chat screen, full height */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSheetOpen(false)}>
          <div
            className="sheet-in absolute inset-x-0 bottom-0 top-12 overflow-hidden rounded-t-3xl bg-cream shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir={lang === "ar" ? "rtl" : "ltr"}
          >
            <Chat
              lang={lang}
              seed={seed}
              onSeedConsumed={() => setSeed(null)}
              onClose={() => setSheetOpen(false)}
              onNavigate={(route) => { setSheetOpen(false); navigate(route); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
