import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  AUDIO_FIXTURE_HASHES,
  AUDIO_FIXTURES,
  isSupportedLocale,
  LOCALE_META,
  makeProvenance,
  requireSession,
  sha256Hex,
  SUPPORTED_LOCALES,
} from "../../shared/demoCore.ts";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

const InputSchema = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  audio_url: z.string().url().max(2048),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  device_validated: z.boolean().optional().default(false),
}).strict();

type TranscribeAudioResult = {
  text?: string;
  transcript?: string;
};

type TranscribeAudioCore = {
  TranscribeAudio: (
    input: { audio_url: string },
  ) => Promise<TranscribeAudioResult>;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label + " timeout")), ms)
    ),
  ]);
}

async function audioHashFromUrl(audioUrl: string): Promise<string> {
  const url = new URL(audioUrl);
  if (url.protocol !== "https:") throw new Error("audio_url must use HTTPS");

  const response = await withTimeout(fetch(url), 5000, "audio fixture fetch");
  if (!response.ok) throw new Error(`audio fetch returned ${response.status}`);
  const announcedLength = Number(response.headers.get("content-length") ?? "0");
  if (announcedLength > MAX_AUDIO_BYTES) throw new Error("audio file is too large");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("audio file is too large");
  return sha256Hex(bytes);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({
      ok: false,
      error: "Method not allowed.",
      error_code: "method_not_allowed",
      provenance: makeProvenance("unavailable", "SIDEWALK transcribe_audio"),
    }, { status: 405, headers: { Allow: "POST" } });
  }

  const parsed = InputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      ok: false,
      error: "Provide demo_session_id and a valid HTTPS audio_url.",
      error_code: "invalid_request",
      provenance: makeProvenance(
        "unavailable",
        "SIDEWALK transcribe_audio input validator",
      ),
    }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  const input = parsed.data;
  try {
    const session = await requireSession(base44, input.demo_session_id);
    const localeCandidate = input.locale ?? session.locale;
    if (!isSupportedLocale(localeCandidate)) {
      return Response.json({
        ok: false,
        error: "The requested speech language is unavailable.",
        error_code: "unsupported_locale",
        provenance: makeProvenance("unavailable", "SIDEWALK speech language gate", {
          fallbackReason: "unsupported_locale",
        }),
      }, { status: 422 });
    }
    const locale = localeCandidate;

    let hash: string | null = null;
    let hashFailureReason: string | null = null;
    try {
      hash = await audioHashFromUrl(input.audio_url);
    } catch (error) {
      hashFailureReason = error instanceof Error ? error.message : "audio_hash_failed";
    }

    if (hash) {
      const fixtureId = AUDIO_FIXTURE_HASHES[hash];
      const fixture = fixtureId ? AUDIO_FIXTURES[fixtureId] : null;
      if (fixture && fixture.locale === locale) {
        return Response.json({
          ok: true,
          data: {
            transcript: fixture.transcript,
            locale,
            kind: fixture.kind,
            fixture_id: fixtureId,
            audio_sha256: hash,
          },
          provenance: makeProvenance(
            "fixture",
            "Bundled localized audio fixture matched by exact SHA-256",
            { fixtureId },
          ),
        });
      }
      if (fixture && fixture.locale !== locale) {
        return Response.json({
          ok: false,
          error: "The sample audio does not match the selected language.",
          error_code: "fixture_locale_mismatch",
          provenance: makeProvenance("unavailable", "SIDEWALK exact audio fixture gate", {
            fallbackReason: `fixture_locale:${fixture.locale};selected_locale:${locale}`,
          }),
        }, { status: 422 });
      }
    }

    // The browser validates its device/locale combination. The server also keeps
    // a conservative allow-list; Wolof and untested locales remain fixture-first.
    if (!input.device_validated || !LOCALE_META[locale].liveSpeechValidated) {
      return Response.json({
        ok: false,
        error: "Live transcription is not validated for this language and device. Typed input remains available.",
        error_code: "live_asr_not_validated",
        provenance: makeProvenance("unavailable", "SIDEWALK live speech validation gate", {
          fallbackReason: locale === "wo"
            ? "wolof_fixture_first"
            : hashFailureReason ?? "unknown_audio_hash_or_unvalidated_device",
        }),
      }, { status: 503 });
    }

    try {
      const speechCore = base44.asServiceRole.integrations.Core as unknown as
        TranscribeAudioCore;
      const result = await withTimeout(
        speechCore.TranscribeAudio({
          audio_url: input.audio_url,
        }),
        8000,
        "ASR",
      );
      const transcript = String(result?.text ?? result?.transcript ?? "").trim();
      if (!transcript) throw new Error("ASR returned an empty transcript");
      return Response.json({
        ok: true,
        data: {
          transcript,
          locale,
          kind: "live_transcript",
          fixture_id: null,
          audio_sha256: hash,
        },
        provenance: makeProvenance(
          "live_ai",
          "Base44 Core.TranscribeAudio",
          hashFailureReason ? { fallbackReason: hashFailureReason } : undefined,
        ),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : "live_asr_failed";
      return Response.json({
        ok: false,
        error: "Live transcription is unavailable. Typed input and exact sample audio remain available.",
        error_code: "live_asr_unavailable",
        provenance: makeProvenance("unavailable", "Base44 Core.TranscribeAudio", {
          fallbackReason: reason,
        }),
      }, { status: 503 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const invalidSession = /session/i.test(message);
    return Response.json({
      ok: false,
      error: invalidSession ? "Invalid demo session." : "Transcription is unavailable.",
      error_code: invalidSession ? "invalid_session" : "transcription_unavailable",
      provenance: makeProvenance("unavailable", "SIDEWALK transcribe_audio"),
    }, { status: invalidSession ? 404 : 500 });
  }
});
