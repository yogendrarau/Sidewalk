import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  makeProvenance,
  requireSession,
  SUPPORTED_LOCALES,
} from "../../shared/demoCore.ts";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  locale: z.enum(SUPPORTED_LOCALES),
}).strict();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({
      ok: false,
      error: "Method not allowed.",
      error_code: "method_not_allowed",
      provenance: makeProvenance("unavailable", "SIDEWALK set_demo_locale"),
    }, { status: 405, headers: { Allow: "POST" } });
  }

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      ok: false,
      error: "Provide demo_session_id and a supported locale.",
      error_code: "invalid_request",
      provenance: makeProvenance(
        "unavailable",
        "SIDEWALK set_demo_locale input validator",
      ),
    }, { status: 400 });
  }

  const { demo_session_id: demoSessionId, locale } = parsed.data;
  const base44 = createClientFromRequest(req);
  try {
    const session = await requireSession(base44, demoSessionId);
    const vendors = await base44.asServiceRole.entities.DemoVendor.filter(
      { demo_session_id: demoSessionId },
      "-created_date",
      1,
      0,
    );
    const vendor = vendors?.[0];
    if (!vendor || vendor.is_fictional !== true) {
      return Response.json({
        ok: false,
        error: "The fictional demo vendor is unavailable.",
        error_code: "demo_vendor_unavailable",
        provenance: makeProvenance("unavailable", "SIDEWALK set_demo_locale"),
      }, { status: 409 });
    }

    await Promise.all([
      base44.asServiceRole.entities.DemoSession.update(session.id, {
        locale,
      }),
      base44.asServiceRole.entities.DemoVendor.update(vendor.id, {
        language: locale,
      }),
    ]);

    return Response.json({
      ok: true,
      data: {
        demo_session_id: demoSessionId,
        locale,
        vendor_language: locale,
      },
      provenance: makeProvenance(
        "fixture",
        "Session-scoped fictional SIDEWALK locale preference",
        { fixtureId: "rosa-v1" },
      ),
    });
  } catch (error) {
    console.error("set_demo_locale failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({
      ok: false,
      error: invalidSession
        ? "Invalid demo session."
        : "The demo language could not be changed.",
      error_code: invalidSession ? "invalid_session" : "locale_update_unavailable",
      provenance: makeProvenance("unavailable", "SIDEWALK set_demo_locale"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
