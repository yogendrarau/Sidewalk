import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import { makeProvenance, parseAmount, requireSession } from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  amount: z.union([z.number().finite(), z.string().trim().min(1).max(120)]),
  item_name: z.string().trim().min(1).max(200).optional(),
}).strict();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405, headers: { Allow: "POST" } });
  }
  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Provide demo_session_id and a valid demo amount.", provenance: makeProvenance("unavailable", "SIDEWALK complete_demo_checkout input validator") }, { status: 400 });
  }

  const input = parsed.data;
  const base44 = createClientFromRequest(req);
  try {
    await requireSession(base44, input.demo_session_id);
    const rawAmount = typeof input.amount === "number" ? input.amount : parseAmount(input.amount);
    const amount = rawAmount === null ? null : Math.round(rawAmount * 100) / 100;
    if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      return Response.json({ ok: false, error: "The amount must be between $0.01 and $1,000,000.", provenance: makeProvenance("unavailable", "SIDEWALK complete_demo_checkout input validator", { fallbackReason: "invalid_amount" }) }, { status: 400 });
    }

    const provenance = makeProvenance("simulated", "Simulated checkout; no payment or merchant service contacted");
    const evidence = await base44.asServiceRole.entities.DemoEvidenceRecord.create({
      demo_session_id: input.demo_session_id,
      amount,
      kind: "card_simulated",
      recorded_at: new Date().toISOString(),
      confirmed: true,
      note: (input.item_name ? input.item_name + " — " : "") + "DEMO card event; no money moved",
      provenance,
    });
    return Response.json({
      ok: true,
      data: {
        created: true,
        evidence,
        charged: false,
        caveat: "Simulated evidence; acceptance for licensing purposes is not guaranteed.",
      },
      provenance,
    });
  } catch (error) {
    console.error("complete_demo_checkout failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({ ok: false, error: invalidSession ? "Invalid demo session." : "Demo checkout could not be completed.", provenance: makeProvenance("unavailable", "SIDEWALK complete_demo_checkout") }, { status: invalidSession ? 404 : 500 });
  }
});
