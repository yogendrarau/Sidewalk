import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import { makeProvenance, requireSession } from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
}).strict();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }
  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Provide demo_session_id.", provenance: makeProvenance("unavailable", "SIDEWALK get_demo_proof input validator") }, { status: 400 });
  }

  const demoSessionId = parsed.data.demo_session_id;
  const base44 = createClientFromRequest(req);
  try {
    const session = await requireSession(base44, demoSessionId);
    const evalRuns = await base44.asServiceRole.entities.DemoEvalRun.filter(
      { demo_session_id: demoSessionId },
      "created_date",
      100,
      0,
    );
    const demonstratedKeys = [
      "proof.demonstrated.fictional_data_only",
      "proof.demonstrated.no_immigration_field",
      "proof.demonstrated.cash_confirmation",
      "proof.demonstrated.no_external_actions",
      "proof.demonstrated.session_scope_and_reset",
    ];
    const productionDesignKeys = [
      "proof.production.tenant_isolation",
      "proof.production.expiring_document_links",
      "proof.production.encryption",
      "proof.production.deletion_workflows",
      "proof.production.audit_logs",
      "proof.production.security_review",
    ];
    const notEvaluatedKeys = [
      "proof.not_evaluated.regulatory_compliance",
      "proof.not_evaluated.legal_accuracy",
      "proof.not_evaluated.production_security",
      "proof.not_evaluated.accessibility_certification",
      "proof.not_evaluated.real_world_outcomes",
    ];
    return Response.json({
      ok: true,
      data: {
        provider_modes: session.provider_modes,
        eval_runs: evalRuns,
        demonstrated: demonstratedKeys,
        demonstrated_keys: demonstratedKeys,
        production_design: productionDesignKeys,
        production_design_keys: productionDesignKeys,
        not_evaluated: notEvaluatedKeys,
        not_evaluated_keys: notEvaluatedKeys,
      },
      provenance: makeProvenance("fixture", "Recorded prototype checks for this demo session", { fixtureId: "demo-eval-v1" }),
    });
  } catch (error) {
    console.error("get_demo_proof failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({ ok: false, error: invalidSession ? "Invalid demo session." : "Demo proof is unavailable.", provenance: makeProvenance("unavailable", "SIDEWALK get_demo_proof") }, { status: invalidSession ? 404 : 500 });
  }
});
