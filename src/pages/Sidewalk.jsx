import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Globe2,
  Languages,
  MapPinned,
  MessageCircle,
  Mic,
  Pause,
  Play,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
  Upload,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import "../sidewalk.css";

const INITIAL_SESSION = "ROSA-2026";

const LABELS = {
  es: {
    prototype: "Prototipo de hackathon",
    disclosure: "Datos ficticios · No afiliado con NYC · No es asesoría legal · Sin pagos, trámites ni mensajes reales",
    ask: "Preguntar",
    check: "Revisar",
    sales: "Mis ventas",
    morning: "Buenos días",
    case: "Tu caso",
    assembling: "Preparando documentos",
    possible: "Siguiente paso posible",
    tax: "Revisar el certificado de impuesto sobre ventas",
    need: "¿Qué necesitas hoy?",
    hold: "Toca para hablar",
    sampleQuestion: "¿Qué debo preparar primero?",
    preliminary: "GUÍA PRELIMINAR DE DEMO",
    samplePrompt: "Usar pregunta de muestra",
    missing: "Falta 1 elemento",
    proofAddress: "Comprobante de domicilio — lista de muestra",
    source: "Ver fuente y trazabilidad",
    listen: "Escuchar respuesta",
    checkTitle: "Revisa un aviso",
    checkCopy: "Fotografía un aviso ficticio o confirma el número manualmente.",
    sampleSummons: "Usar aviso de muestra",
    uploadSummons: "Subir aviso ficticio",
    ticket: "Número de aviso",
    checkPublic: "Consultar datos públicos",
    sampleResult: "Ver resultado de muestra",
    noGuess: "Si un carácter no está claro, SIDEWALK no lo adivina.",
    salesTitle: "Tu historial de ventas",
    salesCopy: "Distingue lo autoinformado de los eventos de tarjeta simulados.",
    logCash: "Registrar venta por voz",
    useCashSample: "Usar muestra de $12",
    checkout: "Completar pago de demo",
    noMoney: "No se moverá dinero.",
    confirmTitle: "Confirma antes de guardar",
    confirmCash: "Confirmar venta en efectivo",
    cancel: "Cancelar",
    confirmed: "Autoinformado y confirmado",
    simulatedCard: "Evento de tarjeta simulado",
    evidenceCaveat: "La aceptación como evidencia de licencia no está garantizada.",
  },
  en: {
    prototype: "Hackathon prototype",
    disclosure: "Fictional data · Not affiliated with NYC · Not legal advice · No real payments, filings, or messages",
    ask: "Ask",
    check: "Check",
    sales: "My sales",
    morning: "Good morning",
    case: "Your case",
    assembling: "Preparing documents",
    possible: "Possible next step",
    tax: "Review the sales-tax certificate",
    need: "What do you need today?",
    hold: "Tap to speak",
    sampleQuestion: "What should I prepare first?",
    preliminary: "PRELIMINARY DEMO GUIDANCE",
    samplePrompt: "Use sample question",
    missing: "1 item missing",
    proofAddress: "Proof of address — sample checklist",
    source: "View source and trace",
    listen: "Listen to answer",
    checkTitle: "Check a notice",
    checkCopy: "Photograph a fictional notice or confirm the number manually.",
    sampleSummons: "Use sample notice",
    uploadSummons: "Upload fictional notice",
    ticket: "Notice number",
    checkPublic: "Check public records",
    sampleResult: "View sample result",
    noGuess: "If a character is unclear, SIDEWALK does not guess it.",
    salesTitle: "Your sales record",
    salesCopy: "Keep self-reported entries distinct from simulated card events.",
    logCash: "Log a sale by voice",
    useCashSample: "Use $12 sample",
    checkout: "Complete demo checkout",
    noMoney: "No money will move.",
    confirmTitle: "Confirm before saving",
    confirmCash: "Confirm cash sale",
    cancel: "Cancel",
    confirmed: "Self-reported and confirmed",
    simulatedCard: "Simulated card event",
    evidenceCaveat: "Acceptance as licensing evidence is not guaranteed.",
  },
};

const MODE_LABELS = {
  live_public_readonly: "LIVE PUBLIC DATA",
  live_ai: "LIVE AI",
  fixture: "SAMPLE DATA",
  simulated: "SIMULATED",
  unavailable: "UNAVAILABLE",
};

const FALLBACK_CASE = {
  session: {
    demo_session_id: INITIAL_SESSION,
    code: INITIAL_SESSION,
    locale: "es",
    provider_modes: {
      speech: "live_ai_with_exact_fixture_fallback",
      extraction: "live_ai_with_exact_fixture_fallback",
      legal: "deterministic_rulebook",
      nyc_lookup: "live_public_readonly",
      payments: "simulated_only",
      messaging: "preview_only",
    },
  },
  vendor: {
    display_name: "Rosa",
    language: "es",
    is_fictional: true,
    case_status: "assembling",
    next_step: "Review the sales-tax certificate",
    missing_item: "Proof of address — sample checklist",
  },
  documents: [{
    kind: "summons",
    ticket_number: "3508821A0",
    extraction_status: "extracted",
    structured_fields: { ticket_number: "3508821A0" },
    provenance: {
      mode: "fixture",
      source: "Bundled watermarked demo notice",
      retrievedAt: "2026-08-15T12:00:00.000Z",
      fixtureId: "rosa_summons",
    },
  }],
  evaluations: [{
    question: "¿Qué debo preparar primero?",
    answer_text: "Según la lista de muestra, un posible próximo paso es revisar el certificado estatal de impuesto sobre ventas. Confírmalo con la agencia responsable o con un proveedor de servicios calificado.",
    source: "SIDEWALK sample rulebook snapshot · food-vendor preparation sequence",
    abstention: false,
    trace: [{
      ruleId: "DEMO-SEQ-FOOD-001",
      citationLabel: "SIDEWALK sample rulebook snapshot",
      satisfied: true,
    }],
    provenance: {
      mode: "fixture",
      source: "Deterministic demo rulebook",
      retrievedAt: "2026-08-15T12:00:00.000Z",
    },
  }],
  verifications: [{
    ticket_number: "3508821A0",
    result: "fixture",
    dataset_timestamp: "2026-08-15T12:00:00.000Z",
    provenance: {
      mode: "fixture",
      source: "Redacted fictional sample",
      retrievedAt: "2026-08-15T12:00:00.000Z",
      datasetId: "jz4z-kudi",
      fixtureId: "sample_found",
    },
  }],
  evidence: [{
    id: "seed-card",
    amount: 8.5,
    kind: "card_simulated",
    recorded_at: "2026-08-15T10:15:00.000Z",
    confirmed: true,
    note: "Tamales · DEMO card event; no money moved",
    provenance: {
      mode: "simulated",
      source: "Simulated checkout",
      retrievedAt: "2026-08-15T10:15:00.000Z",
    },
  }],
};

