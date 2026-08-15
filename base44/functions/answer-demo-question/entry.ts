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

const SourceSchema = z.object({
  label: z.string().min(1),
  reviewed_at: z.string().min(1),
  demo_only: z.literal(true),
}).strict();

const ProvenanceSchema = z.object({
  mode: z.enum(["live_public_readonly", "live_ai", "fixture", "simulated", "unavailable"]),
  source: z.string().min(1),
  retrievedAt: z.string().datetime({ offset: true }),
  datasetId: z.string().optional(),
  fixtureId: z.string().optional(),
  fallbackReason: z.string().optional(),
}).strict();

const InputSchema = z.object({
  session_code: z.string().trim().min(4).max(32).regex(/^[A-Z0-9]+$/i),
  question: z.string().trim().min(1).max(500),
  locale: z.enum(["es", "en"]).optional(),
}).strict();

const TraceItemSchema = z.object({
  ruleId: z.string(),
  citationLabel: z.string(),
  satisfied: z.boolean(),
}).strict();

const AnswerDataSchema = z.object({
  decision: z.enum(["answer", "abstain"]),
  intent: z.string(),
  locale: z.enum(["es", "en"]),
  answer_key: z.string().optional(),
  answer_text: z.string(),
  missing_facts: z.array(z.string()),
  trace: z.array(TraceItemSchema),
  rulebook_hash: z.string().regex(/^[a-f0-9]{64}$/),
  source: SourceSchema,
  preliminary_label: z.literal("PRELIMINARY DEMO GUIDANCE"),
  audio: z.null(),
}).strict();

const ServiceResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: AnswerDataSchema,
    provenance: ProvenanceSchema,
  }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.string().min(1),
    provenance: ProvenanceSchema,
  }).strict(),
]);

function serviceError(error, source) {
  return ServiceResultSchema.parse({
    ok: false,
    error,
    provenance: makeProvenance("unavailable", source),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json(
      serviceError("Method not allowed. Use POST.", "SIDEWALK answer-demo-question"),
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  let rawInput;
  try {
    rawInput = await req.json();
  } catch {
    return Response.json(
      serviceError("Request body must be valid JSON.", "SIDEWALK input validator"),
      { status: 400 },
    );
  }

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return Response.json(
      serviceError("Invalid request. Provide a demo session code and a question.", "SIDEWALK input validator"),
      { status: 400 },
    );
  }

  const input = parsed.data;
  const base44 = createClientFromRequest(req);

  try {
    const session = await requireSession(base44, input.session_code);
    const vendors = await base44.asServiceRole.entities.DemoVendor.filter(
      { demo_session_id: input.session_code },
      "-created_date",
      1,
      0,
    );
    const vendor = vendors?.[0] ?? null;
    const locale = input.locale ?? session.locale ?? vendor?.language;
    const safeLocale = locale === "en" ? "en" : "es";
    const intent = classifyIntent(input.question);

    const evaluation = evaluateDemo({
      intent,
      vendor_type: vendor?.vendor_type,
      has_sales_tax_certificate: vendor?.has_sales_tax_certificate,
    });
    const rulebookHash = await computeRulebookHash();
    const abstention = evaluation.decision === "abstain";
    const sourceLabel =
      evaluation.trace.find((item) => item.satisfied)?.citationLabel ??
      "SIDEWALK sample rulebook snapshot — no matching rule";
    const answerText = renderAnswer(evaluation.answerKey, safeLocale, abstention);
    const provenance = makeProvenance(
      "fixture",
      "SIDEWALK deterministic demo rulebook and prewritten localized templates",
      { fixtureId: "sidewalk-rulebook-v1" },
    );

    const data = AnswerDataSchema.parse({
      decision: evaluation.decision,
      intent,
      locale: safeLocale,
      answer_key: evaluation.answerKey,
      answer_text: answerText,
      missing_facts: evaluation.missingFacts,
      trace: evaluation.trace,
      rulebook_hash: rulebookHash,
      source: {
        label: sourceLabel,
        reviewed_at: "2026-08-15",
        demo_only: true,
      },
      preliminary_label: "PRELIMINARY DEMO GUIDANCE",
      audio: null,
    });

    await base44.asServiceRole.entities.DemoRuleEvaluation.create({
      demo_session_id: input.session_code,
      question: input.question,
      locale: safeLocale,
      intent,
      rulebook_hash: rulebookHash,
      answer_key: evaluation.answerKey,
      answer_text: answerText,
      trace: evaluation.trace,
      source: sourceLabel,
      abstention,
      provenance,
    });

    return Response.json(ServiceResultSchema.parse({ ok: true, data, provenance }));
  } catch (error) {
    console.error("answer-demo-question failed", error);
    const message =
      error instanceof Error && /session/i.test(error.message)
        ? "Invalid demo session."
        : "The demo guidance service is unavailable.";
    const status = message === "Invalid demo session." ? 404 : 500;
    return Response.json(serviceError(message, "SIDEWALK answer-demo-question"), { status });
  }
});
