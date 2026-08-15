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
    return Response.json({
      ok: true,
      data: {
        provider_modes: session.provider_modes,
        eval_runs: evalRuns,
        demonstrated: [
          "Fictional-data-only flows",
          "No immigration-status field",
          "Explicit cash confirmation",
          "No real payment, filing, messaging, or outreach calls",
          "Session-scoped queries and reset",
        ],
        production_design: [
          "Tenant isolation",
          "Expiring document links",
          "Encryption",
          "Deletion workflows",
          "Audit logs",
          "Independent security review",
        ],
        not_evaluated: [
          "Regulatory compliance",
          "Legal accuracy",
          "Production security",
          "Accessibility certification",
          "Real-world vendor outcomes",
        ],
      },
      provenance: makeProvenance("fixture", "Recorded prototype checks for this demo session", { fixtureId: "demo-eval-v1" }),
    });
  } catch (error) {
    console.error("get_demo_proof failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({ ok: false, error: invalidSession ? "Invalid demo session." : "Demo proof is unavailable.", provenance: makeProvenance("unavailable", "SIDEWALK get_demo_proof") }, { status: invalidSession ? 404 : 500 });
  }
});
