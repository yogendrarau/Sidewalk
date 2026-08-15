import { useState, useRef } from "react";
import { Mic, Square, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/sidewalk";

export default function VoiceRecorder({
  sessionCode,
  onTranscript,
  sampleFixtureId = "rosa_prepare_question",
  sampleLabel = "Usar pregunta de muestra",
  busyLabel = "Procesando…",
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        transcribeBlob(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e) {
      setError("No se pudo acceder al micrófono. Use el modo de muestra.");
    }
  };

  const stop = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    setRecording(false);
  };

  const transcribeBlob = async (blob) => {
    setBusy(true);
    setError(null);
    try {
      const file = new File([blob], "voice.webm", { type: blob.type });
      const audioUrl = await api.uploadFile(file);
      const res = await api.transcribe({ session_code: sessionCode, audio_url: audioUrl });
      if (res.ok) onTranscript(res.data.transcript, res.provenance);
      else setError(res.error || "No se pudo transcribir.");
    } catch (e) {
      setError("No se pudo transcribir. Use el modo de muestra.");
    } finally {
      setBusy(false);
    }
  };

  const useSample = async () => {
    setBusy(true);
    setError(null);
    const res = await api.transcribe({ session_code: sessionCode, use_fixture: true, fixture_id: sampleFixtureId });
    setBusy(false);
    if (res.ok) onTranscript(res.data.transcript, res.provenance);
    else setError(res.error || "No se pudo cargar la muestra.");
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={recording ? stop : start}
        disabled={busy}
        className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
          recording ? "bg-rose-500 scale-105" : "bg-amber-600 hover:bg-amber-700"
        } disabled:opacity-50`}
        aria-label={recording ? "Detener grabación" : "Hablar"}
      >
        {busy ? (
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        ) : recording ? (
          <Square className="h-7 w-7 text-white fill-white" />
        ) : (
          <Mic className="h-8 w-8 text-white" />
        )}
        {recording && (
          <span className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping" />
        )}
      </button>
      <p className="text-xs text-stone-500 text-center max-w-[200px]">
        {recording ? "Grabando… toque para detener" : busy ? busyLabel : "Toque y haga su pregunta"}
      </p>
      <button
        onClick={useSample}
        disabled={busy || recording}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {sampleLabel}
      </button>
      {error && <p className="text-xs text-rose-600 text-center max-w-[240px]">{error}</p>}
    </div>
  );
}