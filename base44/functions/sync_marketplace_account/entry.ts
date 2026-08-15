import { createClientFromRequest } from "npm:@base44/sdk";

const ACCOUNT_ROLES = new Set(["buyer", "vendor"]);
const SUPPORTED_LOCALES = new Set([
  "en",
  "es",
  "wo",
  "ar",
  "bn",
  "zh-Hans",
  "fr",
]);
const PROTOTYPE_ID_PATTERN = /^proto_[0-9a-f]{32}$/;
const MAX_BODY_BYTES = 1_024;

type Action = "get" | "upsert" | "delete";

type RequestBody = {
  action: Action;
  prototype_account_id: string;
  account_role?: "buyer" | "vendor";
  locale?: string;
  schema_version?: 1;
  is_fictional?: true;
  created_at?: string;
};

type EntityRecord = {
  id: string;
  schema_version: number;
  prototype_account_id: string;
  account_role: string;
  locale: string;
  is_fictional: boolean;
  prototype_created_at: string;
  last_synced_at: string;
  created_date?: string;
  updated_date?: string;
};

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function validateBody(value: unknown): RequestBody | null {
  if (!isPlainObject(value)) return null;

  const action = value.action;
  if (action !== "get" && action !== "upsert" && action !== "delete") {
    return null;
  }

  if (
    typeof value.prototype_account_id !== "string" ||
    !PROTOTYPE_ID_PATTERN.test(value.prototype_account_id)
  ) {
    return null;
  }

  if (action === "get" || action === "delete") {
    return hasExactKeys(value, ["action", "prototype_account_id"])
      ? {
        action,
        prototype_account_id: value.prototype_account_id,
      }
      : null;
  }

  const expectedKeys = [
    "action",
    "prototype_account_id",
    "account_role",
    "locale",
    "schema_version",
    "is_fictional",
    "created_at",
  ];

  if (
    !hasExactKeys(value, expectedKeys) ||
    typeof value.account_role !== "string" ||
    !ACCOUNT_ROLES.has(value.account_role) ||
    typeof value.locale !== "string" ||
    !SUPPORTED_LOCALES.has(value.locale) ||
    value.schema_version !== 1 ||
    value.is_fictional !== true ||
    !isIsoTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    action,
    prototype_account_id: value.prototype_account_id,
    account_role: value.account_role as "buyer" | "vendor",
    locale: value.locale,
    schema_version: 1,
    is_fictional: true,
    created_at: value.created_at,
  };
}

function publicRecord(record: EntityRecord) {
  return {
    schema_version: 1,
    prototype_account_id: record.prototype_account_id,
    account_role: record.account_role,
    locale: record.locale,
    is_fictional: true,
    created_at: record.prototype_created_at,
    updated_at: record.last_synced_at,
  };
}

function envelope(data: unknown, retrievedAt: string) {
  return {
    ok: true,
    data,
    persistence: "base44_synthetic",
    sync_status: "synced",
    provenance: {
      mode: "simulated",
      source: "Base44 MarketplacePrototypeAccount",
      retrievedAt,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "request_too_large" }, 413);
  }

  const bodyText = await req.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "request_too_large" }, 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const input = validateBody(parsed);
  if (!input) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const now = new Date().toISOString();
  const provenance = (data: unknown) => envelope(data, now);

  try {
    const base44 = createClientFromRequest(req);
    const entity = base44.asServiceRole.entities.MarketplacePrototypeAccount;

    if (input.action === "get") {
      const records = await entity.filter(
        { prototype_account_id: input.prototype_account_id },
        "-updated_date",
        1,
        0,
      ) as EntityRecord[];
      return json(provenance(records[0] ? publicRecord(records[0]) : null));
    }

    if (input.action === "delete") {
      const result = await entity.deleteMany({
        prototype_account_id: input.prototype_account_id,
      });
      return json(provenance({ deleted: result.deleted > 0 }));
    }

    const matches = await entity.filter(
      { prototype_account_id: input.prototype_account_id },
      "-updated_date",
      10,
      0,
    ) as EntityRecord[];

    const data = {
      schema_version: 1,
      prototype_account_id: input.prototype_account_id,
      account_role: input.account_role,
      locale: input.locale,
      is_fictional: true,
      prototype_created_at: matches[0]?.prototype_created_at ??
        input.created_at,
      last_synced_at: now,
    };

    let saved: EntityRecord;
    if (matches[0]) {
      saved = await entity.update(matches[0].id, data) as EntityRecord;
      if (matches.length > 1) {
        await Promise.all(
          matches.slice(1).map((record) => entity.delete(record.id)),
        );
      }
    } else {
      saved = await entity.create(data) as EntityRecord;
    }

    return json(provenance(publicRecord(saved)));
  } catch {
    return json({ ok: false, error: "base44_unavailable" }, 503);
  }
});
