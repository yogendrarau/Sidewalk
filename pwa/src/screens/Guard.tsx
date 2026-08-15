/**
 * Guard (§10.1 #3): photograph a summons, type a ticket number, paste a suspicious message,
 * photograph any letter, placement check. Verdicts come from city records — never an AI score.
 * One-tap feedback chips (§3.4) feed the console correction queue.
 */
import { useRef, useState } from "react";
import { api, sendInbound, uploadMedia, type Reply } from "../api";
import { t } from "../i18n";
import { speak } from "../speech";

type Result = { reply: Reply["reply"]; guard: Reply["guard"]; intent: string };

export function logFeedbackLocal(flow: string, rating: string) {
  try {
    const log = JSON.parse(localStorage.getItem("sidewalk_fb") ?? "[]") as Array<{ flow: string; rating: string; at: string }>;
    log.unshift({ flow, rating, at: new Date().toISOString() });
    localStorage.setItem("sidewalk_fb", JSON.stringify(log.slice(0, 20)));
  } catch { /* history is best-effort */ }
}

export default function Guard({ lang }: { lang: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [ticket, setTicket] = useState("");
  const [fbSent, setFbSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const purposeRef = useRef<"summons" | "letter">("summons");

  async function run(payload: Record<string, unknown>) {
    setBusy(true);
    setResult(null);
    setFbSent(false);
    try {
      const res = await sendInbound(payload);
      if (res.ok) {
        setResult({ reply: res.data.reply, guard: res.data.guard, intent: res.data.intent });
        const audio = res.tts && "audio_urls" in res.tts ? (res.tts.audio_urls as string[]) : undefined;
        speak(res.data.reply.sentences, lang, audio);
      }
    } finally {
      setBusy(false);
    }
  }

  const onFile = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase();
    const { sha256 } = await uploadMedia(f, ext);
    await run({ kind: "image", sha256, ext, image_purpose: purposeRef.current });
  };

  const shareLocation = () => {
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => void run({ kind: "location", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => void run({ kind: "location", lat: 40.7484, lon: -73.9857 }),
      { timeout: 4000 },
    );
  };

  const sendFeedback = async (rating: "helpful" | "wrong" | "confusing") => {
    await api("/api/feedback", { flow: "guard", rating, context_ref: result?.intent }).catch(() => {});
    logFeedbackLocal("guard", rating);
    setFbSent(true);
  };

  const verdictColor = result
    ? result.guard.scam_pattern || result.reply.text.includes("no está en el archivo") || result.reply.text.toLowerCase().includes("not in the city")
      ? "border-chili bg-red-50"
      : result.intent === "summons_check" ? "border-leaf bg-emerald-50" : "border-stone-200 bg-white"
    : "";

  const Action = ({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) => (
    <button onClick={onClick}
      className="flex w-full items-center gap-4 rounded-3xl border-2 border-stone-200 bg-white px-5 py-4 text-left shadow-sm transition active:scale-[0.98]">
      <span className="text-3xl">{icon}</span>
      <span className="text-[16px] font-bold">{label}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-5">
      <h1 className="text-2xl font-black text-forest">🛡️ {t("check_title", lang)}</h1>
      <p className="text-sm text-stone-500">{t("check_sub", lang)}</p>

      <Action icon="🎫" label={t("photo_summons", lang)} onClick={() => { purposeRef.current = "summons"; fileRef.current?.click(); }} />
      <div className="flex gap-2">
        <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="№ 12345678..."
          className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-stone-200 bg-white px-4 font-mono text-[15px] outline-none focus:border-leaf" />
        <button onClick={() => ticket.trim() && void run({ kind: "text", text: `multa ${ticket.trim()}` })}
          className="rounded-2xl bg-forest px-4 font-bold text-white active:scale-95">→</button>
      </div>
      <Action icon="✉️" label={t("photo_letter", lang)} onClick={() => { purposeRef.current = "letter"; fileRef.current?.click(); }} />
      <Action icon="💬" label={t("paste_msg", lang)} onClick={() => setPasteOpen((o) => !o)} />
      {pasteOpen && (
        <div className="space-y-2 rounded-3xl border-2 border-stone-200 bg-white p-3">
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={3}
            placeholder='"Te consigo la licencia por $2,000…"'
            className="w-full rounded-xl bg-stone-50 p-3 text-sm outline-none" />
          <button onClick={() => pasteText.trim() && void run({ kind: "text", text: `me mandaron este mensaje: ${pasteText}` })}
            className="w-full rounded-xl bg-forest py-2.5 font-bold text-white active:scale-95">🛡️ Guard →</button>
        </div>
      )}
      <Action icon="📍" label={t("share_loc", lang)} onClick={shareLocation} />

      {busy && <p className="animate-pulse pt-2 text-center text-stone-500">🛡️ …</p>}

      {result && (
        <>
          <section className={`msg-in rounded-3xl border-2 p-4 shadow ${verdictColor}`}>
            <p className="whitespace-pre-wrap text-[15px] leading-snug">{result.reply.text.replace(/\[\d+\]/g, "")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => speak(result.reply.sentences, lang)} className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-leaf">▶︎ 🔊</button>
              {result.reply.citations.map((c) => (
                <span key={c.idx} className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-900">§ {c.citation.slice(0, 60)}</span>
              ))}
              {result.reply.freshness && (
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] text-sky-800">🕐 {t("data_as_of", lang)} {result.reply.freshness.slice(0, 10)}</span>
              )}
              {result.guard.scam_pattern && <span className="rounded-full bg-chili px-2.5 py-1 text-[10px] font-bold text-white">⚠️ {result.guard.scam_pattern}</span>}
            </div>
          </section>

          {/* one-tap feedback (§3.4) */}
          <section className="msg-in rounded-2xl bg-white p-3 shadow-sm">
            {fbSent ? (
              <p className="text-center text-sm font-semibold text-emerald-800">✓ {t("fb_thanks", lang)}</p>
            ) : (
              <>
                <p className="mb-2 text-center text-xs font-bold uppercase text-stone-400">{t("was_helpful", lang)}</p>
                <div className="flex gap-2">
                  {([["helpful", "👍", t("fb_helpful", lang)], ["wrong", "👎", t("fb_wrong", lang)], ["confusing", "🤔", t("fb_confusing", lang)]] as const).map(([r, icon, label]) => (
                    <button key={r} onClick={() => void sendFeedback(r)}
                      className="flex-1 rounded-xl border-2 border-stone-200 py-2 text-sm font-bold active:scale-95 active:bg-stone-50">
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}
