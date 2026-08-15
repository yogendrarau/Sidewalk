import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  evalRunsSeed,
  makeProvenance,
  requireSession,
  rosaSeed,
} from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
}).strict();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }
  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Provide demo_session_id.", provenance: makeProvenance("unavailable", "SIDEWALK reset_demo_session input validator") }, { status: 400 });
  }

  const demoSessionId = parsed.data.demo_session_id;
  const base44 = createClientFromRequest(req);
  try {
    const session = await requireSession(base44, demoSessionId);
    await Promise.all([
      base44.asServiceRole.entities.DemoEvalRun.deleteMany({ demo_session_id: demoSessionId }),
      base44.asServiceRole.entities.DemoEvidenceRecord.deleteMany({ demo_session_id: demoSessionId }),
      base44.asServiceRole.entities.DemoVerificationCheck.deleteMany({ demo_session_id: demoSessionId }),
      base44.asServiceRole.entities.DemoRuleEvaluation.deleteMany({ demo_session_id: demoSessionId }),
      base44.asServiceRole.entities.DemoDocument.deleteMany({ demo_session_id: demoSessionId }),
      base44.asServiceRole.entities.DemoVendor.deleteMany({ demo_session_id: demoSessionId }),
    ]);

    const seed = rosaSeed(demoSessionId, session.locale);
    await Promise.all([
      base44.asServiceRole.entities.DemoVendor.create(seed.vendor),
      base44.asServiceRole.entities.DemoDocument.create(seed.document),
      base44.asServiceRole.entities.DemoEvidenceRecord.bulkCreate(seed.evidence),
      base44.asServiceRole.entities.DemoEvalRun.bulkCreate(evalRunsSeed(demoSessionId)),
    ]);

    const resetAt = new Date().toISOString();
    await base44.asServiceRole.entities.DemoSession.update(session.id, {
      demo_session_id: demoSessionId,
      code: demoSessionId,
      locale: seed.vendor.language,
      reset_at: resetAt,
    });

    return Response.json({
      ok: true,
      data: {
        reset: true,
        demo_session_id: demoSessionId,
        session_code: demoSessionId,
        locale: seed.vendor.language,
        reset_at: resetAt,
      },
      provenance: makeProvenance("fixture", "Idempotent reset to Rosa's seeded demo state", { fixtureId: "rosa-v1" }),
    });
  } catch (error) {
    console.error("reset_demo_session failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({ ok: false, error: invalidSession ? "Invalid demo session." : "Demo session could not be reset.", provenance: makeProvenance("unavailable", "SIDEWALK reset_demo_session") }, { status: invalidSession ? 404 : 500 });
  }
});
