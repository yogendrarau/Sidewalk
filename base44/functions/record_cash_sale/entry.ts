import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  isSupportedLocale,
  makeProvenance,
  parseAmount,
  requireSession,
  SUPPORTED_LOCALES,
} from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  amount: z.union([
    z.number().finite(),
    z.string().trim().min(1).max(120),
  ]),
  confirmed: z.boolean(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  note: z.string().trim().max(500).optional(),
}).strict();

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
      error: "Provide demo_session_id, an amount, and an explicit confirmed flag.",
      error_code: "invalid_request",
      provenance: makeProvenance("unavailable", "SIDEWALK record_cash_sale input validator"),
    }, { status: 400 });
  }

  const input = parsed.data;
  const base44 = createClientFromRequest(req);

  try {
    const session = await requireSession(base44, input.demo_session_id);
    const locale = input.locale ?? session.locale;
    if (!isSupportedLocale(locale)) {
      return Response.json({
        ok: false,
        error: "The requested amount language is unavailable.",
        error_code: "unsupported_locale",
        provenance: makeProvenance("unavailable", "SIDEWALK cash language gate"),
      }, { status: 422 });
    }
    const parsedAmount =
      typeof input.amount === "number" ? input.amount : parseAmount(input.amount, locale);
    const amount =
      parsedAmount === null ? null : Math.round(parsedAmount * 100) / 100;

    if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return Response.json({
        ok: false,
        error: "The amount must be between $0.01 and $1,000,000.",
        error_code: "invalid_amount",
        provenance: makeProvenance(
          "unavailable",
          "SIDEWALK record_cash_sale input validator",
          { fallbackReason: "invalid_amount" },
        ),
      }, { status: 400 });
    }

    if (!input.confirmed) {
      return Response.json({
        ok: true,
        data: {
          created: false,
          requires_confirmation: true,
          amount,
          kind: "cash_self_reported",
          locale,
          prompt_key: "sales.confirm_cash_before_save",
        },
        provenance: makeProvenance("simulated", "Cash evidence pending explicit confirmation"),
      });
    }

    const recordedAt = new Date().toISOString();
    const provenance = makeProvenance(
      "simulated",
      "Confirmed self-reported demo cash evidence",
    );
    const evidence = await base44.asServiceRole.entities.DemoEvidenceRecord.create({
      demo_session_id: input.demo_session_id,
      amount,
      kind: "cash_self_reported",
      recorded_at: recordedAt,
      confirmed: true,
      ...(input.note ? { note: input.note } : {}),
      note_key: "sales.cash_self_reported_confirmed",
      provenance,
    });

    return Response.json({
      ok: true,
      data: {
        created: true,
        evidence,
        caveat_key: "sales.evidence_acceptance_not_guaranteed",
      },
      provenance,
    });
  } catch (error) {
    console.error("record_cash_sale failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({
      ok: false,
      error: invalidSession ? "Invalid demo session." : "Cash evidence could not be saved.",
      error_code: invalidSession ? "invalid_session" : "cash_evidence_unavailable",
      provenance: makeProvenance("unavailable", "SIDEWALK record_cash_sale"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
