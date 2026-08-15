import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import { makeProvenance, requireSession } from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
}).strict();

function expandEvaluation(record: unknown) {
  const evaluation = record as { trace?: unknown; [key: string]: unknown };
  let trace = [];
  try {
    trace = typeof evaluation.trace === "string"
      ? JSON.parse(evaluation.trace)
      : evaluation.trace ?? [];
  } catch {
    trace = [];
  }
  return { ...evaluation, trace };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }
  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Provide demo_session_id.", provenance: makeProvenance("unavailable", "SIDEWALK get_demo_case input validator") }, { status: 400 });
  }

  const demoSessionId = parsed.data.demo_session_id;
  const base44 = createClientFromRequest(req);
  try {
    const session = await requireSession(base44, demoSessionId);
    const [vendors, documents, evaluations, verifications, evidence] = await Promise.all([
      base44.asServiceRole.entities.DemoVendor.filter({ demo_session_id: demoSessionId }, "-created_date", 1, 0),
      base44.asServiceRole.entities.DemoDocument.filter({ demo_session_id: demoSessionId }, "-created_date", 20, 0),
      base44.asServiceRole.entities.DemoRuleEvaluation.filter({ demo_session_id: demoSessionId }, "-created_date", 20, 0),
      base44.asServiceRole.entities.DemoVerificationCheck.filter({ demo_session_id: demoSessionId }, "-created_date", 20, 0),
      base44.asServiceRole.entities.DemoEvidenceRecord.filter({ demo_session_id: demoSessionId }, "-created_date", 50, 0),
    ]);

    return Response.json({
      ok: true,
      data: {
        session: {
          demo_session_id: demoSessionId,
          code: session.code,
          locale: session.locale,
          provider_modes: session.provider_modes,
          started_at: session.started_at,
          reset_at: session.reset_at ?? null,
        },
        vendor: vendors?.[0] ?? null,
        documents,
        evaluations: evaluations.map(expandEvaluation),
        verifications,
        evidence,
        latest_interactions: [
          ...evaluations.map((item) => ({ type: "guidance", at: item.created_date, item: expandEvaluation(item) })),
          ...verifications.map((item) => ({ type: "verification", at: item.created_date, item })),
          ...evidence.map((item) => ({ type: "evidence", at: item.created_date, item })),
        ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12),
      },
      provenance: makeProvenance("fixture", "Session-scoped synthetic Base44 case data", { fixtureId: "rosa-v1" }),
    });
  } catch (error) {
    console.error("get_demo_case failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({ ok: false, error: invalidSession ? "Invalid demo session." : "Demo case is unavailable.", provenance: makeProvenance("unavailable", "SIDEWALK get_demo_case") }, { status: invalidSession ? 404 : 500 });
  }
});
