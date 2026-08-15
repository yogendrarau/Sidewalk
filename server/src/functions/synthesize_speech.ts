/**
 * synthesize_speech (§9): per-language chain. ElevenLabs-class API when keyed;
 * miss → text + audio_unavailable and the PWA speaks per-sentence via speechSynthesis
 * (chunk-per-sentence is the design in both tiers — the gateway does not stream).
 */
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { defineFn } from "./_fn.js";
import { MEDIA_DIR } from "../db.js";
import { signMediaUrl } from "../entities.js";

const Input = z.object({ sentences: z.array(z.string()), lang: z.string() });

export type TtsOut =
  | { audio_urls: string[]; tier: "elevenlabs" }
  | { audio_unavailable: true; tier: "browser"; sentences: string[] };

const VOICE_LANGS = new Set(["es", "ar", "zh", "ru", "ko", "fr", "pl", "en"]);

export const synthesize_speech = defineFn<z.infer<typeof Input>, TtsOut>("synthesize_speech", Input, async (input) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !VOICE_LANGS.has(input.lang)) {
    return { audio_unavailable: true, tier: "browser", sentences: input.sentences };
  }
  const urls: string[] = [];
  for (const sentence of input.sentences) {
    const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb", {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: sentence, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { audio_unavailable: true, tier: "browser", sentences: input.sentences };
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash("sha256").update(buf).digest("hex");
    writeFileSync(join(MEDIA_DIR, sha), buf);
    urls.push(signMediaUrl(sha));
  }
  return { audio_urls: urls, tier: "elevenlabs" };
});
