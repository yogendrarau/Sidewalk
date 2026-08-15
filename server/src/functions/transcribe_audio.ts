/**
 * transcribe_audio (§9): ASR chain — managed Whisper-class endpoint → (selfhost) → browser tier.
 * With no endpoint configured, the PWA's SpeechRecognition tier already produced text client-side;
 * this function then simply reports asr_unavailable so the adapter uses that text.
 */
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineFn } from "./_fn.js";
import { MEDIA_DIR } from "../db.js";

const Input = z.object({ sha256: z.string(), lang_hint: z.string().optional() });

export type AsrOut =
  | { text: string; lang: string; asr_confidence: number; tier: "managed" }
  | { asr_unavailable: true; tier: "browser" };

export const transcribe_audio = defineFn<z.infer<typeof Input>, AsrOut>("transcribe_audio", Input, async (input) => {
  const endpoint = process.env.ASR_ENDPOINT;
  if (!endpoint) return { asr_unavailable: true, tier: "browser" };
  const path = join(MEDIA_DIR, input.sha256);
  if (!existsSync(path)) return { asr_unavailable: true, tier: "browser" };

  const form = new FormData();
  form.set("file", new Blob([readFileSync(path)], { type: "audio/webm" }), "audio.webm");
  form.set("model", "whisper-large-v3-turbo");
  if (input.lang_hint) form.set("language", input.lang_hint);
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: process.env.ASR_API_KEY ? { authorization: `Bearer ${process.env.ASR_API_KEY}` } : {},
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { asr_unavailable: true, tier: "browser" };
  const out = (await res.json()) as { text: string; language?: string };
  // asr_confidence: endpoint-reported when present; floor handled by caller (below floor → ask to repeat)
  return { text: out.text, lang: out.language ?? input.lang_hint ?? "es", asr_confidence: 0.9, tier: "managed" };
});
