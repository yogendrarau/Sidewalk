import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  DEFAULT_VENDOR_LOCALE,
  evalRunsSeed,
  generateCode,
  makeProvenance,
  rosaSeed,
  SUPPORTED_LOCALES,
} from "../../shared/demoCore.ts";

const InputSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).optional(),
}).strict();

const PROVIDER_MODES = {
  speech: "live_ai_with_exact_fixture_fallback",
  speech_locales: {
    en: "live_ai_validated_with_exact_fixture_fallback",
    es: "live_ai_validated_with_exact_fixture_fallback",
    wo: "fixture_first",
    ar: "fixture_until_validated",
    bn: "fixture_until_validated",
    "zh-Hans": "fixture_until_validated",
    fr: "fixture_until_validated",
  },
  extraction: "live_ai_with_exact_fixture_fallback",
  legal: "deterministic_rulebook",
  nyc_lookup: "live_public_readonly",
  payments: "simulated_only",
  messaging: "preview_only",
};

type SessionLookupClient = {
  asServiceRole: {
    entities: {
      DemoSession: {
        filter: (
          query: { demo_session_id: string },
          sort: string,
          limit: number,
          skip: number,
        ) => Promise<unknown[]>;
      };
    };
  };
};

type SeedCleanupClient = {
  asServiceRole: {
    entities: Record<
      string,
      { deleteMany: (query: { demo_session_id: string }) => Promise<unknown> }
    >;
  };
};

async function unusedCode(base44: unknown): Promise<string> {
  const client = base44 as SessionLookupClient;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateCode(6);
    const matches = await client.asServiceRole.entities.DemoSession.filter(
      { demo_session_id: code },
      "-created_date",
      1,
      0,
    );
    if (!matches?.length) return code;
  }
  throw new Error("Could not allocate a unique demo session");
}

async function removePartialSeed(
  base44: unknown,
  demoSessionId: string,
): Promise<void> {
  const client = base44 as SeedCleanupClient;
  const entities = [
    "DemoEvalRun",
    "DemoEvidenceRecord",
    "DemoVerificationCheck",
    "DemoRuleEvaluation",
    "DemoDocument",
    "DemoVendor",
    "DemoSession",
  ];
  await Promise.allSettled(
    entities.map((name) =>
      client.asServiceRole.entities[name].deleteMany({ demo_session_id: demoSessionId })
    ),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({
      ok: false,
      error: "Invalid start_demo_session request.",
      error_code: "invalid_request",
      provenance: makeProvenance("unavailable", "SIDEWALK start_demo_session input validator"),
    }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  let code = null;
  try {
    const locale = parsed.data.locale ?? DEFAULT_VENDOR_LOCALE;
    code = await unusedCode(base44);
    const now = new Date().toISOString();
    const provenance = makeProvenance("fixture", "Shared synthetic SIDEWALK demo session", {
      fixtureId: "rosa-v1",
    });

    await base44.asServiceRole.entities.DemoSession.create({
      demo_session_id: code,
      code,
      locale,
      provider_modes: PROVIDER_MODES,
      started_at: now,
    });

    const seed = rosaSeed(code, locale);
    await Promise.all([
      base44.asServiceRole.entities.DemoVendor.create(seed.vendor),
      base44.asServiceRole.entities.DemoDocument.create(seed.document),
      base44.asServiceRole.entities.DemoEvidenceRecord.bulkCreate(seed.evidence),
      base44.asServiceRole.entities.DemoEvalRun.bulkCreate(evalRunsSeed(code)),
    ]);

    return Response.json({
      ok: true,
      data: {
        demo_session_id: code,
        session_code: code,
        locale,
        started_at: now,
        qr_url: "/?view=vendor&demo_session_id=" + encodeURIComponent(code) +
          "&lang=" + encodeURIComponent(locale),
      },
      provenance,
    });
  } catch (error) {
    console.error("start_demo_session failed", error);
    if (code) await removePartialSeed(base44, code);
    return Response.json({
      ok: false,
      error: "Unable to start the demo session.",
      error_code: "session_start_unavailable",
      provenance: makeProvenance("unavailable", "SIDEWALK start_demo_session"),
    }, { status: 500 });
  }
});
