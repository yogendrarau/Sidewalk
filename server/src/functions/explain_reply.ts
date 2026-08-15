/**
 * explain_reply (§9): trace + cited rule texts + glossary → narration → per-sentence
 * entailment gate → regenerate once → template fallback.
 * Returns {text, citations[], gate_report, tier}.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { narrate, hasAnthropic } from "../modelgw.js";
import { entailmentGate, gateFeedback, splitSentences, type Citation } from "../gate.js";
import { renderTemplate } from "../templates.js";

const Input = z.object({
  lang: z.string(),
  question: z.string(),
  template_key: z.string(),
  template_params: z.record(z.string(), z.unknown()),
  citations: z.array(z.object({ idx: z.number(), citation: z.string(), text: z.string() })),
  trace: z.unknown(),
  freshness: z.string().optional(), // dataset publication timestamp for city-data answers
  prefer_template: z.boolean().optional(), // deterministic paths (heat_watch etc.) skip the model
});

export type ExplainOut = {
  text: string;
  sentences: string[];
  citations: Citation[];
  gate_report: unknown;
  tier: "llm" | "template";
  lang_used: string;
  lang_fallback: boolean;
  freshness?: string;
};

export const explain_reply = defineFn<z.infer<typeof Input>, ExplainOut>("explain_reply", Input, async (input) => {
  const corpus = JSON.stringify(input.trace) + "\n" + input.citations.map((c) => `${c.citation} ${c.text}`).join("\n") + "\n" + JSON.stringify(input.template_params);

  // Tier 1: LLM narration under the gate (regenerate once on failure)
  if (!input.prefer_template && hasAnthropic()) {
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const draft = await narrate({
        lang: input.lang, question: input.question, trace: input.trace, citations: input.citations, feedback,
      });
      if (!draft) break;
      const sentences = splitSentences(draft);
      const report = await entailmentGate(sentences, input.citations, corpus, { useModelNli: true });
      if (report.pass) {
        return {
          text: draft, sentences, citations: input.citations, gate_report: report,
          tier: "llm", lang_used: input.lang, lang_fallback: false, freshness: input.freshness,
        };
      }
      feedback = gateFeedback(report);
    }
  }

  // Final tier: the rule engine's template (constructed from the trace → passes by construction)
  const t = renderTemplate(input.lang, input.template_key, input.template_params);
  const report = await entailmentGate(t.sentences, input.citations, corpus, { useModelNli: false });
  return {
    text: t.sentences.join(" "), sentences: t.sentences, citations: input.citations, gate_report: report,
    tier: "template", lang_used: t.lang_used, lang_fallback: t.lang_fallback, freshness: input.freshness,
  };
});
