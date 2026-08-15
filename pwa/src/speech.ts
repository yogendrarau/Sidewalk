/**
 * Browser voice tier (BLOCKERS.md): SpeechRecognition for ASR, speechSynthesis for TTS.
 * TTS chunks per sentence — same design as the server tier (the gateway does not stream).
 */
const ASR_LANGS: Record<string, string> = {
  es: "es-US", en: "en-US", bn: "bn-BD", ar: "ar-EG", zh: "zh-CN",
  ru: "ru-RU", ht: "fr-HT", ko: "ko-KR", ur: "ur-PK", fr: "fr-FR", pl: "pl-PL",
};

type SR = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

export function asrSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startListening(lang: string, onFinal: (text: string, confidence: number) => void, onError: (err: string) => void): () => void {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) { onError("asr_unsupported"); return () => {}; }
  const rec = new Ctor();
  rec.lang = ASR_LANGS[lang] ?? "es-US";
  rec.interimResults = false;
  rec.continuous = false;
  let finished = false;
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1][0];
    finished = true;
    onFinal(last.transcript, last.confidence ?? 0.8);
  };
  rec.onerror = (e) => { if (!finished) onError(e.error); };
  rec.onend = () => { if (!finished) onError("no_speech"); };
  rec.start();
  return () => rec.stop();
}

let voiceCache: SpeechSynthesisVoice[] = [];
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!voiceCache.length) voiceCache = speechSynthesis.getVoices();
  const pref = ASR_LANGS[lang]?.split("-")[0] ?? lang;
  return (
    voiceCache.find((v) => v.lang.toLowerCase().startsWith(pref) && /female|mónica|monica|paulina|google/i.test(v.name)) ??
    voiceCache.find((v) => v.lang.toLowerCase().startsWith(pref)) ??
    null
  );
}
if (typeof speechSynthesis !== "undefined") {
  speechSynthesis.onvoiceschanged = () => { voiceCache = speechSynthesis.getVoices(); };
}

/** Speak sentence-by-sentence; returns a cancel function. */
export function speak(sentences: string[], lang: string, audioUrls?: string[], onDone?: () => void): () => void {
  let cancelled = false;
  if (audioUrls?.length) {
    const audio = new Audio();
    let i = 0;
    const next = () => {
      if (cancelled || i >= audioUrls.length) { onDone?.(); return; }
      audio.src = audioUrls[i++];
      void audio.play().catch(() => onDone?.());
    };
    audio.onended = next;
    next();
    return () => { cancelled = true; audio.pause(); };
  }
  if (typeof speechSynthesis === "undefined") { onDone?.(); return () => {}; }
  speechSynthesis.cancel();
  const clean = sentences.map((s) => s.replace(/\[\d+\]/g, "").trim()).filter(Boolean);
  clean.forEach((sentence, idx) => {
    const u = new SpeechSynthesisUtterance(sentence);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = ASR_LANGS[lang] ?? lang;
    u.rate = 0.98;
    if (idx === clean.length - 1 && onDone) u.onend = () => onDone();
    speechSynthesis.speak(u);
  });
  return () => { cancelled = true; speechSynthesis.cancel(); };
}
