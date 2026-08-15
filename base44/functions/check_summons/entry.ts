import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  FIXTURES,
  makeProvenance,
  normalizeTicket,
  requireSession,
} from "../../shared/demoCore.ts";

const DATASET_ID = "jz4z-kudi";
const DATASET_NAME = "NYC Open Data — OATH Hearings Division Case Status";
const RESOURCE_ENDPOINT =
  "https://data.cityofnewyork.us/resource/" + DATASET_ID + ".json";
const METADATA_ENDPOINT =
  "https://data.cityofnewyork.us/api/views/metadata/v1/" + DATASET_ID;
const SAMPLE_DATASET_TIMESTAMP = "2026-08-15T04:35:20.000Z";

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  ticket_number: z.string().trim().min(1).max(32).optional(),
  source_mode: z.enum(["live", "sample"]).default("live"),
  fixture_id: z.literal("sample_found").optional(),
}).strict().superRefine((value, ctx) => {
  if (value.source_mode === "live" && !value.ticket_number) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ticket_number is required in live mode" });
  }
  if (value.source_mode === "sample" && value.fixture_id !== "sample_found") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sample mode requires fixture_id=sample_found" });
  }
});

const PublicRecordSchema = z.object({
  ticket_number: z.string(),
  violation_date: z.string().optional(),
  issuing_agency: z.string().optional(),
  violation_location_borough: z.string().optional(),
  hearing_status: z.string().optional(),
  hearing_result: z.string().optional(),
  hearing_date: z.string().optional(),
  hearing_time: z.string().optional(),
  decision_date: z.string().optional(),
  charge_1_code: z.string().optional(),
  charge_1_code_section: z.string().optional(),
  charge_1_code_description: z.string().optional(),
}).strict();

type StoredVerificationValues = {
  demoSessionId: string;
  ticket: string;
  result: "found" | "not_found" | "unavailable";
  datasetTimestamp: string;
  record: unknown | null;
  provenance: ReturnType<typeof makeProvenance>;
};

type VerificationStoreClient = {
  asServiceRole: {
    entities: {
      DemoVerificationCheck: {
        create: (values: Record<string, unknown>) => Promise<{ id: string }>;
      };
    };
  };
};

function socrataHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const appToken = Deno.env.get("NYC_OPEN_DATA_APP_TOKEN");
  if (appToken) headers["X-App-Token"] = appToken;
  return headers;
}

function buildResourceUrl(ticket: string): URL {
  const url = new URL(RESOURCE_ENDPOINT);
  url.searchParams.set("$select", [
    "ticket_number",
    "violation_date",
    "issuing_agency",
    "violation_location_borough",
    "hearing_status",
    "hearing_result",
    "hearing_date",
    "hearing_time",
    "decision_date",
    "charge_1_code",
    "charge_1_code_section",
    "charge_1_code_description",
  ].join(","));
  url.searchParams.set("$where", "ticket_number='" + ticket + "'");
  url.searchParams.set("$limit", "1");
  return url;
}

async function fetchJson(url: string | URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: socrataHeaders(),
    signal,
  });
  if (!response.ok) throw new Error("nyc_open_data_http_" + response.status);
  return await response.json();
}

async function liveLookup(ticket: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const [rawRows, rawMetadata] = await Promise.all([
      fetchJson(buildResourceUrl(ticket), controller.signal),
      fetchJson(METADATA_ENDPOINT, controller.signal),
    ]);
    const rows = z.array(PublicRecordSchema).parse(rawRows);
    const metadata = z.object({
      id: z.literal(DATASET_ID),
      dataUpdatedAt: z.string().min(1),
    }).passthrough().parse(rawMetadata);
    const datasetTimestamp = new Date(metadata.dataUpdatedAt).toISOString();
    return { rows, datasetTimestamp };
  } finally {
    clearTimeout(timeout);
  }
}

