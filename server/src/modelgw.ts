/**
 * Model gateway (the local stand-in for Base44's AI Gateway).
 * Models do exactly four jobs here: transcribe, synthesize, extract into schemas,
 * narrate rule outputs. Everything degrades to the fallback tier when keys are absent.
 * Prompts load from prompts/ at runtime — never inlined (§13).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT } from "./db.js";
import { env } from "./env.js";

const prompt = (name: string) => readFileSync(join(ROOT, "prompts", `${name}.txt`), "utf8");

export const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);
let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());
const MODEL = () => env("ANTHROPIC_MODEL", "claude-opus-5");

const GLOSSARY =
  "OATH: the city's administrative court, public case file. DCWP/DOHMH/SBS/OSVS: city agencies; OSVS is the vendor office. " +
  "Supervisory license: the presence-required license class. Permit: attaches to the cart; license: attaches to the person.";

/** Narration tier 1: Gateway LLM under explainer.txt. Returns null when unavailable/failed. */
export async function narrate(input: {
  lang: string;
  question: string;
  trace: unknown;
  citations: Array<{ idx: number; citation: string; text: string }>;
  feedback?: string;
}): Promise<string | null> {
  if (!hasAnthropic()) return null;
  try {
    const sys = prompt("explainer").replaceAll("{lang}", input.lang);
    const res = await client().messages.create({
      model: MODEL(),
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: sys,
      messages: [
        {
          role: "user",
          content:
            `Question: ${input.question}\n\nRule-engine trace (the only source of facts):\n${JSON.stringify(input.trace, null, 1)}\n\n` +
            `Citations (mark each legal-fact sentence with its index):\n${input.citations.map((c) => `[${c.idx}] ${c.citation} — ${c.text}`).join("\n")}\n\n` +
            `Glossary: ${GLOSSARY}` +
            (input.feedback ? `\n\nYour previous draft failed the entailment gate: ${input.feedback}. Regenerate, fixing only that.` : ""),
        },
      ],
    });
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  } catch {
    return null;
  }
}

/** Entailment check tier: NLI_ENDPOINT (DeBERTa-class) → Claude strict judgment → null (deterministic checks only). */
export async function nliEntails(premise: string, hypothesis: string): Promise<boolean | null> {
  const ep = process.env.NLI_ENDPOINT;
  if (ep) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ premise, hypothesis }),
        signal: AbortSignal.timeout(5000),
      });
      const out = (await res.json()) as { label?: string };
      return out.label === "entailment";
    } catch { /* fall through */ }
  }
  if (!hasAnthropic()) return null;
  try {
    const res = await client().messages.create({
      model: MODEL(),
      max_tokens: 512,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { entailed: { type: "boolean" } },
            required: ["entailed"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Premise (rule text and trace):\n${premise}\n\nHypothesis (one reply sentence):\n${hypothesis}\n\nIs the hypothesis fully supported by the premise, with numbers and dates verbatim? Answer strictly.`,
        },
      ],
    });
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    return (JSON.parse(block.text) as { entailed: boolean }).entailed;
  } catch {
    return null;
  }
}

export type ExtractionResult = {
  fields: Record<string, string | null>;
  model_tier: "vlm" | "fixture" | "manual";
};

/**
 * Extraction tier 1 (vlm): quarantined, TOOL-LESS, schema-constrained vision extraction.
 * The raw document text never reaches any planning context — only these fields do (invariant 11).
 */
export async function extractFromImage(input: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  schema: { name: string; properties: Record<string, { type: string; description: string }> };
}): Promise<ExtractionResult | null> {
  if (!hasAnthropic()) return null;
  try {
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.schema.properties)) {
      properties[k] = { type: [v.type, "null"], description: v.description };
    }
    const res = await client().messages.create({
      model: MODEL(),
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
        },
      },
      system: prompt("extractor"),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 } },
            { type: "text", text: `Schema: ${input.schema.name}. Extract only what is clearly legible; null otherwise.` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    return { fields: JSON.parse(block.text) as Record<string, string | null>, model_tier: "vlm" };
  } catch {
    return null;
  }
}

/** Translation for T2/T3 languages (glossary-locked, honesty line appended by caller). */
export async function translateReply(text: string, lang: string): Promise<string | null> {
  if (!hasAnthropic()) return null;
  try {
    const res = await client().messages.create({
      model: MODEL(),
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: prompt("translate").replaceAll("{lang}", lang).replaceAll("{glossary}", GLOSSARY).replaceAll("{machine_translation_honesty_line}", ""),
      messages: [{ role: "user", content: text }],
    });
    if (res.stop_reason === "refusal") return null;
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : null;
  } catch {
    return null;
  }
}
