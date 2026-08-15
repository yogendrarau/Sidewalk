import { z } from "zod";
import { defineFn } from "./_fn.js";
import { loadRulebook } from "../rulebook.js";
import { evaluate, type CaseFacts, type Evaluation } from "../engine.js";
import { entities, type Ctx } from "../entities.js";

const Input = z.object({
  vendor_id: z.string(),
  case_id: z.string().optional(),
  question: z.string(),
  facts: z.object({
    vending_kind: z.enum(["food", "merchandise"]).optional(),
    wants: z.literal("license").optional(),
    instrument: z.enum(["civil_summons", "criminal_looking"]).optional(),
    topic: z.string().optional(),
    completed_steps: z.array(z.string()).optional(),
    documents_present: z.array(z.string()).optional(),
    is_veteran: z.boolean().optional(),
  }),
});

export type EvaluateOut = { evaluation: Evaluation; rule_evaluation_id: string };

export const evaluate_eligibility = defineFn<z.infer<typeof Input>, EvaluateOut>(
  "evaluate_eligibility",
  Input,
  async (input) => {
    const rb = loadRulebook();
    const evaluation = evaluate(rb, input.facts as CaseFacts);
    const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
    const row = entities.create(ctx, "RuleEvaluation", {
      vendor_id: input.vendor_id,
      case_id: input.case_id ?? null,
      question: input.question,
      rulebook_version: evaluation.rulebook_version,
      rules_fired: evaluation.rules_fired,
      answer: {
        track: evaluation.track,
        next_steps: evaluation.sequencer?.next_steps ?? [],
        missing_documents: evaluation.documents?.missing ?? [],
        fees: evaluation.fees,
      },
      abstained: evaluation.abstentions.length > 0 && evaluation.rules_fired.length === 0,
    });
    return { evaluation, rule_evaluation_id: row.id };
  },
);