async function storeCheck(base44: unknown, values: StoredVerificationValues) {
  const client = base44 as VerificationStoreClient;
  return await client.asServiceRole.entities.DemoVerificationCheck.create({
    demo_session_id: values.demoSessionId,
    ticket_number: values.ticket,
    normalized_ticket: values.ticket,
    result: values.result,
    dataset_timestamp: values.datasetTimestamp,
    provenance: values.provenance,
    ...(values.record ? { record_data: values.record } : {}),
  });
}

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
      error: "Provide demo_session_id and a valid live or explicit sample request.",
      provenance: makeProvenance("unavailable", "SIDEWALK check_summons input validator"),
    }, { status: 400 });
  }

  const input = parsed.data;
  const base44 = createClientFromRequest(req);

  try {
    await requireSession(base44, input.demo_session_id);

    if (input.source_mode === "sample") {
      const fixture = FIXTURES.verification.sample_found;
      const provenance = makeProvenance(
        "fixture",
        "Redacted fictional OATH result selected explicitly by the user",
        { datasetId: DATASET_ID, fixtureId: "sample_found" },
      );
      const record = PublicRecordSchema.parse(fixture.record);
      const check = await storeCheck(base44, {
        demoSessionId: input.demo_session_id,
        ticket: fixture.ticket_number,
        result: "found",
        datasetTimestamp: SAMPLE_DATASET_TIMESTAMP,
        record,
        provenance,
      });
      return Response.json({
        ok: true,
        data: {
          result: "found",
          normalized_ticket: fixture.ticket_number,
          record_data: record,
          dataset_timestamp: SAMPLE_DATASET_TIMESTAMP,
          verification_id: check.id,
          message: "This is a redacted fictional sample result, not a live record.",
        },
        provenance,
      });
    }

    const normalized = normalizeTicket(input.ticket_number);
    if (!normalized) {
      return Response.json({
        ok: false,
        error: "The ticket number is invalid or unclear. Confirm every character before checking.",
        provenance: makeProvenance(
          "unavailable",
          "SIDEWALK check_summons input validator",
          { fallbackReason: "invalid_ticket" },
        ),
      }, { status: 400 });
    }

    try {
      const { rows, datasetTimestamp } = await liveLookup(normalized);
      const checkedAt = new Date().toISOString();
      const provenance = makeProvenance(
        "live_public_readonly",
        DATASET_NAME,
        { datasetId: DATASET_ID },
      );

      if (rows.length === 0) {
        const check = await storeCheck(base44, {
          demoSessionId: input.demo_session_id,
          ticket: normalized,
          result: "not_found",
          datasetTimestamp,
          record: null,
          provenance,
        });
        return Response.json({
          ok: true,
          data: {
            result: "not_found",
            normalized_ticket: normalized,
            record_data: null,
            dataset_timestamp: datasetTimestamp,
            checked_at: checkedAt,
            verification_id: check.id,
            message:
              "No record was returned by NYC Open Data when checked at " +
              checkedAt +
              ". This does not establish that the notice is fake or invalid.",
          },
          provenance,
        });
      }

      const record = rows[0];
      const check = await storeCheck(base44, {
        demoSessionId: input.demo_session_id,
        ticket: normalized,
        result: "found",
        datasetTimestamp,
        record,
        provenance,
      });
      return Response.json({
        ok: true,
        data: {
          result: "found",
          normalized_ticket: normalized,
          record_data: record,
          dataset_timestamp: datasetTimestamp,
          checked_at: checkedAt,
          verification_id: check.id,
          message:
            "NYC Open Data returned a record. Confirm dates and instructions with OATH.",
        },
        provenance,
      });
    } catch (error) {
      console.error("check_summons live lookup failed", error);
      const provenance = makeProvenance(
        "unavailable",
        DATASET_NAME,
        { datasetId: DATASET_ID, fallbackReason: "public_source_unavailable" },
      );
      const attemptedAt = provenance.retrievedAt;
      await storeCheck(base44, {
        demoSessionId: input.demo_session_id,
        ticket: normalized,
        result: "unavailable",
        datasetTimestamp: attemptedAt,
        record: null,
        provenance,
      });
      return Response.json({
        ok: false,
        error:
          "Public source unavailable. No conclusion was made about this notice. You may explicitly request the sample result.",
        provenance,
      });
    }
  } catch (error) {
    console.error("check_summons failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({
      ok: false,
      error: invalidSession ? "Invalid demo session." : "Summons checking is unavailable.",
      provenance: makeProvenance("unavailable", "SIDEWALK check_summons"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
