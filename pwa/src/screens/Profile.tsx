/**
 * Profile (§10.1 #5): language tier picker (honesty labels), discovery opt-in note,
 * privacy + deletion on request (invariant 4), feedback history, accessibility note.
 */
import { useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import Language from "./Language";

type FbRow = { flow: string; rating: string; at: string };

export default function Profile({ lang, onLangChange }: { lang: string; onLangChange: (l: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const fbLog: FbRow[] = (() => {
    try { return JSON.parse(localStorage.getItem("sidewalk_fb") ?? "[]") as FbRow[]; } catch { return []; }
  })();

  const deleteMe = async () => {
    setBusy(true);
    await api("/api/delete_me", { confirm: true }).catch(() => {});
    localStorage.removeItem("sidewalk_onboarded");
    localStorage.removeItem("sidewalk_device");
    localStorage.removeItem("sidewalk_fb");
    window.location.href = "/";
  };

  const ratingIcon: Record<string, string> = { helpful: "👍", wrong: "👎", confusing: "🤔" };

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-8">
      <Language lang={lang} onChange={onLangChange} />

      <div className="space-y-4 px-0">
        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-stone-400">🔎 {t("discovery_title", lang)}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("discovery_note", lang)}</p>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-stone-400">🔒 {t("privacy_title", lang)}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("privacy_note", lang)}</p>
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="mt-3 w-full rounded-2xl border-2 border-red-200 py-3 font-bold text-chili active:bg-red-50">
              🗑️ {t("delete_me", lang)}
            </button>
          ) : (
            <div className="mt-3 rounded-2xl border-2 border-chili bg-red-50 p-3">
              <p className="text-sm font-bold text-red-900">✋ {t("delete_confirm_note", lang)}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setConfirming(false)} className="flex-1 rounded-xl border-2 border-stone-300 bg-white py-3 font-bold">{t("cancel", lang)}</button>
                <button onClick={() => void deleteMe()} disabled={busy}
                  className="flex-1 rounded-xl bg-chili py-3 font-bold text-white active:scale-95">
                  {busy ? "…" : `✓ ${t("delete_me", lang)}`}
                </button>
              </div>
            </div>
          )}
        </section>

        {fbLog.length > 0 && (
          <section className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase text-stone-400">💬 {t("fb_history", lang)}</p>
            <ul className="mt-1 divide-y divide-stone-100 text-sm">
              {fbLog.slice(0, 8).map((f, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="font-semibold">{ratingIcon[f.rating] ?? "💬"} {t(`fb_${f.rating}`, lang)}</span>
                  <span className="text-xs capitalize text-stone-400">{f.flow} · {f.at.slice(5, 10)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-stone-400">♿ {t("a11y_title", lang)}</p>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">{t("a11y_note", lang)}</p>
        </section>
      </div>
    </div>
  );
}
