import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  classifyIntent,
  computeRulebookHash,
  evaluateDemo,
  hasGuidanceTranslation,
  isSupportedLocale,
  makeProvenance,
  renderAnswer,
  requireSession,
  SUPPORTED_LOCALES,
} from "../../shared/demoCore.ts";

const NonEmptyTranscript = z.string().max(500).refine(
  (value) => value.trim().length > 0,
  "must contain non-whitespace text",
);

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  transcript: NonEmptyTranscript.optional(),
  question: NonEmptyTranscript.optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.transcript && !value.question) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "transcript or question is required",
    });
  }
});

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({
      ok: false,
      error: "Method not allowed.",
      error_code: "method_not_allowed",
      provenance: makeProvenance("unavailable", "SIDEWALK answer_demo_question"),
    }, {
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
      error_code: "invalid_request",
      provenance: makeProvenance(
        "unavailable",
        "SIDEWALK answer_demo_question input validator",
      ),
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
    const transcriptOriginal = input.transcript ?? input.question;
    const localeCandidate = input.locale ?? session.locale ?? vendor.language;

    // Legal/safety answers never fall back to another language.
    if (!isSupportedLocale(localeCandidate)) {
      return Response.json({
        ok: false,
        error: "The requested guidance language is unavailable.",
        error_code: "unsupported_locale",
        provenance: makeProvenance(
          "unavailable",
          "SIDEWALK deterministic guidance language gate",
          { fallbackReason: "unsupported_locale" },
        ),
      }, { status: 422 });
    }
    const locale = localeCandidate;
    const intent = classifyIntent(transcriptOriginal, locale);

    const evaluation = evaluateDemo({
      intent,
      vendor_type: vendor.vendor_type,
      has_sales_tax_certificate: vendor.has_sales_tax_certificate,
    });
    const computedRulebookHash = await computeRulebookHash();
    if (computedRulebookHash !== evaluation.rulebookHash) {
      throw new Error("Deterministic rulebook hash mismatch");
    }

    const matchedRule = evaluation.trace.find((item) => item.satisfied);
    const translationMissing = evaluation.decision === "answer" &&
      !hasGuidanceTranslation(evaluation.answerKey, locale);
    const decision = translationMissing ? "abstain" : evaluation.decision;
    const abstention = decision === "abstain";
    const effectiveAnswerKey = abstention ? undefined : evaluation.answerKey;
    const answerText = renderAnswer(effectiveAnswerKey, locale, abstention);
    const answerTextEnglish = renderAnswer(effectiveAnswerKey, "en", abstention);

    // A supported locale missing even its abstention copy is a hard failure.
    if (!answerText || !answerTextEnglish) {
      return Response.json({
        ok: false,
        error: "A required guidance translation is unavailable.",
        error_code: "missing_translation",
        provenance: makeProvenance(
          "unavailable",
          "SIDEWALK deterministic guidance templates",
          { fallbackReason: `missing_translation:${locale}` },
        ),
      }, { status: 503 });
    }

    const errorCode = translationMissing
      ? "missing_translation"
      : intent === "unknown"
      ? "unknown_intent"
      : evaluation.missingFacts.length > 0
      ? "missing_facts"
      : null;
    const source = matchedRule?.citationLabel ??
      "SIDEWALK sample rulebook snapshot — no matching rule";
    const provenance = makeProvenance(
      "fixture",
      "SIDEWALK deterministic demo rulebook and prewritten localized templates",
      { fixtureId: "sidewalk-rulebook-v1" },
    );
    const answerKey = abstention ? null : evaluation.answerKey ?? null;

    const recordData = {
      demo_session_id: input.demo_session_id,
      question: transcriptOriginal,
      original_transcript: transcriptOriginal,
      locale,
      intent,
      decision,
      rulebook_hash: computedRulebookHash,
      answer_text: answerText,
      answer_text_en: answerTextEnglish,
      trace: JSON.stringify(evaluation.trace),
      missing_facts: evaluation.missingFacts,
      source,
      abstention,
      provenance,
      ...(answerKey ? { answer_key: answerKey } : {}),
      ...(errorCode ? { error_code: errorCode } : {}),
    };
    const record = await base44.asServiceRole.entities.DemoRuleEvaluation.create(
      recordData,
    );

    const responseAudio = abstention
      ? {
        mode: "unavailable",
        source: "No bundled abstention audio in this prototype",
        fixture_id: null,
        public_path: null,
      }
      : {
        mode: "fixture",
        source: "Bundled localized response audio",
        fixture_id: `prepare_response_${locale === "zh-Hans" ? "zh_hans" : locale}`,
        public_path: `/audio/${locale}/prepare-response.mp3`,
      };

    return Response.json({
      ok: true,
      data: {
        decision,
        intent,
        locale,
        transcript_original: transcriptOriginal,
        answer_key: answerKey,
        answer_text: answerText,
        answer_text_en: answerTextEnglish,
        error_code: errorCode,
        missing_facts: evaluation.missingFacts,
        trace: evaluation.trace,
        rulebook_hash: computedRulebookHash,
        source: {
          label: source,
          reviewed_at: "2026-08-15",
          demo_only: true,
        },
        preliminary_label_key: "guidance.preliminary_demo_guidance",
        audio: responseAudio,
        evaluation_id: record.id,
      },
      provenance,
    });
  } catch (error) {
    console.error("answer_demo_question failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({
      ok: false,
      error: invalidSession
        ? "Invalid demo session."
        : "The demo guidance service is unavailable.",
      error_code: invalidSession ? "invalid_session" : "guidance_unavailable",
      provenance: makeProvenance("unavailable", "SIDEWALK answer_demo_question"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
