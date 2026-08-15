import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  FIXTURES,
  makeProvenance,
  normalizeTicket,
  requireSession,
  sha256Hex,
} from "../../shared/demoCore.ts";

const ROSA_SUMMONS_SHA256 =
  "d1bf78fd52e0b6eb54cee3ac33d555ce74c02272ebb78b5fbca27351c6276b8a";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  image_url: z.string().url().max(2048),
}).strict();

function allowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "media.base44.com" || url.hostname.endsWith(".base44.app"));
  } catch {
    return false;
  }
}

async function imageHash(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("image_fetch_failed");
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_IMAGE_BYTES) throw new Error("image_too_large");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("image_too_large");
    return await sha256Hex(bytes);
  } finally {
    clearTimeout(timeout);
  }
}

async function replaceDocument(base44, demoSessionId, values) {
  await base44.asServiceRole.entities.DemoDocument.deleteMany({
    demo_session_id: demoSessionId,
    kind: "summons",
  });
  return await base44.asServiceRole.entities.DemoDocument.create({
    demo_session_id: demoSessionId,
    kind: "summons",
    source_image_url: values.imageUrl,
    sha256: values.sha256,
    extraction_status: values.status,
    provenance: values.provenance,
    ...(values.ticket ? { ticket_number: values.ticket } : {}),
  });
}

function timeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("live_ai_timeout")), milliseconds)
    ),
  ]);
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
  if (!parsed.success || !allowedImageUrl(parsed.data?.image_url)) {
    return Response.json({
      ok: false,
      error: "Provide demo_session_id and a Base44-hosted HTTPS image.",
      provenance: makeProvenance("unavailable", "SIDEWALK extract_summons input validator"),
    }, { status: 400 });
  }

  const input = parsed.data;
  const base44 = createClientFromRequest(req);

  try {
    await requireSession(base44, input.demo_session_id);

    let sha256 = null;
    try {
      sha256 = await imageHash(input.image_url);
    } catch (error) {
      console.warn("extract_summons hash check unavailable", error);
    }

    if (sha256 === ROSA_SUMMONS_SHA256) {
      const ticket = FIXTURES.summons.rosa_summons.ticket_number;
      const provenance = makeProvenance(
        "fixture",
        "Exact-byte match: bundled watermarked demo summons",
        { fixtureId: "rosa_summons" },
      );
      const document = await replaceDocument(base44, input.demo_session_id, {
        imageUrl: input.image_url,
        sha256,
        ticket,
        status: "extracted",
        provenance,
      });
      return Response.json({
        ok: true,
        data: {
          ticket_number: ticket,
          extraction_status: "extracted",
          sha256,
          document_id: document.id,
        },
        provenance,
      });
    }

    try {
      const result = await timeout(
        base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt:
            "Read only the field labeled TICKET NUMBER from this demo summons. " +
            "Return the exact alphanumeric value. If any character is unreadable or ambiguous, " +
            "return ticket_number as null and confidence as unclear. Never guess.",
          file_urls: [input.image_url],
          response_json_schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              ticket_number: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["clear", "unclear"] },
            },
            required: ["ticket_number", "confidence"],
          },
        }),
        8000,
      );

      const rawTicket =
        result?.ticket_number === null || result?.ticket_number === undefined
          ? null
          : String(result.ticket_number);
      const ticket =
        result?.confidence === "clear" ? normalizeTicket(rawTicket) : null;
      const status = ticket ? "extracted" : "unclear";
      const provenance = makeProvenance(
        "live_ai",
        "Base44 Core.InvokeLLM — constrained summons field extraction",
      );
      const document = await replaceDocument(base44, input.demo_session_id, {
        imageUrl: input.image_url,
        sha256: sha256 ?? "unavailable",
        ticket,
        status,
        provenance,
      });

      return Response.json({
        ok: true,
        data: {
          ticket_number: ticket,
          extraction_status: status,
          sha256,
          document_id: document.id,
        },
        provenance,
      });
    } catch (error) {
      console.error("extract_summons live extraction failed", error);
      return Response.json({
        ok: false,
        error: "Live extraction is unavailable. No ticket number was guessed.",
        provenance: makeProvenance(
          "unavailable",
          "Base44 Core.InvokeLLM — summons extraction",
          { fallbackReason: "live_ai_unavailable" },
        ),
      }, { status: 503 });
    }
  } catch (error) {
    console.error("extract_summons failed", error);
    const invalidSession = error instanceof Error && /session/i.test(error.message);
    return Response.json({
      ok: false,
      error: invalidSession ? "Invalid demo session." : "Summons extraction is unavailable.",
      provenance: makeProvenance("unavailable", "SIDEWALK extract_summons"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
