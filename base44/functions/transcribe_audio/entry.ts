import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { requireSession, sha256Hex, makeProvenance, FIXTURES } from "../../shared/demoCore.ts";

const KNOWN_AUDIO_HASHES = {
  // hashes of bundled fixture audio would be listed here; demo uses explicit fixture flag
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + " timeout")), ms)),
  ]);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const session = await requireSession(base44, body.session_code);

    // Explicit sample/offline mode (honest fixture)
    if (body.use_fixture || body.fixture_id === "rosa_prepare_question") {
      const fx = FIXTURES.audio.rosa_prepare_question;
      return Response.json({
        ok: true,
        data: { transcript: fx.transcript },
        provenance: makeProvenance("fixture", "Bundled Spanish audio fixture", { fixtureId: "rosa_prepare_question" }),
      });
    }

    if (!body.audio_url) {
      return Response.json({
        ok: false,
        error: "No audio provided. Use sample mode for the offline demo.",
        provenance: makeProvenance("unavailable", "transcribe_audio", { fallbackReason: "no_audio_url" }),
      }, { status: 400 });
    }

    // Exact-hash fixture check
    let hash = null;
    try {
      const r = await fetch(body.audio_url);
      const buf = await r.arrayBuffer();
      hash = await sha256Hex(buf);
    } catch (e) {
      // proceed to live ASR
    }
    if (hash && KNOWN_AUDIO_HASHES[hash]) {
      const fx = FIXTURES.audio[KNOWN_AUDIO_HASHES[hash]];
      return Response.json({
        ok: true,
        data: { transcript: fx.transcript },
        provenance: makeProvenance("fixture", "Exact-hash audio fixture", { fixtureId: KNOWN_AUDIO_HASHES[hash] }),
      });
    }

    // Live ASR with 8s timeout
    try {
      const result = await withTimeout(
        base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: body.audio_url }),
        8000,
        "ASR"
      );
      const transcript = (result && (result.text || result.transcript)) || "";
      return Response.json({
        ok: true,
        data: { transcript },
        provenance: makeProvenance("live_ai", "Base44 Core.TranscribeAudio (Whisper)"),
      });
    } catch (err) {
      return Response.json({
        ok: false,
        error: "Live transcription unavailable. Use sample mode for the offline demo.",
        provenance: makeProvenance("unavailable", "Base44 Core.TranscribeAudio", { fallbackReason: err.message }),
      }, { status: 503 });
    }
  } catch (error) {
    return Response.json({ ok: false, error: error.message, provenance: makeProvenance("unavailable", "transcribe_audio") }, { status: error.message.includes("session") ? 400 : 500 });
  }
}