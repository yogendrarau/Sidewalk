/** Assistant (§10.1 sheet): hold-to-record, camera, playback, citation chips, proposed actions. */
import { useEffect, useRef, useState } from "react";
import { api, sendInbound, uploadMedia, type Reply } from "../api";
import { t, isT1 } from "../i18n";
import { asrSupported, startListening, speak } from "../speech";

type Msg = {
  role: "vendor" | "sidewalk";
  text: string;
  citations?: Reply["reply"]["citations"];
  freshness?: string;
  tier?: string;
  guard?: Reply["guard"];
  sentences?: string[];
  audio_urls?: string[];
  action?: { route: string; label: string };
};

export default function Chat({ lang, seed, onSeedConsumed, onClose, onNavigate }: {
  lang: string; seed: string | null; onSeedConsumed: () => void;
  onClose?: () => void; onNavigate?: (route: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [openCite, setOpenCite] = useState<number | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingPurpose, setPendingPurpose] = useState<"document" | "summons" | "letter">("document");

  useEffect(() => {
    void api<{ ok: boolean; messages: Array<{ role: string; text: string | null; citations?: Msg["citations"]; freshness?: string; tier?: string }> }>(
      "/api/messages",
    ).then((res) => {
      if (res.ok && res.messages?.length) {
        setMsgs(
          res.messages
            .filter((m) => m.text)
            .map((m) => ({ role: m.role === "vendor" ? "vendor" : "sidewalk", text: m.text!, citations: m.citations, freshness: m.freshness, tier: m.tier })),
        );
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (seed) {
      onSeedConsumed();
      void send({ kind: "text", text: seed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function send(payload: Record<string, unknown>, displayText?: string) {
    setBusy(true);
    if (displayText ?? payload.text) setMsgs((m) => [...m, { role: "vendor", text: String(displayText ?? payload.text) }]);
    try {
      const res = await sendInbound(payload);
      if (res.ok) {
        const r = res.data.reply;
        const audio = res.tts && "audio_urls" in res.tts ? (res.tts.audio_urls as string[]) : undefined;
        const act = res.data.actions as { propose?: string; route?: string } | undefined;
        const action = act?.route
          ? { route: String(act.route), label: act.propose === "provision_storefront" ? t("publish_store", lang) : t("my_store", lang) }
          : undefined;
        setMsgs((m) => [...m, {
          role: "sidewalk", text: r.text, citations: r.citations, freshness: r.freshness,
          tier: r.tier, guard: res.data.guard, sentences: r.sentences, audio_urls: audio, action,
        }]);
        speak(r.sentences, lang, audio);
      } else {
        setMsgs((m) => [...m, { role: "sidewalk", text: "⚠️ " + JSON.stringify(res) }]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { role: "sidewalk", text: `⚠️ ${String(err)}` }]);
    } finally {
      setBusy(false);
    }
  }

  const holdStart = () => {
    if (!asrSupported()) return;
    speechSynthesis?.cancel();
    setListening(true);
    stopRef.current = startListening(
      lang,
      (text) => { setListening(false); void send({ kind: "text", text }); },
      () => setListening(false),
    );
  };
  const holdEnd = () => { stopRef.current(); setTimeout(() => setListening(false), 400); };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
    const { sha256 } = await uploadMedia(f, ext);
    const label = pendingPurpose === "summons" ? t("photo_summons", lang) : pendingPurpose === "letter" ? t("photo_letter", lang) : t("photo_doc", lang);
    await send(
      { kind: "image", sha256, ext, image_purpose: pendingPurpose, doc_type_claimed: pendingPurpose === "document" ? "identity_document" : pendingPurpose },
      `📷 ${label}`,
    );
  };

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-cream/95 px-4 py-3 backdrop-blur">
        <img src="/icon.svg" className="h-9 w-9" alt="" />
        <div>
          <h1 className="text-lg font-black leading-tight text-forest">Sidewalk</h1>
          <p className="text-[11px] text-stone-500">{isT1(lang) ? t("reviewed", lang) : t("auto_translated", lang)}</p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label={t("cancel", lang)}
            className="ms-auto grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-lg font-bold text-stone-500 active:scale-95">✕</button>
        )}
      </header>

      <div className="flex-1 space-y-3 px-4 py-4">
        {msgs.length === 0 && (
          <div className="mt-10 rounded-3xl border-2 border-dashed border-stone-300 p-6 text-center text-stone-500">
            <p className="text-4xl">🎤</p>
            <p className="mt-2 text-sm">{t("tap_mic_hint", lang)}</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg-in flex ${m.role === "vendor" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${
              m.role === "vendor" ? "rounded-br-lg bg-forest text-white" : "rounded-bl-lg border border-stone-200 bg-white"
            }`}>
              <p className="whitespace-pre-wrap text-[15px] leading-snug">{m.text.replace(/\[\d+\]/g, "")}</p>
              {m.role === "sidewalk" && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.sentences && (
                    <button onClick={() => speak(m.sentences!, lang, m.audio_urls)}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-leaf">▶︎ 🔊</button>
                  )}
                  {m.citations?.map((c) => (
                    <button key={c.idx} onClick={() => setOpenCite(openCite === i * 100 + c.idx ? null : i * 100 + c.idx)}
                      className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      § {c.idx}
                    </button>
                  ))}
                  {m.freshness && (
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] text-sky-700">
                      🕐 {t("data_as_of", lang)} {m.freshness.slice(0, 10)}
                    </span>
                  )}
                  {m.guard?.scam_pattern && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-chili">🛡️ Guard</span>}
                </div>
              )}
              {m.citations?.map((c) =>
                openCite === i * 100 + c.idx ? (
                  <div key={`c${c.idx}`} className="mt-2 rounded-xl bg-amber-50/80 p-2 text-[11px] text-amber-900">
                    <b>{t("sources", lang)} [{c.idx}]:</b> {c.citation}
                  </div>
                ) : null,
              )}
              {m.action && onNavigate && (
                <button onClick={() => onNavigate(m.action!.route)}
                  className="mt-2 w-full rounded-xl bg-mango py-2.5 text-sm font-bold text-white active:scale-95">
                  🏪 {m.action.label} →
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="animate-pulse pl-2 text-sm text-stone-500">💭 {t("thinking", lang)}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="no-print sticky bottom-0 border-t border-stone-200 bg-white px-3 pb-2 pt-2">
        <div className="flex items-end gap-2">
          <div className="relative">
            <button
              onClick={() => {
                const menu = document.getElementById("cam-menu");
                menu?.classList.toggle("hidden");
              }}
              aria-label="camera" className="grid h-12 w-12 place-items-center rounded-full bg-stone-100 text-xl">📷</button>
            <div id="cam-menu" className="absolute bottom-14 left-0 hidden w-52 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
              {([["document", "🪪", t("photo_doc", lang)], ["summons", "🎫", t("photo_summons", lang)], ["letter", "✉️", t("photo_letter", lang)]] as const).map(([p, icon, label]) => (
                <button key={p} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold active:bg-stone-50"
                  onClick={() => { setPendingPurpose(p); document.getElementById("cam-menu")?.classList.add("hidden"); fileRef.current?.click(); }}>
                  <span className="text-lg">{icon}</span> {label}
                </button>
              ))}
            </div>
          </div>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { void send({ kind: "text", text: input.trim() }); setInput(""); } }}
            placeholder={t("type_here", lang)}
            className="h-12 min-w-0 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 text-[15px] outline-none focus:border-leaf"
          />

          <button
            onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd}
            aria-label={t("hold_to_talk", lang)}
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl text-white shadow-lg transition active:scale-95 ${
              listening ? "recording bg-chili" : "bg-leaf"
            }`}
          >
            🎤
          </button>
        </div>
        <p className="pt-1 text-center text-[10px] text-stone-400">{listening ? `● ${t("listening", lang)}` : t("hold_to_talk", lang)}</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}
