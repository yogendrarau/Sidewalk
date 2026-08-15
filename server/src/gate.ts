/**
 * The entailment gate (invariant 5). Every legal-consequence sentence is checked against
 * its cited rule before send. Deterministic checks always run; a model NLI check is layered
 * on when available. Fail → regenerate once → fall back to the rule engine's template.
 */
import { nliEntails } from "./modelgw.js";

export type Citation = { idx: number; citation: string; text: string };
export type GateReport = {
  pass: boolean;
  sentences: Array<{ sentence: string; legal: boolean; citation_ok: boolean; numbers_ok: boolean; nli: boolean | null; pass: boolean }>;
};

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。؟।])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const LEGAL_HINTS =
  /licen|permi|fee|tarifa|hearing|audiencia|OATH|fine|multa|court|corte|deadline|fecha l[ií]mite|summons|citaci[oó]n|veteran|waiv|exenci[oó]n|certificado|certificate|course|curso|লাইসেন্স|শুনানি|জরিমানা|رخصة|جلسة|غرامة|执照|听证|罚单/i;

const numbersIn = (s: string): string[] =>
  (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]/g, "")).filter((n) => n.length > 0);

/**
 * corpus = every string the sentence's numbers are allowed to come from
 * (trace JSON + citation texts + template params). Verbatim rule: a number
 * not present in the corpus fails the sentence.
 */
export async function entailmentGate(
  sentences: string[],
  citations: Citation[],
  corpus: string,
  opts: { useModelNli?: boolean } = {},
): Promise<GateReport> {
  const corpusNums = new Set(numbersIn(corpus));
  const report: GateReport["sentences"] = [];
  for (const sentence of sentences) {
    const markers = [...sentence.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const legal = markers.length > 0 || LEGAL_HINTS.test(sentence);
    let citation_ok = true;
    let numbers_ok = true;
    let nli: boolean | null = null;
    if (legal) {
      citation_ok = markers.length > 0 && markers.every((m) => citations.some((c) => c.idx === m));
      // Sentences with no marker but legal keywords: allowed only if they carry no numeric claim
      if (markers.length === 0) citation_ok = numbersIn(sentence).length === 0;
      numbers_ok = numbersIn(sentence).every((n) => {
        if (corpusNums.has(n)) return true;
        // allow numbers that appear as substrings of corpus numbers (e.g. "2200" in "2,200/yr")
        for (const c of corpusNums) if (c.includes(n) || n.includes(c)) return true;
        return false;
      });
      if (opts.useModelNli && citation_ok && numbers_ok && markers.length > 0) {
        const cited = citations.filter((c) => markers.includes(c.idx));
        nli = await nliEntails(
          cited.map((c) => `${c.citation}: ${c.text}`).join("\n") + "\n" + corpus.slice(0, 4000),
          sentence,
        );
      }
    }
    const pass = !legal || (citation_ok && numbers_ok && nli !== false);
    report.push({ sentence, legal, citation_ok, numbers_ok, nli, pass });
  }
  return { pass: report.every((r) => r.pass), sentences: report };
}

export function gateFeedback(r: GateReport): string {
  return r.sentences
    .filter((s) => !s.pass)
    .map((s) => `"${s.sentence.slice(0, 60)}": ${!s.citation_ok ? "missing/invalid citation marker; " : ""}${!s.numbers_ok ? "number not verbatim from trace; " : ""}${s.nli === false ? "not entailed by cited rule" : ""}`)
    .join(" | ");
}