const FALLBACK_PROOF = {
  eval_runs: Array.from({ length: 12 }, function (_, index) {
    return {
      id: "check-" + index,
      scenario: index === 11 ? "Venue-network rehearsal" : [
        "Deterministic trace",
        "Missing-fact abstention",
        "Citation requirement",
        "Unclear ticket returns null",
        "Exact fixture hash",
        "Empty/live result split",
        "Unavailable/live result split",
        "Cash confirmation gate",
        "Evidence-grade distinction",
        "Session-scoped query",
        "Idempotent reset",
      ][index],
      status: index === 11 ? "Not yet measured" : "Passed",
      measured: index !== 11,
    };
  }),
  demonstrated: [
    "Fictional-data-only flows",
    "No immigration-status field",
    "Explicit cash confirmation",
    "No real payment, filing, messaging, or outreach calls",
    "Session-scoped queries and reset",
  ],
  production_design: [
    "Tenant isolation",
    "Expiring document links",
    "Encryption",
    "Deletion workflows",
    "Audit logs",
    "Independent security review",
  ],
  not_evaluated: [
    "Regulatory compliance",
    "Legal accuracy",
    "Production security",
    "Accessibility certification",
    "Real-world vendor outcomes",
  ],
};

function cloneFallbackCase(sessionId) {
  return {
    ...FALLBACK_CASE,
    session: { ...FALLBACK_CASE.session, demo_session_id: sessionId, code: sessionId },
    documents: FALLBACK_CASE.documents.map(function (item) { return { ...item }; }),
    evaluations: FALLBACK_CASE.evaluations.map(function (item) { return { ...item }; }),
    verifications: FALLBACK_CASE.verifications.map(function (item) { return { ...item }; }),
    evidence: FALLBACK_CASE.evidence.map(function (item) { return { ...item }; }),
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function normalizeFunctionResponse(response) {
  return response && response.data !== undefined ? response.data : response;
}

async function invokeFunction(name, body) {
  const response = await base44.functions.invoke(name, body);
  return normalizeFunctionResponse(response);
}

function provenanceOf(value, fallbackMode) {
  return value || {
    mode: fallbackMode || "fixture",
    source: "SIDEWALK demo fixture",
    retrievedAt: new Date().toISOString(),
  };
}

function ModeBadge({ provenance, compact = false }) {
  const mode = provenance && provenance.mode ? provenance.mode : "unavailable";
  return (
    <span className={"mode-badge mode-" + mode + (compact ? " compact" : "")}>
      <span className="mode-dot" />
      {MODE_LABELS[mode] || "UNAVAILABLE"}
    </span>
  );
}

function Brand({ inverse = false }) {
  return (
    <div className={"brand-lockup" + (inverse ? " inverse" : "")}>
      <span className="brand-symbol">S</span>
      <span>SIDEWALK</span>
    </div>
  );
}

function SafetyDialog({ open, onContinue }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="safety-dialog" role="dialog" aria-modal="true" aria-labelledby="safety-title">
        <div className="safety-seal"><ShieldCheck size={29} /></div>
        <p className="eyebrow">BEFORE YOU TRY SIDEWALK</p>
        <h2 id="safety-title">A safe space for a fictional story.</h2>
        <p>
          Use only the provided demo materials. Do not enter personal, financial,
          immigration, or confidential information.
        </p>
        <div className="safety-points">
          <span><Check size={16} /> Rosa and every case are fictional</span>
          <span><Check size={16} /> No money, filings, or messages leave this demo</span>
          <span><Check size={16} /> Legal content is a sample rulebook, not advice</span>
        </div>
        <button className="primary-button wide" onClick={onContinue}>
          Continue with fictional Rosa <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}

function Disclosure({ language }) {
  const copy = LABELS[language];
  return (
    <div className="disclosure-bar">
      <span className="disclosure-status" />
      <strong>{copy.prototype}</strong>
      <span className="disclosure-divider" />
      <span>{copy.disclosure}</span>
    </div>
  );
}

function ViewSwitcher({ view, onChange }) {
  return (
    <nav className="view-switcher" aria-label="Prototype views">
      <button className={view === "vendor" ? "active" : ""} onClick={() => onChange("vendor")}>
        <UserRound size={15} /> Vendor
      </button>
      <button className={view === "console" ? "active" : ""} onClick={() => onChange("console")}>
        <ClipboardCheck size={15} /> Console
      </button>
      <button className={view === "proof" ? "active" : ""} onClick={() => onChange("proof")}>
        <ShieldCheck size={15} /> Proof
      </button>
    </nav>
  );
}

function GlobalHeader({ view, onViewChange, sessionId, backendState }) {
  return (
    <header className="global-header">
      <Brand />
      <div className="global-header-center">
        <span className="session-pill">SESSION · {sessionId}</span>
        <span className={"sync-pill " + backendState}>
          <span /> {backendState === "connected" ? "BASE44 CONNECTED" : backendState === "loading" ? "SYNCING" : "SAMPLE MODE"}
        </span>
      </div>
      <ViewSwitcher view={view} onChange={onViewChange} />
    </header>
  );
}

function CaseStatusCard({ language }) {
  const copy = LABELS[language];
  return (
    <article className="case-status-card">
      <div className="case-status-head">
        <div className="case-status-icon"><FileCheck2 size={19} /></div>
        <div>
          <span>{copy.case}</span>
          <strong>{copy.assembling}</strong>
        </div>
        <span className="count-pill">2 / 3</span>
      </div>
      <div className="case-progress"><span /></div>
      <div className="possible-step">
        <div>
          <span>{copy.possible}</span>
          <strong>{copy.tax}</strong>
        </div>
        <ChevronRight size={19} />
      </div>
    </article>
  );
}

function GuidanceCard({ result, language, speechMode, onSpeak }) {
  const copy = LABELS[language];
  if (!result) return null;
  const data = result.data || result;
  const provenance = provenanceOf(result.provenance, "fixture");
  const abstained = data.decision === "abstain";
  return (
    <article className={"guidance-result " + (abstained ? "abstained" : "")}>
      <div className="result-meta">
        <span className="preliminary-label"><Sparkles size={13} /> {copy.preliminary}</span>
        <div className="badge-row">
          {speechMode && <ModeBadge provenance={{ mode: speechMode }} compact />}
          <ModeBadge provenance={provenance} compact />
        </div>
      </div>
      <p className="vendor-transcript">“{data.question || data.transcript || copy.sampleQuestion}”</p>
      <div className="answer-copy">
        {abstained && <TriangleAlert size={19} />}
        <p>{data.answer_text}</p>
      </div>
      <div className="guidance-actions">
        <button className="listen-button" onClick={onSpeak}>
          <Volume2 size={15} /> {copy.listen}
        </button>
        <button className="source-button">
          <BookOpen size={15} /> {copy.source}
        </button>
      </div>
      <div className="source-strip">
        <span>SAMPLE SOURCE</span>
        <p>{data.source && data.source.label ? data.source.label : data.source || "SIDEWALK sample rulebook snapshot"}</p>
        <small>{data.rulebook_hash ? "Rulebook " + String(data.rulebook_hash).slice(0, 10) : "Demo-only source trace"}</small>
      </div>
    </article>
  );
}

function AskTab({ language, sessionId, latestEvaluation, onEvaluation, notify }) {
  const copy = LABELS[language];
  const [voiceState, setVoiceState] = useState("idle");
  const [speechMode, setSpeechMode] = useState(null);
  const [result, setResult] = useState(latestEvaluation ? {
    ok: true,
    data: {
      ...latestEvaluation,
      question: latestEvaluation.question,
      decision: latestEvaluation.abstention ? "abstain" : "answer",
      source: { label: latestEvaluation.source },
    },
    provenance: latestEvaluation.provenance,
  } : null);
  const recognitionRef = useRef(null);

  async function submitQuestion(question, sourceMode) {
    setVoiceState("thinking");
    setSpeechMode(sourceMode);
    try {
      const payload = await invokeFunction("answer_demo_question", {
        demo_session_id: sessionId,
        question,
        locale: language,
      });
      if (!payload || !payload.ok) throw new Error(payload && payload.error ? payload.error : "Guidance unavailable");
      payload.data.question = question;
      setResult(payload);
      onEvaluation(payload.data);
    } catch (error) {
      const isKnown = /prepar|primero|first|sales.tax|impuesto/i.test(question);
      const answer = isKnown
        ? language === "es"
          ? "Según la lista de muestra, un posible próximo paso es revisar el certificado estatal de impuesto sobre ventas. Confírmalo con la agencia responsable o con un proveedor de servicios calificado."
          : "According to the sample checklist, one possible next step is to review the state sales-tax certificate. Confirm it with the responsible agency or a qualified service provider."
        : language === "es"
          ? "Esta pregunta necesita revisión humana o legal. SIDEWALK no encontró una regla de muestra que la determine."
          : "This question needs human or legal review. SIDEWALK found no sample rule that determines it.";
      const fallback = {
        ok: true,
        data: {
          decision: isKnown ? "answer" : "abstain",
          question,
          answer_text: answer,
          source: { label: isKnown ? "SIDEWALK sample rulebook snapshot" : "No matching sample rule" },
          rulebook_hash: "client-demo-fallback",
        },
        provenance: {
          mode: "fixture",
          source: "Client-held deterministic demo rulebook",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      };
      setResult(fallback);
      onEvaluation(fallback.data);
      notify("Base44 guidance function unavailable — showing an explicitly labeled sample result.", "warning");
    } finally {
      setVoiceState("idle");
    }
  }

  function useSampleQuestion() {
    submitQuestion(copy.sampleQuestion, "fixture");
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      notify("Live browser speech recognition is unavailable. Use the labeled sample prompt.", "warning");
      return;
    }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = language === "es" ? "es-US" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = function () { setVoiceState("listening"); };
    recognition.onerror = function () {
      setVoiceState("idle");
      notify("Live speech could not be read. Nothing was guessed; use the sample prompt if you want.", "warning");
    };
    recognition.onend = function () {
      if (voiceState === "listening") setVoiceState("idle");
    };
    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      submitQuestion(transcript, "live_ai");
    };
    recognition.start();
  }

  function speakResult() {
    const text = result && (result.data || result).answer_text;
    if (!text || !window.speechSynthesis) {
      notify("Audio playback is unavailable in this browser.", "warning");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "es" ? "es-US" : "en-US";
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="vendor-tab-panel">
      <CaseStatusCard language={language} />
      <div className="missing-item-row">
        <span className="missing-icon"><TriangleAlert size={16} /></span>
        <div><strong>{copy.missing}</strong><small>{copy.proofAddress}</small></div>
        <ChevronRight size={18} />
      </div>
      <section className="voice-ask">
        <span className="preliminary-label"><Sparkles size={13} /> {copy.preliminary}</span>
        <h2>{copy.need}</h2>
        <p>{voiceState === "listening" ? (language === "es" ? "Escuchando…" : "Listening…") : copy.hold}</p>
        <button
          className={"hero-mic " + voiceState}
          onClick={startVoice}
          aria-label={copy.hold}
          disabled={voiceState === "thinking"}
        >
          {voiceState === "listening" ? <Pause size={28} /> : voiceState === "thinking" ? <RefreshCw className="spin" size={26} /> : <Mic size={30} />}
        </button>
        <button className="sample-prompt-button" onClick={useSampleQuestion}>
          <Play size={13} /> {copy.samplePrompt}: “{copy.sampleQuestion}”
        </button>
      </section>
      <GuidanceCard result={result} language={language} speechMode={speechMode} onSpeak={speakResult} />
    </div>
  );
}

function DemoNotice({ visible }) {
  if (!visible) return null;
  return (
    <div className="demo-notice-preview" aria-label="Watermarked fictional summons">
      <span className="watermark">SAMPLE · NOT A REAL GOVERNMENT DOCUMENT</span>
      <div className="notice-logo">NYC <small>DEMO</small></div>
      <div className="notice-lines">
        <strong>NOTICE OF SAMPLE HEARING</strong>
        <span>FICTIONAL PERSON · ROSA DEMO</span>
        <span>TICKET NUMBER</span>
        <b>3508821A0</b>
      </div>
      <div className="notice-boxes"><span /><span /><span /></div>
    </div>
  );
}

function CheckTab({ language, sessionId, latestVerification, onVerification, notify }) {
  const copy = LABELS[language];
  const [ticket, setTicket] = useState(latestVerification && latestVerification.ticket_number ? latestVerification.ticket_number : "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [showSampleNotice, setShowSampleNotice] = useState(!latestVerification);
  const [extraction, setExtraction] = useState(null);
  const [lookup, setLookup] = useState(latestVerification ? {
    ok: true,
    data: {
      result: latestVerification.result,
      normalized_ticket: latestVerification.ticket_number,
      dataset_timestamp: latestVerification.dataset_timestamp,
      record_data: latestVerification.record_data,
      message: "This is a redacted fictional sample result, not a live record.",
    },
    provenance: latestVerification.provenance,
  } : null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  function useSampleSummons() {
    setShowSampleNotice(true);
    setPreviewUrl("");
    setTicket("3508821A0");
    setExtraction({
      ok: true,
      data: { ticket_number: "3508821A0", extraction_status: "extracted" },
      provenance: {
        mode: "fixture",
        source: "Bundled watermarked demo notice",
        retrievedAt: new Date().toISOString(),
        fixtureId: "rosa_summons",
      },
    });
  }

  async function uploadNotice(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      notify("Use a fictional image under 10 MB.", "warning");
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setShowSampleNotice(false);
    setExtraction(null);
    setBusy(true);
    try {
      const uploaded = await base44.integrations.Core.UploadFile({ file });
      const payload = await invokeFunction("extract_summons", {
        demo_session_id: sessionId,
        image_url: uploaded.file_url,
      });
      setExtraction(payload);
      if (payload && payload.ok && payload.data.ticket_number) {
        setTicket(payload.data.ticket_number);
      } else {
        setTicket("");
      }
      if (!payload || !payload.ok) {
        notify(payload && payload.error ? payload.error : "Live extraction unavailable. No number was guessed.", "warning");
      }
    } catch (error) {
      setTicket("");
      setExtraction({
        ok: false,
        error: "Live extraction is unavailable. No ticket number was guessed.",
        provenance: {
          mode: "unavailable",
          source: "Base44 file upload and constrained extraction",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      });
      notify("Live extraction is unavailable. No number was guessed.", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function runLookup(sourceMode) {
    setBusy(true);
    try {
      const body = sourceMode === "sample"
        ? { demo_session_id: sessionId, source_mode: "sample", fixture_id: "sample_found" }
        : { demo_session_id: sessionId, source_mode: "live", ticket_number: ticket };
      const payload = await invokeFunction("check_summons", body);
      setLookup(payload);
      if (payload && payload.ok) {
        onVerification(payload.data);
      } else {
        notify(payload && payload.error ? payload.error : "Public source unavailable.", "warning");
      }
    } catch (error) {
      setLookup({
        ok: false,
        error: "Public source unavailable. No conclusion was made about this notice.",
        provenance: {
          mode: "unavailable",
          source: "NYC Open Data — OATH Hearings Division Case Status",
          retrievedAt: new Date().toISOString(),
          datasetId: "jz4z-kudi",
          fallbackReason: error.message,
        },
      });
      notify("Public source unavailable. No conclusion was made.", "warning");
    } finally {
      setBusy(false);
    }
  }

  const lookupData = lookup && lookup.data;
  return (
    <div className="vendor-tab-panel check-panel">
      <div className="tab-intro">
        <span className="tab-icon"><ShieldCheck size={22} /></span>
        <div><h2>{copy.checkTitle}</h2><p>{copy.checkCopy}</p></div>
      </div>
      <div className="upload-zone">
        {previewUrl ? <img src={previewUrl} alt="Fictional uploaded notice preview" /> : <DemoNotice visible={showSampleNotice} />}
        {!previewUrl && !showSampleNotice && <Camera size={30} />}
        <div className="upload-actions">
          <button onClick={() => inputRef.current && inputRef.current.click()}><Upload size={15} /> {copy.uploadSummons}</button>
          <button onClick={useSampleSummons}><FileText size={15} /> {copy.sampleSummons}</button>
        </div>
        <input ref={inputRef} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={uploadNotice} />
      </div>
      {extraction && (
        <div className="extraction-row">
          <ModeBadge provenance={provenanceOf(extraction.provenance)} compact />
          <span>{extraction.ok && extraction.data.ticket_number ? "Ticket field extracted" : "Extraction needs manual confirmation"}</span>
        </div>
      )}
      <label className="ticket-field">
        <span>{copy.ticket}</span>
        <div><ReceiptText size={18} /><input value={ticket} onChange={(event) => setTicket(event.target.value.toUpperCase())} placeholder="3508821A0" /></div>
      </label>
      <p className="no-guess-note"><ShieldCheck size={14} /> {copy.noGuess}</p>
      <button className="primary-button wide" disabled={busy || ticket.trim().length < 4} onClick={() => runLookup("live")}>
        {busy ? <RefreshCw className="spin" size={17} /> : <Search size={17} />} {copy.checkPublic}
      </button>

      {lookup && (
        <article className={"lookup-result " + (lookup.ok ? "ok" : "unavailable")}>
          <div className="lookup-result-head">
            {lookup.ok ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}
            <div>
              <strong>{lookup.ok ? (lookupData.result === "found" ? "Record returned" : "No record returned") : "Public source unavailable"}</strong>
              <span>{lookupData && lookupData.normalized_ticket ? lookupData.normalized_ticket : ticket}</span>
            </div>
            <ModeBadge provenance={provenanceOf(lookup.provenance, lookup.ok ? "live_public_readonly" : "unavailable")} compact />
          </div>
          <p>{lookup.ok ? lookupData.message : lookup.error}</p>
          <div className="freshness">
            <span>DATASET · jz4z-kudi</span>
            <span>AS OF · {formatDate(lookupData && lookupData.dataset_timestamp ? lookupData.dataset_timestamp : lookup.provenance && lookup.provenance.retrievedAt)}</span>
          </div>
          {!lookup.ok && (
            <button className="secondary-button" onClick={() => runLookup("sample")}>
              <FileText size={15} /> {copy.sampleResult}
            </button>
          )}
        </article>
      )}
    </div>
  );
}

function EvidenceRow({ item, language }) {
  const copy = LABELS[language];
  const isCash = item.kind === "cash_self_reported";
  return (
    <div className="evidence-row">
      <span className={"evidence-icon " + (isCash ? "cash" : "card")}>
        {isCash ? <Mic size={17} /> : <CircleDollarSign size={17} />}
      </span>
      <div className="evidence-main">
        <strong>{isCash ? copy.confirmed : copy.simulatedCard}</strong>
        <small>{item.note || (isCash ? "Cash sale" : "Demo checkout")}</small>
      </div>
      <div className="evidence-value">
        <strong>{formatMoney(item.amount)}</strong>
        <ModeBadge provenance={provenanceOf(item.provenance, "simulated")} compact />
      </div>
    </div>
  );
}

function SalesTab({ language, sessionId, evidence, onEvidence, notify }) {
  const copy = LABELS[language];
  const [cashDraft, setCashDraft] = useState(12);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);

  async function beginCash(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      notify("Enter a valid sample amount.", "warning");
      return;
    }
    setCashDraft(value);
    try {
      await invokeFunction("record_cash_sale", {
        demo_session_id: sessionId,
        amount: value,
        confirmed: false,
      });
    } catch {
      // The visible confirmation gate still remains closed.
    }
    setConfirmOpen(true);
  }

  function startCashVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      notify("Live speech is unavailable. Use the labeled $12 sample.", "warning");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language === "es" ? "es-US" : "en-US";
    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript.toLowerCase();
      const match = transcript.match(/\d+(?:[.,]\d+)?/);
      const mapped = /doce|twelve/.test(transcript) ? 12 : match ? Number(match[0].replace(",", ".")) : null;
      if (mapped) beginCash(mapped);
      else notify("The amount was unclear. Nothing was saved.", "warning");
    };
    recognition.onerror = function () { notify("The amount was unclear. Nothing was saved.", "warning"); };
    recognition.start();
    notify(language === "es" ? "Di el monto de la venta." : "Say the sale amount.", "info");
  }

  async function confirmCash() {
    setBusy(true);
    try {
      const payload = await invokeFunction("record_cash_sale", {
        demo_session_id: sessionId,
        amount: cashDraft,
        confirmed: true,
        note: language === "es" ? "Venta en efectivo autoinformada y confirmada" : "Confirmed self-reported cash sale",
      });
      if (!payload || !payload.ok || !payload.data.created) throw new Error(payload && payload.error ? payload.error : "Could not save");
      onEvidence(payload.data.evidence);
      notify(language === "es" ? "Venta autoinformada guardada." : "Self-reported sale saved.", "success");
      setConfirmOpen(false);
    } catch (error) {
      const localEvidence = {
        id: "local-cash-" + Date.now(),
        amount: cashDraft,
        kind: "cash_self_reported",
        recorded_at: new Date().toISOString(),
        confirmed: true,
        note: language === "es" ? "Muestra local autoinformada" : "Local self-reported sample",
        provenance: {
          mode: "simulated",
          source: "Local sample session only",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      };
      onEvidence(localEvidence);
      setConfirmOpen(false);
      notify("Base44 write unavailable — saved only in this visibly simulated view.", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function demoCheckout() {
    setBusy(true);
    try {
      const payload = await invokeFunction("complete_demo_checkout", {
        demo_session_id: sessionId,
        amount: 18.5,
        item_name: "Rosa’s tamales",
      });
      if (!payload || !payload.ok || !payload.data.created) throw new Error(payload && payload.error ? payload.error : "Could not create demo event");
      onEvidence(payload.data.evidence);
      setCheckoutDone(true);
      notify("Demo checkout complete. No money moved.", "success");
    } catch (error) {
      onEvidence({
        id: "local-card-" + Date.now(),
        amount: 18.5,
        kind: "card_simulated",
        recorded_at: new Date().toISOString(),
        confirmed: true,
        note: "Rosa’s tamales · local DEMO event; no money moved",
        provenance: {
          mode: "simulated",
          source: "Local simulated checkout",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      });
      setCheckoutDone(true);
      notify("Backend unavailable — created only a visibly simulated local event.", "warning");
    } finally {
      setBusy(false);
    }
  }

  const total = evidence.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
  return (
    <div className="vendor-tab-panel sales-panel">
      <div className="tab-intro">
        <span className="tab-icon coral"><ShoppingBag size={22} /></span>
        <div><h2>{copy.salesTitle}</h2><p>{copy.salesCopy}</p></div>
      </div>
      <div className="sales-summary">
        <div><span>DEMO TOTAL</span><strong>{formatMoney(total)}</strong><small>{evidence.length} evidence records</small></div>
        <div className="mini-qr"><QrCode size={38} /><span>STORE QR</span></div>
      </div>
      <div className="cash-actions">
        <button className="primary-button" onClick={startCashVoice}><Mic size={17} /> {copy.logCash}</button>
        <button className="secondary-button" onClick={() => beginCash(12)}>{copy.useCashSample}</button>
      </div>
      <article className="demo-checkout-card">
        <div className="checkout-visual"><Store size={26} /></div>
        <div><span>DEMO STOREFRONT</span><strong>Rosa’s tamales · $18.50</strong><small>{copy.noMoney}</small></div>
        <button disabled={busy || checkoutDone} onClick={demoCheckout}>
          {checkoutDone ? <Check size={17} /> : <ArrowRight size={17} />}
        </button>
      </article>
      <div className="evidence-list">
        <div className="section-heading"><span>EVIDENCE LEDGER</span><small>{copy.evidenceCaveat}</small></div>
        {evidence.map(function (item, index) { return <EvidenceRow key={item.id || index} item={item} language={language} />; })}
      </div>
      {confirmOpen && (
        <div className="confirm-sheet">
          <div className="confirm-sheet-handle" />
          <button className="sheet-close" onClick={() => setConfirmOpen(false)} aria-label="Close"><X size={18} /></button>
          <span className="confirm-icon"><Mic size={21} /></span>
          <p>{copy.confirmTitle}</p>
          <strong>{formatMoney(cashDraft)}</strong>
          <small>{copy.confirmed}</small>
          <button className="primary-button wide" onClick={confirmCash} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={17} /> : <Check size={17} />} {copy.confirmCash}
          </button>
          <button className="text-button" onClick={() => setConfirmOpen(false)}>{copy.cancel}</button>
        </div>
      )}
    </div>
  );
}

function VendorView({ sessionId, caseData, onCaseChange, notify }) {
  const [language, setLanguage] = useState(caseData.session && caseData.session.locale === "en" ? "en" : "es");
  const [tab, setTab] = useState("ask");
  const copy = LABELS[language];
  const latestEvaluation = caseData.evaluations && caseData.evaluations[0];
  const latestVerification = caseData.verifications && caseData.verifications[0];

  function addEvaluation(evaluation) {
    onCaseChange({ ...caseData, evaluations: [{ ...evaluation, provenance: { mode: "fixture", source: "Deterministic demo rulebook", retrievedAt: new Date().toISOString() } }, ...(caseData.evaluations || [])] });
  }
  function addVerification(verification) {
    onCaseChange({ ...caseData, verifications: [{ ...verification }, ...(caseData.verifications || [])] });
  }
  function addEvidence(item) {
    onCaseChange({ ...caseData, evidence: [item, ...(caseData.evidence || [])] });
  }

  return (
    <main className="vendor-view">
      <div className="vendor-ambient ambient-one" />
      <div className="vendor-ambient ambient-two" />
      <section className="vendor-phone">
        <header className="vendor-header">
          <Brand />
          <div className="vendor-header-actions">
            <span className="fictional-pill">FICTIONAL</span>
            <button className="language-button" onClick={() => setLanguage(language === "es" ? "en" : "es")}>
              <Languages size={15} /> {language.toUpperCase()}
            </button>
          </div>
        </header>
        <div className="vendor-greeting">
          <span>{copy.morning}</span>
          <h1>Rosa <span>👋</span></h1>
        </div>
        <div className="vendor-content">
          {tab === "ask" && <AskTab language={language} sessionId={sessionId} latestEvaluation={latestEvaluation} onEvaluation={addEvaluation} notify={notify} />}
          {tab === "check" && <CheckTab language={language} sessionId={sessionId} latestVerification={latestVerification} onVerification={addVerification} notify={notify} />}
          {tab === "sales" && <SalesTab language={language} sessionId={sessionId} evidence={caseData.evidence || []} onEvidence={addEvidence} notify={notify} />}
        </div>
        <nav className="vendor-bottom-nav" aria-label="Vendor navigation">
          <button className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}><MessageCircle size={21} /><span>{copy.ask}</span></button>
          <button className={tab === "check" ? "active" : ""} onClick={() => setTab("check")}><ShieldCheck size={21} /><span>{copy.check}</span></button>
          <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}><ShoppingBag size={21} /><span>{copy.sales}</span></button>
        </nav>
      </section>
      <div className="vendor-side-note">
        <span>MOBILE PWA</span>
        <strong>One story.<br />Three working flows.</strong>
        <p>Voice guidance, a public-record check, and a transparent evidence ledger.</p>
      </div>
    </main>
  );
}

const QUEUE = [
  { name: "Rosa M.", lang: "ES", status: "Assembling", active: true },
  { name: "Karim R.", lang: "BN", status: "Needs review" },
  { name: "Mei L.", lang: "ZH", status: "Hearing soon" },
  { name: "Amara J.", lang: "EN", status: "Ready" },
];

function ConsoleSidebar() {
  return (
    <aside className="console-sidebar">
      <div className="console-brand"><Brand inverse /><span>CASEWORKER CONSOLE</span></div>
      <nav className="console-nav">
        <button className="active"><ClipboardCheck size={18} /> Cases <span>8</span></button>
        <button><ShieldCheck size={18} /> Guard <span>3</span></button>
        <button><Bell size={18} /> Nudges <span>2</span></button>
        <button><Sparkles size={18} /> Roadmap</button>
      </nav>
      <div className="sidebar-truth">
        <ShieldCheck size={18} />
        <strong>Human approval stays in the loop.</strong>
        <p>No filing, payment, or message can leave this prototype.</p>
      </div>
    </aside>
  );
}

function SourceDocumentCard({ document }) {
  return (
    <div className="source-document-card">
      <DemoNotice visible />
      <div className="source-crop-callout">
        <span>EXTRACTED FIELD</span>
        <strong>{document && document.ticket_number ? document.ticket_number : "3508821A0"}</strong>
        <ModeBadge provenance={provenanceOf(document && document.provenance)} compact />
      </div>
    </div>
  );
}

function RoadmapCards() {
  const cards = [
    { icon: FileText, title: "Universal Letter Reader", copy: "Extract dates and amounts, then route to a human-reviewed next step.", tag: "LETTER" },
    { icon: ClipboardCheck, title: "Draft packet builder", copy: "Assemble a watermarked, never-filed preview from confirmed evidence.", tag: "PACKET" },
    { icon: MapPinned, title: "Scam Radar", copy: "Aggregate fictional neighborhood risk signals without naming people.", tag: "GUARD" },
    { icon: MessageCircle, title: "WhatsApp + SMS", copy: "Bring the same channel-agnostic core to familiar conversations.", tag: "CHANNELS" },
    { icon: Globe2, title: "Course preparation", copy: "Short multilingual voice lessons with clear translation labels.", tag: "LEARNING" },
    { icon: Send, title: "Outreach approval queue", copy: "Draft reminders for a caseworker to review—never auto-send.", tag: "AUTOPILOT" },
  ];
  return (
    <section className="roadmap-section">
      <div className="section-title-row">
        <div><span className="eyebrow">WHAT COMES NEXT</span><h2>The broader vision, honestly labeled.</h2></div>
        <span className="roadmap-key">NONINTERACTIVE PREVIEWS</span>
      </div>
      <div className="roadmap-grid">
        {cards.map(function (card) {
          const Icon = card.icon;
          return (
            <article className="roadmap-card" key={card.title}>
              <span className="roadmap-concept">ROADMAP CONCEPT</span>
              <div className="roadmap-icon"><Icon size={22} /></div>
              <small>{card.tag}</small>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ConsoleView({ sessionId, caseData, onNewSession, onReset, refreshing }) {
  const [selected, setSelected] = useState("Rosa M.");
  const latestEvaluation = caseData.evaluations && caseData.evaluations[0];
  const latestVerification = caseData.verifications && caseData.verifications[0];
  const latestDocument = caseData.documents && caseData.documents[0];
  const qrUrl = typeof window === "undefined"
    ? ""
    : window.location.origin + window.location.pathname + "?view=vendor&demo_session_id=" + encodeURIComponent(sessionId);
  const total = (caseData.evidence || []).reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);

  return (
    <main className="console-view">
      <ConsoleSidebar />
      <section className="console-workspace">
        <header className="console-topbar">
          <div><span className="eyebrow">CASEWORKER VIEW · FICTIONAL DATA</span><h1>Rosa’s case</h1></div>
          <div className="console-actions">
            <span className="live-update"><span /> AUTO-REFRESH · 4S</span>
            <button className="secondary-button" onClick={onReset} disabled={refreshing}><RotateCcw size={15} /> Reset demo</button>
            <button className="primary-button" onClick={onNewSession}><QrCode size={16} /> New QR session</button>
          </div>
        </header>
        <div className="console-layout">
          <aside className="case-queue">
            <div className="queue-head"><span>CASE QUEUE</span><Search size={15} /></div>
            {QUEUE.map(function (item) {
              return (
                <button className={(item.active ? "active " : "") + (selected === item.name ? "selected" : "")} key={item.name} onClick={() => setSelected(item.name)}>
                  <span className="queue-avatar">{item.name.slice(0, 1)}</span>
                  <div><strong>{item.name}</strong><small>{item.status}</small></div>
                  <span className="language-chip">{item.lang}</span>
                </button>
              );
            })}
            <div className="queue-more">+ 4 more fictional cases</div>
          </aside>
          <div className="case-detail">
            <article className="case-hero">
              <div className="case-avatar">R</div>
              <div className="case-person">
                <div className="case-name-row"><h2>Rosa Martinez</h2><span>FICTIONAL PERSONA</span></div>
                <p>Spanish · Food vendor demo track · Session {sessionId}</p>
              </div>
              <div className="case-stage"><span>CASE STAGE</span><strong>Assembling</strong><small>2 of 3 sample items</small></div>
            </article>
            <div className="metric-grid">
              <article><span>NEXT STEP</span><strong>Review sales-tax certificate</strong><small>Sample rulebook · not an official decision</small></article>
              <article><span>EVIDENCE TOTAL</span><strong>{formatMoney(total)}</strong><small>{(caseData.evidence || []).length} mixed-grade demo records</small></article>
              <article className="qr-metric"><QRCodeSVG value={qrUrl || "SIDEWALK"} size={58} bgColor="#fffdf8" fgColor="#17261f" /><div><span>VENDOR QR</span><strong>{sessionId}</strong><small>No account required</small></div></article>
            </div>
            <div className="console-panels">
              <article className="console-panel source-panel">
                <div className="panel-heading"><div><span>01 · PROVENANCE</span><h3>Source image → extracted field</h3></div><ModeBadge provenance={provenanceOf(latestDocument && latestDocument.provenance)} compact /></div>
                <SourceDocumentCard document={latestDocument} />
              </article>
              <article className="console-panel">
                <div className="panel-heading"><div><span>02 · GUARD</span><h3>Public-record check</h3></div><ModeBadge provenance={provenanceOf(latestVerification && latestVerification.provenance)} compact /></div>
                <div className="guard-summary">
                  <span className="guard-shield"><ShieldCheck size={25} /></span>
                  <div><strong>{latestVerification && latestVerification.result === "not_found" ? "No record returned" : "Sample record available"}</strong><p>{latestVerification && latestVerification.ticket_number ? latestVerification.ticket_number : "3508821A0"}</p></div>
                </div>
                <p className="safe-result-copy">A public-record result is a signal, not a fraud determination. Dates and instructions must be confirmed with OATH.</p>
                <div className="dataset-row"><span>jz4z-kudi</span><span>{formatDate(latestVerification && latestVerification.dataset_timestamp)}</span></div>
              </article>
              <article className="console-panel rule-panel">
                <div className="panel-heading"><div><span>03 · RULE TRACE</span><h3>Rules decide; models do not.</h3></div><ModeBadge provenance={provenanceOf(latestEvaluation && latestEvaluation.provenance)} compact /></div>
                <div className="trace-line">
                  <span className="trace-node"><Check size={15} /></span>
                  <div><strong>{latestEvaluation && latestEvaluation.trace && latestEvaluation.trace[0] ? latestEvaluation.trace[0].ruleId || latestEvaluation.trace[0].rule_id : "DEMO-SEQ-FOOD-001"}</strong><p>Sample sequence rule matched the fictional case facts.</p></div>
                </div>
                <div className="trace-line">
                  <span className="trace-node coral"><BookOpen size={15} /></span>
                  <div><strong>Source attached</strong><p>{latestEvaluation && latestEvaluation.source ? (typeof latestEvaluation.source === "string" ? latestEvaluation.source : latestEvaluation.source.label || "SIDEWALK sample rulebook snapshot") : "SIDEWALK sample rulebook snapshot"}</p></div>
                </div>
                <div className="abstention-note"><TriangleAlert size={16} /> Missing facts or sources force “Needs human/legal review.”</div>
              </article>
              <article className="console-panel evidence-panel">
                <div className="panel-heading"><div><span>04 · PAPER TRAIL</span><h3>Evidence stays graded.</h3></div><span className="panel-count">{(caseData.evidence || []).length} records</span></div>
                <div className="console-evidence-list">
                  {(caseData.evidence || []).map(function (item, index) { return <EvidenceRow key={item.id || index} item={item} language="en" />; })}
                </div>
                <p className="safe-result-copy">Illustrative only. Acceptance by a licensing authority is not guaranteed.</p>
              </article>
            </div>
            <article className="nudge-preview">
              <span className="nudge-icon"><Bell size={20} /></span>
              <div><span>DRAFT NUDGE · PREVIEW ONLY</span><strong>Rosa is missing one sample document</strong><p>“¿Necesitas ayuda con tu comprobante de domicilio?”</p></div>
              <button disabled>Sending not enabled</button>
            </article>
            <RoadmapCards />
          </div>
        </div>
      </section>
    </main>
  );
}

function ProofColumn({ icon: Icon, title, subtitle, items, tone }) {
  return (
    <article className={"proof-column " + tone}>
      <span className="proof-column-icon"><Icon size={21} /></span>
      <span>{subtitle}</span>
      <h3>{title}</h3>
      <ul>{items.map(function (item) { return <li key={item}><Check size={14} /> {item}</li>; })}</ul>
    </article>
  );
}

function ProofView({ sessionId, proofData }) {
  const runs = proofData.eval_runs || [];
  const measured = runs.filter(function (run) { return run.measured !== false && !/not yet|pending/i.test(String(run.status || run.result || "")); });
  const passed = measured.filter(function (run) { return /pass|success|complete/i.test(String(run.status || run.result || "")); });
  return (
    <main className="proof-view">
      <section className="proof-hero">
        <span className="eyebrow">PROTOTYPE PROOF · SESSION {sessionId}</span>
        <h1>Trust is not a disclaimer.<br /><em>It is the interface.</em></h1>
        <p>Every result says where it came from, what it can do, and where a human must take over.</p>
        <div className="proof-stat-row">
          <div><strong>9 / 9</strong><span>Deno entry checks</span></div>
          <div><strong>6 / 6</strong><span>Core logic tests</span></div>
          <div><strong>{passed.length} / {measured.length || 11}</strong><span>Measured fixture scenarios</span></div>
          <div><strong>0</strong><span>Real payments, filings, or messages</span></div>
        </div>
      </section>
      <section className="integration-truth">
        <div className="section-title-row">
          <div><span className="eyebrow">INTEGRATION TRUTH</span><h2>Nothing live is disguised as a fixture—or vice versa.</h2></div>
        </div>
        <div className="truth-grid">
          <article><ModeBadge provenance={{ mode: "live_public_readonly" }} /><h3>NYC OATH lookup</h3><p>One read-only public-data query with dataset freshness.</p><span>jz4z-kudi</span></article>
          <article><ModeBadge provenance={{ mode: "live_ai" }} /><h3>Speech + extraction</h3><p>Browser speech and constrained Base44 extraction when available.</p><span>EXACT FIXTURE FALLBACK</span></article>
          <article><ModeBadge provenance={{ mode: "fixture" }} /><h3>Legal guidance</h3><p>A tiny deterministic rulebook with prewritten replies and abstention.</p><span>DEMO ONLY</span></article>
          <article><ModeBadge provenance={{ mode: "simulated" }} /><h3>Commerce + outreach</h3><p>Visible evidence events and previews; no external side effects.</p><span>NO SDK CONTACT</span></article>
        </div>
      </section>
      <section className="proof-boundaries">
        <ProofColumn icon={CheckCircle2} title="Shown working here" subtitle="DEMONSTRATED" items={proofData.demonstrated || FALLBACK_PROOF.demonstrated} tone="demonstrated" />
        <ProofColumn icon={Sparkles} title="Designed for a pilot" subtitle="PRODUCTION DESIGN" items={proofData.production_design || FALLBACK_PROOF.production_design} tone="designed" />
        <ProofColumn icon={TriangleAlert} title="Not claimed today" subtitle="NOT EVALUATED" items={proofData.not_evaluated || FALLBACK_PROOF.not_evaluated} tone="unevaluated" />
      </section>
      <section className="eval-section">
        <div className="section-title-row">
          <div><span className="eyebrow">RECORDED CHECKS</span><h2>Measured and unmeasured stay separate.</h2></div>
          <span className="roadmap-key">PROTOTYPE TESTS · NOT CERTIFICATION</span>
        </div>
        <div className="eval-grid">
          {runs.slice(0, 12).map(function (run, index) {
            const status = String(run.status || run.result || (run.measured === false ? "Not yet measured" : "Passed"));
            const isPending = run.measured === false || /pending|not yet/i.test(status);
            return (
              <div className={"eval-row " + (isPending ? "pending" : "passed")} key={run.id || index}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{run.scenario || run.name || run.suite || "Prototype fixture check"}</strong>
                <small>{isPending ? "NOT YET MEASURED" : status.toUpperCase()}</small>
              </div>
            );
          })}
        </div>
      </section>
      <RoadmapCards />
      <footer className="closing-statement">
        <Brand inverse />
        <blockquote>“SIDEWALK turns a frightening document into a source-linked next step—and a caseworker-ready record—in the vendor’s language.”</blockquote>
        <span>FICTIONAL · SANDBOXED · HUMAN-GATED</span>
      </footer>
    </main>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={"app-toast " + toast.type}>
      {toast.type === "success" ? <CheckCircle2 size={18} /> : toast.type === "warning" ? <TriangleAlert size={18} /> : <Sparkles size={18} />}
      <span>{toast.message}</span>
    </div>
  );
}

export default function SidewalkApp() {
  const params = useMemo(function () { return new URLSearchParams(window.location.search); }, []);
  const initialView = ["vendor", "console", "proof"].includes(params.get("view")) ? params.get("view") : "vendor";
  const [view, setView] = useState(initialView);
  const [sessionId, setSessionId] = useState(params.get("demo_session_id") || params.get("session") || INITIAL_SESSION);
  const [caseData, setCaseData] = useState(cloneFallbackCase(params.get("demo_session_id") || params.get("session") || INITIAL_SESSION));
  const [proofData, setProofData] = useState(FALLBACK_PROOF);
  const [backendState, setBackendState] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(function () {
    return window.sessionStorage.getItem("sidewalk-safety-seen") !== "yes";
  });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function notify(message, type) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type: type || "info" });
    toastTimer.current = window.setTimeout(function () { setToast(null); }, 4300);
  }

  async function loadSession(targetSession, quiet) {
    if (!quiet) setBackendState("loading");
    try {
      const [casePayload, proofPayload] = await Promise.all([
        invokeFunction("get_demo_case", { demo_session_id: targetSession }),
        invokeFunction("get_demo_proof", { demo_session_id: targetSession }),
      ]);
      if (!casePayload || !casePayload.ok) throw new Error(casePayload && casePayload.error ? casePayload.error : "Case unavailable");
      setCaseData(casePayload.data);
      if (proofPayload && proofPayload.ok) setProofData(proofPayload.data);
      setBackendState("connected");
    } catch (error) {
      if (!quiet) {
        setCaseData(cloneFallbackCase(targetSession));
        setProofData(FALLBACK_PROOF);
        setBackendState("sample");
        notify("Base44 session data is unavailable — the app is visibly using bundled sample data.", "warning");
      }
    }
  }

  useEffect(function () {
    loadSession(sessionId, false);
  }, [sessionId]);

  useEffect(function () {
    if (view !== "console") return undefined;
    const interval = window.setInterval(function () { loadSession(sessionId, true); }, 4000);
    return function () { window.clearInterval(interval); };
  }, [view, sessionId]);

  function changeView(nextView) {
    setView(nextView);
    const next = new URL(window.location.href);
    next.searchParams.set("view", nextView);
    next.searchParams.set("demo_session_id", sessionId);
    window.history.replaceState({}, "", next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function newSession() {
    setRefreshing(true);
    try {
      const payload = await invokeFunction("start_demo_session", { locale: "es" });
      if (!payload || !payload.ok) throw new Error(payload && payload.error ? payload.error : "Could not start session");
      const code = payload.data.demo_session_id;
      setSessionId(code);
      const next = new URL(window.location.href);
      next.searchParams.set("view", "console");
      next.searchParams.set("demo_session_id", code);
      window.history.replaceState({}, "", next);
      notify("New Base44 demo session created. The QR is ready.", "success");
    } catch (error) {
      notify("A new Base44 session could not be created. The current session is unchanged.", "warning");
    } finally {
      setRefreshing(false);
    }
  }

  async function resetSession() {
    setRefreshing(true);
    try {
      const payload = await invokeFunction("reset_demo_session", { demo_session_id: sessionId });
      if (!payload || !payload.ok) throw new Error(payload && payload.error ? payload.error : "Reset unavailable");
      await loadSession(sessionId, true);
      notify("Rosa’s synthetic session was reset to its exact seed.", "success");
    } catch (error) {
      setCaseData(cloneFallbackCase(sessionId));
      notify("Base44 reset unavailable — only the visibly bundled sample view was restored.", "warning");
    } finally {
      setRefreshing(false);
    }
  }

  function continueSafety() {
    window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
    setSafetyOpen(false);
  }

  return (
    <div className="sidewalk-app">
      <Disclosure language={caseData.session && caseData.session.locale === "en" ? "en" : "es"} />
      <GlobalHeader view={view} onViewChange={changeView} sessionId={sessionId} backendState={backendState} />
      {view === "vendor" && <VendorView sessionId={sessionId} caseData={caseData} onCaseChange={setCaseData} notify={notify} />}
      {view === "console" && <ConsoleView sessionId={sessionId} caseData={caseData} onNewSession={newSession} onReset={resetSession} refreshing={refreshing} />}
      {view === "proof" && <ProofView sessionId={sessionId} proofData={proofData} />}
      <SafetyDialog open={safetyOpen} onContinue={continueSafety} />
      <Toast toast={toast} />
    </div>
  );
}
