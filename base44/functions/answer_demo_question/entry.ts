import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  classifyIntent,
  computeRulebookHash,
  evaluateDemo,
  makeProvenance,
  renderAnswer,
  requireSession,
} from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  transcript: z.string().trim().min(1).max(500).optional(),
  question: z.string().trim().min(1).max(500).optional(),
  locale: z.enum(["es", "en"]).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.transcript && !value.question) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "transcript or question is required" });
  }
});

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const raw = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({
      ok: false,
      error: "Provide demo_session_id and a non-empty transcript or question.",
      provenance: makeProvenance("unavailable", "SIDEWALK answer_demo_question input validator"),
    }, { status: 400 });
  }

  const input = parsed.data;
  const base44 = createClientFromRequest(req);

  try {
    const session = await requireSession(base44, input.demo_session_id);
    const vendors = await base44.asServiceRole.entities.DemoVendor.filter(
      { demo_session_id: input.demo_session_id },
      "-created_date",
      1,
      0,
    );
    const vendor = vendors?.[0] ?? {};
    const question = input.transcript ?? input.question;
    const locale = input.locale ?? session.locale ?? vendor.language;
    const safeLocale = locale === "en" ? "en" : "es";
    const intent = classifyIntent(question);

    const evaluation = evaluateDemo({
      intent,
      vendor_type: vendor.vendor_type,
      has_sales_tax_certificate: vendor.has_sales_tax_certificate,
    });
    const rulebookHash = await computeRulebookHash();
    const abstention = evaluation.decision === "abstain";
    const answerText = renderAnswer(evaluation.answerKey, safeLocale, abstention);
    const matchedRule = evaluation.trace.find((item) => item.satisfied);
    const source = matchedRule?.citationLabel ??
      "SIDEWALK sample rulebook snapshot — no matching rule";
    const provenance = makeProvenance(
      "fixture",
      "SIDEWALK deterministic demo rulebook and prewritten localized templates",
      { fixtureId: "sidewalk-rulebook-v1" },
    );

    const recordData = {
      demo_session_id: input.demo_session_id,
      question,
      locale: safeLocale,
      intent,
      rulebook_hash: rulebookHash,
      answer_text: answerText,
      trace: JSON.stringify(evaluation.trace),
      missing_facts: evaluation.missingFacts,
      source,
      abstention,
      provenance,
      ...(evaluation.answerKey ? { answer_key: evaluation.answerKey } : {}),
    };
    const record = await base44.asServiceRole.entities.DemoRuleEvaluation.create(recordData);

    return Response.json({
      ok: true,
      data: {
        decision: evaluation.decision,
        intent,
        locale: safeLocale,
        answer_key: evaluation.answerKey ?? null,
        answer_text: answerText,
        missing_facts: evaluation.missingFacts,
        trace: evaluation.trace,
        rulebook_hash: rulebookHash,
        source: {
          label: source,
          reviewed_at: "2026-08-15",
          demo_only: true,
        },
        preliminary_label: "PRELIMINARY DEMO GUIDANCE",
        audio: null,
        evaluation_id: record.id,
      },
      provenance,
    });
  } catch (error) {
    console.error("answer_demo_question failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({
      ok: false,
      error: invalidSession ? "Invalid demo session." : "The demo guidance service is unavailable.",
      provenance: makeProvenance("unavailable", "SIDEWALK answer_demo_question"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
