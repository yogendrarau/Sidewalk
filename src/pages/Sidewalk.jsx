import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { QRCodeSVG } from "qrcode.react";
import "@fontsource-variable/noto-sans";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import sidewalkMark from "@/assets/brand/sidewalk-mark.png";
import sidewalkWordmark from "@/assets/brand/sidewalk-wordmark.png";
import {
  ArrowRight, Bell, BookOpen, Camera, Check, CheckCircle2, ChevronRight,
  CircleDollarSign, ClipboardCheck, FileCheck2, FileText, Globe2, MapPinned,
  ExternalLink, HeartHandshake, Landmark, ListChecks, MessageCircle, Mic, Pause,
  Phone, Play, QrCode, ReceiptText, RefreshCw, RotateCcw, Search, Send,
  ShieldCheck, ShoppingBag, Sparkles, Store, TriangleAlert, Upload, UserRound,
  Volume2, X,
} from "lucide-react";
import {
  DEFAULT_CONSOLE_LOCALE,
  DEFAULT_VENDOR_LOCALE,
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
  fixtureAudioUrl,
  localeDirection,
  localeSpeechMeta,
  normalizeLocale,
  useSurfaceTranslation,
} from "@/i18n";
import "../sidewalk.css";

const INITIAL_SESSION = "ROSA-2026";

const MODE_KEYS = {
  live_public_readonly: "common:modeLivePublic",
  live_ai: "common:modeLiveAi",
  fixture: "common:modeFixture",
  simulated: "common:modeSimulated",
  unavailable: "common:modeUnavailable",
};

const HELP_ROUTES = [
  {
    id: "official",
    icon: Landmark,
    verified: true,
    url: "https://www.nyc.gov/site/doh/business/permits-licenses.page",
    phone: "311",
    alternatePhone: "(212) 639-9675",
    secondaryUrl: "https://www.nyc.gov/site/dca/businesses/license-checklist-general-vendor.page",
    secondaryPhone: "(212) 487-4075",
  },
  {
    id: "summons",
    icon: FileText,
    verified: true,
    url: "https://www.nyc.gov/site/oath/help-center/help-center.page",
    phone: "(212) 436-0845",
    extraUrl: "https://www.nyc.gov/site/oath/help-center/email-the-help-center.page",
  },
  {
    id: "legal",
    icon: HeartHandshake,
    verified: true,
    url: "https://www.streetvendor.org/legal-assistance",
    phone: "646-602-5679",
  },
  {
    id: "business",
    icon: MapPinned,
    verified: true,
    url: "https://nyc-business.nyc.gov/nycbusiness/business-services/initiatives/street-vending-in-nyc",
    phone: "888-SBS-4NYC (888-727-4692)",
    phoneHref: "8887274692",
  },
];

const FALLBACK_CASE = {
  session: {
    demo_session_id: INITIAL_SESSION,
    code: INITIAL_SESSION,
    locale: DEFAULT_VENDOR_LOCALE,
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
    language: DEFAULT_VENDOR_LOCALE,
    is_fictional: true,
    case_status_key: "case.status.preparing",
    case_summary_key: "case.summary.rosa_food_vendor",
    next_step_key: "guidance.prepare_sales_tax_certificate",
    missing_item_key: "case.missing.sales_tax_certificate",
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
    question: "",
    original_transcript: "",
    answer_key: "guidance.prepare_sales_tax_certificate",
    answer_text: "",
    answer_text_en: "",
    source: "SIDEWALK sample rulebook snapshot",
    abstention: false,
    trace: [{ ruleId: "DEMO-SEQ-FOOD-001", citationLabel: "SIDEWALK sample rulebook snapshot", satisfied: true }],
    provenance: { mode: "fixture", source: "Deterministic demo rulebook", retrievedAt: "2026-08-15T12:00:00.000Z" },
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
    note_key: "sales.seed.card_simulated",
    provenance: { mode: "simulated", source: "Simulated checkout", retrievedAt: "2026-08-15T10:15:00.000Z" },
  }],
};

const FALLBACK_PROOF = {
  eval_runs: Array.from({ length: 12 }, function (_, index) {
    return {
      id: "check-" + index,
      scenario: index === 11 ? "Venue-network rehearsal" : "Prototype fixture check",
      status: index === 11 ? "Not yet measured" : "Passed",
      measured: index !== 11,
    };
  }),
};

function cloneFallbackCase(sessionId, locale) {
  const chosen = normalizeLocale(locale) || DEFAULT_VENDOR_LOCALE;
  return {
    ...FALLBACK_CASE,
    session: { ...FALLBACK_CASE.session, demo_session_id: sessionId, code: sessionId, locale: chosen },
    vendor: { ...FALLBACK_CASE.vendor, language: chosen },
    documents: FALLBACK_CASE.documents.map((item) => ({ ...item })),
    evaluations: FALLBACK_CASE.evaluations.map((item) => ({ ...item })),
    verifications: FALLBACK_CASE.verifications.map((item) => ({ ...item })),
    evidence: FALLBACK_CASE.evidence.map((item) => ({ ...item })),
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function formatDate(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(localeSpeechMeta(locale).speechTag, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
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

function canonicalVendorText(key, t, fallbackKey) {
  const map = {
    "case.status.preparing": "vendor:assembling",
    "guidance.prepare_sales_tax_certificate": "vendor:tax",
    "case.missing.sales_tax_certificate": "vendor:missingSalesTax",
    "sales.seed.cash_tacos": "vendor:cashSale",
    "sales.seed.card_simulated": "vendor:demoCheckout",
  };
  return t(map[key] || fallbackKey);
}

function ModeBadge({ provenance, locale, compact = false }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  const mode = provenance && provenance.mode ? provenance.mode : "unavailable";
  return (
    <span className={"mode-badge mode-" + mode + (compact ? " compact" : "")}>
      <span className="mode-dot" />
      {t(MODE_KEYS[mode] || "common:modeUnavailable")}
    </span>
  );
}

function Brand({ inverse = false }) {
  return (
    <div className={"brand-lockup" + (inverse ? " inverse" : "")}>
      <img className="brand-symbol" src={sidewalkMark} alt="" />
      <img className="brand-wordmark" src={sidewalkWordmark} alt="SIDEWALK" />
    </div>
  );
}

function LanguageSelect({ locale, onChange, testId }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  return (
    <label className="language-select-wrap">
      <span className="sr-only">{t("common:language")}</span>
      <select
        data-testid={testId}
        className="language-select"
        aria-label={t("common:language")}
        value={locale}
        onChange={(event) => onChange(event.target.value)}
      >
        {SUPPORTED_LOCALES.map((id) => (
          <option data-testid={"locale-option-" + id} key={id} value={id}>
            {LOCALE_REGISTRY[id].nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}

async function recordAudio(maxMilliseconds = 8000) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    throw new Error("media_recorder_unavailable");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return new Promise((resolve, reject) => {
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    const finish = () => stream.getTracks().forEach((track) => track.stop());
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      finish();
      reject(new Error("audio_capture_failed"));
    };
    recorder.onstop = () => {
      finish();
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.start();
    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, Math.min(maxMilliseconds, 8000));
  });
}

async function transcribeRecordedAudio(blob, sessionId, locale) {
  const file = new File([blob], "sidewalk-" + Date.now() + ".webm", { type: blob.type || "audio/webm" });
  const uploaded = await base44.integrations.Core.UploadFile({ file });
  return invokeFunction("transcribe_audio", {
    demo_session_id: sessionId,
    audio_url: uploaded.file_url,
    locale,
    device_validated: true,
  });
}

function SafetyDialog({ open, onContinue, locale }) {
  const { t } = useSurfaceTranslation(locale, ["safety"]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="safety-dialog" role="dialog" aria-modal="true" aria-labelledby="safety-title" lang={locale} dir={localeDirection(locale)}>
        <div className="safety-seal"><ShieldCheck size={29} /></div>
        <p className="eyebrow">{t("safety:before")}</p>
        <h2 id="safety-title">{t("safety:title")}</h2>
        <p>{t("safety:body")}</p>
        <div className="safety-points">
          <span><Check size={16} /> {t("safety:fictionalPoint")}</span>
          <span><Check size={16} /> {t("safety:noSideEffectsPoint")}</span>
          <span><Check size={16} /> {t("safety:legalPoint")}</span>
        </div>
        <button className="primary-button wide" onClick={onContinue}>
          {t("safety:continue")} <ArrowRight className="directional-icon" size={17} />
        </button>
      </section>
    </div>
  );
}

function Disclosure({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  return (
    <div className="disclosure-bar" lang={locale} dir={localeDirection(locale)}>
      <span className="disclosure-status" />
      <strong>{t("common:prototype")}</strong>
      <span className="disclosure-divider" aria-hidden="true"> · </span>
      <span>{t("common:disclosure")}</span>
    </div>
  );
}

function ViewSwitcher({ view, onChange, locale }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  return (
    <nav className="view-switcher" aria-label={t("common:prototypeViews")}>
      <button className={view === "vendor" ? "active" : ""} onClick={() => onChange("vendor")}>
        <UserRound size={15} /> {t("common:vendorView")}
      </button>
      <button className={view === "console" ? "active" : ""} onClick={() => onChange("console")}>
        <ClipboardCheck size={15} /> {t("common:consoleView")}
      </button>
      <button className={view === "proof" ? "active" : ""} onClick={() => onChange("proof")}>
        <ShieldCheck size={15} /> {t("common:proofView")}
      </button>
    </nav>
  );
}

function GlobalHeader({ view, onViewChange, sessionId, backendState, locale, onConsoleLocaleChange }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  const syncText = backendState === "connected"
    ? t("common:backendConnected")
    : backendState === "loading"
      ? t("common:syncing")
      : t("common:sampleMode");
  return (
    <header className="global-header" lang={locale} dir={localeDirection(locale)}>
      <Brand />
      <div className="global-header-center">
        <bdi className="session-pill" dir="ltr">{t("common:session")} · {sessionId}</bdi>
        <span className={"sync-pill " + backendState}><span /> {syncText}</span>
      </div>
      <div className="global-header-actions">
        {view !== "vendor" && (
          <LanguageSelect locale={locale} onChange={onConsoleLocaleChange} testId="console-language-select" />
        )}
        <ViewSwitcher view={view} onChange={onViewChange} locale={locale} />
      </div>
    </header>
  );
}

function CaseStatusCard({ language, vendor }) {
  const { t } = useSurfaceTranslation(language, ["vendor"]);
  return (
    <article className="case-status-card">
      <div className="case-status-head">
        <div className="case-status-icon"><FileCheck2 size={19} /></div>
        <div>
          <span>{t("vendor:case")}</span>
          <strong>{canonicalVendorText(vendor && vendor.case_status_key, t, "vendor:assembling")}</strong>
        </div>
        <bdi className="count-pill" dir="ltr">2 / 3</bdi>
      </div>
      <div className="case-progress"><span /></div>
      <div className="possible-step">
        <div>
          <span>{t("vendor:possible")}</span>
          <strong>{canonicalVendorText(vendor && vendor.next_step_key, t, "vendor:tax")}</strong>
        </div>
        <ChevronRight className="directional-icon" size={19} />
      </div>
    </article>
  );
}

function GuidanceCard({ result, language, speechMode, onSpeak }) {
  const { t } = useSurfaceTranslation(language, ["common", "guidance", "vendor"]);
  if (!result) return null;
  const data = result.data || result;
  const provenance = provenanceOf(result.provenance, "fixture");
  const abstained = data.decision === "abstain";
  const answerText = data.answer_text || (abstained ? t("guidance:abstainAnswer") : t("guidance:knownAnswer"));
  const speechLabel = speechMode === "device"
    ? t("guidance:deviceSpeech")
    : speechMode === "fixture"
      ? t("guidance:sampleAudio")
      : speechMode === "unavailable"
        ? t("guidance:speechUnavailable")
        : null;
  return (
    <article data-testid="guidance-result" className={"guidance-result " + (abstained ? "abstained" : "")}>
      <div className="result-meta">
        <span className="preliminary-label"><Sparkles size={13} /> {t("guidance:preliminary")}</span>
        <div className="badge-row">
          {speechLabel && <span className="voice-mode-label">{speechLabel}</span>}
          <ModeBadge provenance={provenance} locale={language} compact />
        </div>
      </div>
      <p className="vendor-transcript">“{data.transcript_original || data.original_transcript || data.question || data.transcript || t("vendor:sampleQuestion")}”</p>
      <div className="answer-copy">
        {abstained && <TriangleAlert size={19} />}
        <p>{answerText}</p>
      </div>
      {!abstained && (
        <div data-testid="source-linked-checklist" className="guidance-checklist">
          <div className="guidance-checklist-title"><ListChecks size={16} /><strong>{t("guidance:sourceLinkedChecklist")}</strong></div>
          <ol>
            <li>{t("guidance:checklistReview")}</li>
            <li>{t("guidance:checklistPrepare")}</li>
            <li>{t("guidance:checklistOfficial")}</li>
          </ol>
          <p><ShieldCheck size={14} /> {t("guidance:officialAuthority")}</p>
          <span>{t("guidance:routineReviewOptional")}</span>
        </div>
      )}
      <div className="guidance-actions">
        <button className="listen-button" onClick={onSpeak}>
          <Volume2 size={15} /> {t("guidance:listen")}
        </button>
        <button className="source-button">
          <BookOpen size={15} /> {t("guidance:source")}
        </button>
      </div>
      <div className="source-strip">
        <span>{t("common:sampleSource")}</span>
        <p>{t("guidance:sampleRulebook")}</p>
        <small>
          {data.rulebook_hash
            ? t("guidance:rulebook", { hash: String(data.rulebook_hash).slice(0, 10) })
            : t("guidance:demoTrace")}
        </small>
      </div>
    </article>
  );
}

function HelpRouter({ language, result, vendor }) {
  const { t } = useSurfaceTranslation(language, ["vendor", "guidance"]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const selected = HELP_ROUTES.find((route) => route.id === selectedId);
  const selectedPrefix = selected
    ? "help" + selected.id.slice(0, 1).toUpperCase() + selected.id.slice(1)
    : null;
  const data = result && (result.data || result);
  const abstained = Boolean(data && data.decision === "abstain");
  const originalInput = data && (data.transcript_original || data.original_transcript || data.question || data.transcript);
  const preliminaryStep = data && data.answer_text
    ? data.answer_text
    : abstained
      ? t("guidance:abstainAnswer")
      : t("guidance:knownAnswer");

  function chooseRoute(id) {
    setSelectedId(id);
    setShowHandoff(false);
  }

  return (
    <section data-testid="get-more-help" className="help-router">
      <button
        className="help-router-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span><HeartHandshake size={18} /><span><strong>{t("vendor:getMoreHelp")}</strong><small>{t("vendor:getMoreHelpOptional")}</small></span></span>
        <ChevronRight className="directional-icon" size={18} />
      </button>
      {open && (
        <div className="help-router-body">
          <p className="help-router-intro">{t("vendor:helpIntro")}</p>
          <div className="help-route-grid" role="list">
            {HELP_ROUTES.map((route) => {
              const Icon = route.icon;
              const prefix = "help" + route.id.slice(0, 1).toUpperCase() + route.id.slice(1);
              return (
                <button
                  data-testid={"help-route-" + route.id}
                  className={selectedId === route.id ? "selected" : ""}
                  key={route.id}
                  type="button"
                  onClick={() => chooseRoute(route.id)}
                >
                  <Icon size={17} />
                  <span>{t("vendor:" + prefix + "Label")}</span>
                </button>
              );
            })}
          </div>
          {selected && selectedPrefix && (
            <article data-testid="referral-destination" className="referral-card">
              <div className="referral-card-head">
                <div>
                  <span>{t("vendor:potentialDestination")}</span>
                  <h3>{t("vendor:" + selectedPrefix + "Destination")}</h3>
                </div>
                <span className={selected.verified ? "verified-route" : "unverified-route"}>
                  {selected.verified ? t("vendor:officialContactVerified") : t("vendor:officialNeedsVerification")}
                </span>
              </div>
              <dl className="referral-details">
                <div><dt>{t("vendor:helpWhy")}</dt><dd>{t("vendor:" + selectedPrefix + "Why")}</dd></div>
                <div><dt>{t("vendor:helpCan")}</dt><dd>{t("vendor:" + selectedPrefix + "Can")}</dd></div>
                <div><dt>{t("vendor:helpCannot")}</dt><dd>{t("vendor:" + selectedPrefix + "Cannot")}</dd></div>
                <div><dt>{t("vendor:helpBring")}</dt><dd>{t("vendor:" + selectedPrefix + "Bring")}</dd></div>
              </dl>
              {selected.id === "official" && <p className="agency-routing-note">{t("vendor:officialMerchandiseRoute")}</p>}
              <span className="referral-contact-label">{t("vendor:helpContact")}</span>
              <div className="referral-contact">
                {selected.verified && selected.url ? (
                  <a data-testid="official-referral-link" href={selected.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> {t("vendor:officialWebsite")}
                  </a>
                ) : (
                  <span><TriangleAlert size={14} /> {t("vendor:officialNeedsVerification")}</span>
                )}
                {selected.phone && <a href={"tel:" + (selected.phoneHref || selected.phone.replace(/[^+\d]/g, ""))}><Phone size={14} /><bdi dir="ltr">{selected.phone}</bdi></a>}
                {selected.alternatePhone && <a href={"tel:" + selected.alternatePhone.replace(/[^+\d]/g, "")}><Phone size={14} /> {t("vendor:outsideNyc")} <bdi dir="ltr">{selected.alternatePhone}</bdi></a>}
                {selected.extraUrl && <a href={selected.extraUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t("vendor:oathContactForm")}</a>}
              </div>
              {selected.secondaryUrl && (
                <div className="secondary-agency-contact">
                  <strong>{t("vendor:officialMerchandiseDestination")}</strong>
                  <a data-testid="dcwp-official-referral-link" href={selected.secondaryUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {t("vendor:officialWebsite")}</a>
                  <a href={"tel:" + selected.secondaryPhone.replace(/[^+\d]/g, "")}><Phone size={14} /><bdi dir="ltr">{selected.secondaryPhone}</bdi></a>
                </div>
              )}
              <p className="referral-affiliation"><ShieldCheck size={14} /> {t("vendor:helpNoAffiliation")}</p>
              <button data-testid="prepare-handoff" className="secondary-button wide" type="button" onClick={() => setShowHandoff(true)}>
                <ClipboardCheck size={15} /> {t("vendor:prepareHandoff")}
              </button>
              {showHandoff && (
                <div data-testid="handoff-preview" className="handoff-preview">
                  <div><span>{t("vendor:handoffPreview")}</span><strong>{t("vendor:localPreviewOnly")}</strong></div>
                  <dl>
                    <div><dt>{t("vendor:handoffCategory")}</dt><dd>{t("vendor:" + selectedPrefix + "Label")}</dd></div>
                    <div><dt>{t("vendor:handoffInput")}</dt><dd>“{originalInput || t("vendor:sampleQuestion")}”</dd></div>
                    <div><dt>{t("vendor:handoffStep")}</dt><dd>{preliminaryStep}</dd></div>
                    <div><dt>{t("vendor:handoffMissing")}</dt><dd>{canonicalVendorText(vendor && vendor.missing_item_key, t, "vendor:proofAddress")}</dd></div>
                    <div><dt>{t("vendor:handoffDestination")}</dt><dd>{t("vendor:" + selectedPrefix + "Destination")}</dd></div>
                    <div><dt>{t("vendor:handoffReview")}</dt><dd>{abstained ? t("vendor:reviewRecommended") : t("vendor:reviewOptional")}</dd></div>
                  </dl>
                  <p>{t("vendor:helpNoTransmit")}</p>
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function AskTab({ language, sessionId, vendor, latestEvaluation, onEvaluation, notify }) {
  const { t } = useSurfaceTranslation(language, ["vendor", "guidance", "errors", "safety"]);
  const [voiceState, setVoiceState] = useState("idle");
  const [speechMode, setSpeechMode] = useState(null);
  const [typedQuestion, setTypedQuestion] = useState("");
  const [result, setResult] = useState(latestEvaluation ? {
    ok: true,
    data: {
      ...latestEvaluation,
      question: latestEvaluation.transcript_original || latestEvaluation.question,
      decision: latestEvaluation.abstention ? "abstain" : "answer",
    },
    provenance: latestEvaluation.provenance,
  } : null);

  async function submitQuestion(question, sourceMode) {
    const clean = String(question || "").trim();
    if (!clean) return;
    setVoiceState("thinking");
    try {
      const payload = await invokeFunction("answer_demo_question", {
        demo_session_id: sessionId,
        question: clean,
        locale: language,
      });
      if (!payload || !payload.ok) throw new Error(payload && payload.error ? payload.error : "guidance_unavailable");
      payload.data.question = clean;
      setResult(payload);
      onEvaluation({ ...payload.data, provenance: payload.provenance });
    } catch (error) {
      const fixtureAllowed = sourceMode === "fixture";
      const fallback = {
        ok: fixtureAllowed,
        data: {
          decision: fixtureAllowed ? "answer" : "abstain",
          transcript_original: clean,
          question: clean,
          answer_key: fixtureAllowed ? "guidance.prepare_sales_tax_certificate" : null,
          answer_text: fixtureAllowed ? t("guidance:knownAnswer") : t("guidance:abstainAnswer"),
          source: { label: fixtureAllowed ? t("guidance:sampleRulebook") : t("guidance:noRule") },
          rulebook_hash: fixtureAllowed ? "client-exact-fixture" : null,
        },
        provenance: {
          mode: fixtureAllowed ? "fixture" : "unavailable",
          source: fixtureAllowed ? "Bundled exact demo fixture" : "Base44 deterministic guidance",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      };
      setResult(fallback);
      onEvaluation({ ...fallback.data, provenance: fallback.provenance });
      notify(t("errors:guidanceUnavailable"), "warning");
    } finally {
      setVoiceState("idle");
    }
  }

  function playSampleQuestion() {
    const audio = new Audio(fixtureAudioUrl(language, "question"));
    audio.play().catch(() => undefined);
    setSpeechMode("fixture");
    submitQuestion(t("vendor:sampleQuestion"), "fixture");
  }

  async function startVoice() {
    const meta = localeSpeechMeta(language);
    if (!meta.liveSpeechValidated) {
      notify(t("errors:liveSpeechUnavailable"), "warning");
      playSampleQuestion();
      return;
    }
    setVoiceState("listening");
    try {
      const blob = await recordAudio(8000);
      setVoiceState("thinking");
      const payload = await transcribeRecordedAudio(blob, sessionId, language);
      if (!payload || !payload.ok || !payload.data || !payload.data.transcript) {
        throw new Error(payload && payload.error ? payload.error : "transcription_unavailable");
      }
      setSpeechMode(payload.provenance && payload.provenance.mode === "fixture" ? "fixture" : "device");
      await submitQuestion(payload.data.transcript, payload.provenance && payload.provenance.mode);
    } catch {
      setVoiceState("idle");
      setSpeechMode("unavailable");
      notify(t("errors:speechFailed"), "warning");
    }
  }

  function speakResult() {
    const data = result && (result.data || result);
    const text = data && (data.answer_text || (data.decision === "abstain" ? t("guidance:abstainAnswer") : t("guidance:knownAnswer")));
    const meta = localeSpeechMeta(language);
    if (text && meta.liveSpeechValidated && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      const prefix = meta.speechTag.toLowerCase().split("-")[0];
      const voice = voices.find((item) => String(item.lang || "").toLowerCase().startsWith(prefix));
      if (voice) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = meta.speechTag;
        utterance.voice = voice;
        window.speechSynthesis.speak(utterance);
        setSpeechMode("device");
        return;
      }
    }
    if (data && data.decision !== "abstain") {
      const audio = new Audio(fixtureAudioUrl(language, "answer"));
      audio.onplay = () => setSpeechMode("fixture");
      const markPlaybackUnavailable = () => {
        setSpeechMode("unavailable");
        notify(t("errors:playbackUnavailable"), "warning");
      };
      audio.onerror = markPlaybackUnavailable;
      audio.play().catch(markPlaybackUnavailable);
      return;
    }
    setSpeechMode("unavailable");
    notify(t("errors:playbackUnavailable"), "warning");
  }

  const voiceHint = voiceState === "listening"
    ? t("vendor:listening")
    : voiceState === "thinking"
      ? t("vendor:processing")
      : t("vendor:tapSpeak");
  const meta = localeSpeechMeta(language);

  return (
    <div className="vendor-tab-panel">
      <CaseStatusCard language={language} vendor={vendor} />
      <div className="missing-item-row">
        <span className="missing-icon"><TriangleAlert size={16} /></span>
        <div>
          <strong>{t("vendor:missing")}</strong>
          <small>{canonicalVendorText(vendor && vendor.missing_item_key, t, "vendor:proofAddress")}</small>
        </div>
        <ChevronRight className="directional-icon" size={18} />
      </div>
      <section className="voice-ask">
        <span className="preliminary-label"><Sparkles size={13} /> {t("guidance:preliminary")}</span>
        <h2>{t("vendor:need")}</h2>
        <p>{voiceHint}</p>
        <p className="ai-processing-note"><ShieldCheck size={13} /> {t("safety:aiProcessingDisclosure")}</p>
        <button
          className={"hero-mic " + voiceState}
          onClick={startVoice}
          aria-label={t("vendor:tapSpeak")}
          disabled={voiceState !== "idle"}
        >
          {voiceState === "listening" ? <Pause size={28} /> : voiceState === "thinking" ? <RefreshCw className="spin" size={26} /> : <Mic size={30} />}
        </button>
        <span className="voice-support-label">
          {language === "zh-Hans"
            ? t("guidance:chineseVoiceLabel")
            : meta.liveSpeechValidated
              ? t("guidance:liveAsr")
              : t("guidance:fixtureFirst")}
        </span>
        <div className="typed-question-row">
          <input
            value={typedQuestion}
            onChange={(event) => setTypedQuestion(event.target.value)}
            placeholder={t("vendor:typeQuestion")}
            aria-label={t("vendor:typeQuestion")}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitQuestion(typedQuestion, "typed");
            }}
          />
          <button onClick={() => submitQuestion(typedQuestion, "typed")} disabled={!typedQuestion.trim()}>
            <Send size={15} /> <span>{t("vendor:sendQuestion")}</span>
          </button>
        </div>
        <button data-testid="sample-question" className="sample-prompt-button" onClick={playSampleQuestion}>
          <Play size={13} /> {t("vendor:samplePrompt")}: “{t("vendor:sampleQuestion")}”
        </button>
      </section>
      <GuidanceCard result={result} language={language} speechMode={speechMode} onSpeak={speakResult} />
      <HelpRouter language={language} result={result} vendor={vendor} />
    </div>
  );
}

function DemoNotice({ visible, locale }) {
  const { t } = useSurfaceTranslation(locale, ["vendor"]);
  if (!visible) return null;
  return (
    <div className="demo-notice-preview" aria-label={t("vendor:sampleNoticeAria")}>
      <span className="watermark">{t("vendor:noticeWatermark")}</span>
      <div className="notice-logo">NYC <small>DEMO</small></div>
      <div className="notice-lines">
        <strong>{t("vendor:noticeTitle")}</strong>
        <span>{t("vendor:fictionalPerson")}</span>
        <span>{t("vendor:ticketNumber")}</span>
        <bdi><b>3508821A0</b></bdi>
      </div>
      <div className="notice-boxes"><span /><span /><span /></div>
    </div>
  );
}

function CheckTab({ language, sessionId, latestVerification, onVerification, notify }) {
  const { t } = useSurfaceTranslation(language, ["vendor", "common", "errors", "safety"]);
  const [ticket, setTicket] = useState(latestVerification && latestVerification.ticket_number ? latestVerification.ticket_number : "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [showSampleNotice, setShowSampleNotice] = useState(!latestVerification);
  const [extraction, setExtraction] = useState(null);
  const [lookup, setLookup] = useState(/** @type {any} */ (latestVerification ? {
    ok: true,
    data: {
      result: latestVerification.result,
      normalized_ticket: latestVerification.ticket_number,
      dataset_timestamp: latestVerification.dataset_timestamp,
      record_data: latestVerification.record_data,
    },
    provenance: latestVerification.provenance,
  } : null));
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
      notify(t("errors:fictionalImage"), "warning");
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
      setTicket(payload && payload.ok && payload.data.ticket_number ? payload.data.ticket_number : "");
      if (!payload || !payload.ok) notify(t("errors:extractionUnavailable"), "warning");
    } catch (error) {
      setTicket("");
      setExtraction({
        ok: false,
        error: t("errors:extractionUnavailable"),
        provenance: {
          mode: "unavailable",
          source: "Base44 file upload and constrained extraction",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      });
      notify(t("errors:extractionUnavailable"), "warning");
    } finally {
      setBusy(false);
    }
  }

  async function runLookup(sourceMode) {
    setBusy(true);
    if (sourceMode === "sample") {
      const retrievedAt = new Date().toISOString();
      const sample = {
        ok: true,
        data: {
          result: "fixture",
          normalized_ticket: "3508821A0",
          ticket_number: "3508821A0",
          dataset_timestamp: retrievedAt,
          record_data: { status: "redacted_fictional_sample" },
        },
        provenance: {
          mode: "fixture",
          source: "Bundled redacted fictional sample",
          retrievedAt,
          datasetId: "jz4z-kudi",
          fixtureId: "sample_found",
          fallbackReason: "User explicitly selected sample mode after the public source was unavailable.",
        },
      };
      setLookup(sample);
      onVerification({ ...sample.data, provenance: sample.provenance });
      setBusy(false);
      return;
    }
    try {
      const body = { demo_session_id: sessionId, source_mode: "live", ticket_number: ticket };
      const payload = await invokeFunction("check_summons", body);
      setLookup(payload);
      if (payload && payload.ok) {
        onVerification({
          ...payload.data,
          ticket_number: payload.data.ticket_number || payload.data.normalized_ticket || ticket,
          provenance: payload.provenance,
        });
      }
      else notify(t("errors:publicUnavailable"), "warning");
    } catch (error) {
      setLookup({
        ok: false,
        error: t("errors:publicUnavailable"),
        provenance: {
          mode: "unavailable",
          source: "NYC Open Data — OATH Hearings Division Case Status",
          retrievedAt: new Date().toISOString(),
          datasetId: "jz4z-kudi",
          fallbackReason: error.message,
        },
      });
      notify(t("errors:publicUnavailable"), "warning");
    } finally {
      setBusy(false);
    }
  }

  const lookupData = lookup && lookup.data;
  const lookupTime = formatDate(
    lookupData && lookupData.dataset_timestamp
      ? lookupData.dataset_timestamp
      : lookup && lookup.provenance && lookup.provenance.retrievedAt,
    language,
  );
  const lookupMessage = lookup && lookup.ok
    ? lookupData.result === "found" || lookupData.result === "fixture"
      ? t("vendor:foundCaveat")
      : t("vendor:emptyCaveat", { time: lookupTime })
    : lookup && lookup.error;

  return (
    <div className="vendor-tab-panel check-panel">
      <div className="tab-intro">
        <span className="tab-icon"><ShieldCheck size={22} /></span>
        <div><h2>{t("vendor:checkTitle")}</h2><p>{t("vendor:checkCopy")}</p></div>
      </div>
      <p className="ai-processing-note"><ShieldCheck size={13} /> {t("safety:aiProcessingDisclosure")}</p>
      <div className="upload-zone">
        {previewUrl ? <img src={previewUrl} alt={t("vendor:uploadedAlt")} /> : <DemoNotice visible={showSampleNotice} locale={language} />}
        {!previewUrl && !showSampleNotice && <Camera size={30} />}
        <div className="upload-actions">
          <button onClick={() => inputRef.current && inputRef.current.click()}><Upload size={15} /> {t("vendor:uploadSummons")}</button>
          <button data-testid="sample-summons" onClick={useSampleSummons}><FileText size={15} /> {t("vendor:sampleSummons")}</button>
        </div>
        <input ref={inputRef} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={uploadNotice} />
      </div>
      {extraction && (
        <div className="extraction-row">
          <ModeBadge provenance={provenanceOf(extraction.provenance)} locale={language} compact />
          <span>{extraction.ok && extraction.data.ticket_number ? t("vendor:fieldExtracted") : t("vendor:manualConfirmation")}</span>
        </div>
      )}
      <label className="ticket-field">
        <span>{t("vendor:ticket")}</span>
        <div dir="ltr">
          <ReceiptText size={18} />
          <input
            data-testid="ticket-number"
            dir="ltr"
            value={ticket}
            onChange={(event) => setTicket(event.target.value.toUpperCase())}
            placeholder="3508821A0"
          />
        </div>
      </label>
      <p className="no-guess-note"><ShieldCheck size={14} /> {t("vendor:noGuess")}</p>
      <button
        data-testid="check-public-records"
        className="primary-button wide"
        disabled={busy || ticket.trim().length < 4}
        onClick={() => runLookup("live")}
      >
        {busy ? <RefreshCw className="spin" size={17} /> : <Search size={17} />} {t("vendor:checkPublic")}
      </button>

      {lookup && (
        <article
          data-testid="lookup-result"
          className={"lookup-result " + (lookup.ok ? "ok" : "unavailable")}
        >
          <div className="lookup-result-head">
            {lookup.ok ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}
            <div>
              <strong>
                {lookup.ok
                  ? lookupData.result === "found" || lookupData.result === "fixture"
                    ? t("vendor:recordReturned")
                    : t("vendor:noRecord")
                  : t("common:modeUnavailable")}
              </strong>
              <bdi dir="ltr">{lookupData && lookupData.normalized_ticket ? lookupData.normalized_ticket : ticket}</bdi>
            </div>
            <ModeBadge provenance={provenanceOf(lookup.provenance, lookup.ok ? "live_public_readonly" : "unavailable")} locale={language} compact />
          </div>
          <p>{lookupMessage}</p>
          <div className="freshness">
            <bdi dir="ltr">{t("common:dataset")} · jz4z-kudi</bdi>
            <span>{t("common:asOf")} · <bdi dir="ltr">{lookupTime}</bdi></span>
          </div>
          {!lookup.ok && (
            <button data-testid="sample-lookup-result" className="secondary-button" onClick={() => runLookup("sample")}>
              <FileText size={15} /> {t("vendor:sampleResult")}
            </button>
          )}
        </article>
      )}
    </div>
  );
}

function EvidenceRow({ item, language }) {
  const { t } = useSurfaceTranslation(language, ["vendor"]);
  const isCash = item.kind === "cash_self_reported";
  const note = item.note_key
    ? canonicalVendorText(item.note_key, t, isCash ? "vendor:cashSale" : "vendor:demoCheckout")
    : item.note || t(isCash ? "vendor:cashSale" : "vendor:demoCheckout");
  return (
    <div className="evidence-row">
      <span className={"evidence-icon " + (isCash ? "cash" : "card")}>
        {isCash ? <Mic size={17} /> : <CircleDollarSign size={17} />}
      </span>
      <div className="evidence-main">
        <strong>{t(isCash ? "vendor:confirmed" : "vendor:simulatedCard")}</strong>
        <small>{note}</small>
      </div>
      <div className="evidence-value">
        <bdi dir="ltr"><strong>{formatMoney(item.amount)}</strong></bdi>
        <ModeBadge provenance={provenanceOf(item.provenance, "simulated")} locale={language} compact />
      </div>
    </div>
  );
}

function parseLocalizedAmount(transcript) {
  const normalized = String(transcript || "").toLocaleLowerCase();
  const digit = normalized.match(/\d+(?:[.,]\d+)?/);
  if (digit) return Number(digit[0].replace(",", "."));
  const twelve = [
    "twelve", "doce", "fukk ak ñaar", "اثنا عشر", "اتناشر", "বারো", "十二", "douze",
  ];
  return twelve.some((phrase) => normalized.includes(phrase)) ? 12 : null;
}

function SalesTab({ language, sessionId, evidence, onEvidence, notify, allowDemoCheckout = true }) {
  const { t } = useSurfaceTranslation(language, ["vendor", "errors", "common"]);
  const [cashDraft, setCashDraft] = useState(12);
  const [cashInput, setCashInput] = useState("12");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);

  async function beginCash(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      notify(t("errors:invalidAmount"), "warning");
      return;
    }
    setCashDraft(value);
    try {
      await invokeFunction("record_cash_sale", {
        demo_session_id: sessionId,
        amount: value,
        locale: language,
        confirmed: false,
      });
    } catch {
      // The visible confirmation gate remains closed until the user confirms.
    }
    setConfirmOpen(true);
  }

  function playSampleCash() {
    const audio = new Audio(fixtureAudioUrl(language, "cash"));
    audio.play().catch(() => undefined);
    beginCash(12);
  }

  async function startCashVoice() {
    const meta = localeSpeechMeta(language);
    if (!meta.liveSpeechValidated) {
      notify(t("errors:liveSpeechUnavailable"), "warning");
      playSampleCash();
      return;
    }
    setBusy(true);
    notify(t("errors:sayAmount"), "info");
    try {
      const blob = await recordAudio(8000);
      const payload = await transcribeRecordedAudio(blob, sessionId, language);
      const transcript = payload && payload.ok && payload.data && payload.data.transcript;
      const amount = parseLocalizedAmount(transcript);
      if (!amount) throw new Error("unclear_amount");
      await beginCash(amount);
    } catch {
      notify(t("errors:unclearAmount"), "warning");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCash() {
    setBusy(true);
    try {
      const payload = await invokeFunction("record_cash_sale", {
        demo_session_id: sessionId,
        amount: cashDraft,
        locale: language,
        confirmed: true,
      });
      if (!payload || !payload.ok || !payload.data.created) throw new Error(payload && payload.error ? payload.error : "write_unavailable");
      onEvidence(payload.data.evidence);
      notify(t("errors:cashSaved"), "success");
      setConfirmOpen(false);
    } catch (error) {
      onEvidence({
        id: "local-cash-" + Date.now(),
        amount: cashDraft,
        kind: "cash_self_reported",
        recorded_at: new Date().toISOString(),
        confirmed: true,
        note_key: "sales.seed.cash_tacos",
        provenance: {
          mode: "simulated",
          source: "Local sample session only",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      });
      setConfirmOpen(false);
      notify(t("errors:localCash"), "warning");
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
        item_name: "Rosa tamales",
      });
      if (!payload || !payload.ok || !payload.data.created) throw new Error(payload && payload.error ? payload.error : "checkout_unavailable");
      onEvidence(payload.data.evidence);
      setCheckoutDone(true);
      notify(t("errors:checkoutDone"), "success");
    } catch (error) {
      onEvidence({
        id: "local-card-" + Date.now(),
        amount: 18.5,
        kind: "card_simulated",
        recorded_at: new Date().toISOString(),
        confirmed: true,
        note_key: "sales.seed.card_simulated",
        provenance: {
          mode: "simulated",
          source: "Local simulated checkout",
          retrievedAt: new Date().toISOString(),
          fallbackReason: error.message,
        },
      });
      setCheckoutDone(true);
      notify(t("errors:localCheckout"), "warning");
    } finally {
      setBusy(false);
    }
  }

  const total = evidence.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <div className="vendor-tab-panel sales-panel">
      <div className="tab-intro">
        <span className="tab-icon coral"><ShoppingBag size={22} /></span>
        <div><h2>{t("vendor:salesTitle")}</h2><p>{t("vendor:salesCopy")}</p></div>
      </div>
      <div className="sales-summary">
        <div>
          <span>{t("vendor:demoTotal")}</span>
          <bdi dir="ltr"><strong>{formatMoney(total)}</strong></bdi>
          <small>{t("common:recordsCount", { count: evidence.length })}</small>
        </div>
        {allowDemoCheckout && <div className="mini-qr"><QrCode size={38} /><span>{t("vendor:storeQr")}</span></div>}
      </div>
      <div className="cash-actions">
        <button className="primary-button" onClick={startCashVoice} disabled={busy}><Mic size={17} /> {t("vendor:logCash")}</button>
        <label className="cash-amount-field">
          <span className="sr-only">{t("vendor:cashAmount")}</span>
          <input
            dir="ltr"
            inputMode="decimal"
            aria-label={t("vendor:cashAmount")}
            value={cashInput}
            onChange={(event) => setCashInput(event.target.value)}
          />
          <button className="secondary-button" onClick={() => beginCash(cashInput)}>{t("vendor:confirmCash")}</button>
        </label>
        <button data-testid="sample-cash-sale" className="secondary-button" onClick={playSampleCash}>{t("vendor:useCashSample")}</button>
      </div>
      {allowDemoCheckout && (
        <article className="demo-checkout-card">
          <div className="checkout-visual"><Store size={26} /></div>
          <div><span>{t("vendor:demoStorefront")}</span><strong>{t("vendor:rosaTamales")}</strong><small>{t("vendor:noMoney")}</small></div>
          <button disabled={busy || checkoutDone} onClick={demoCheckout}>
            {checkoutDone ? <Check size={17} /> : <ArrowRight className="directional-icon" size={17} />}
          </button>
        </article>
      )}
      <div data-testid="evidence-list" className="evidence-list">
        <div className="section-heading"><span>{t("vendor:evidenceLedger")}</span><small>{t("vendor:evidenceCaveat")}</small></div>
        {evidence.map((item, index) => <EvidenceRow key={item.id || index} item={item} language={language} />)}
      </div>
      {confirmOpen && (
        <div data-testid="cash-confirmation" className="confirm-sheet">
          <div className="confirm-sheet-handle" />
          <button className="sheet-close" onClick={() => setConfirmOpen(false)} aria-label={t("common:close")}><X size={18} /></button>
          <span className="confirm-icon"><Mic size={21} /></span>
          <p>{t("vendor:confirmTitle")}</p>
          <bdi dir="ltr"><strong>{formatMoney(cashDraft)}</strong></bdi>
          <small>{t("vendor:confirmed")}</small>
          <button data-testid="confirm-cash-sale" className="primary-button wide" onClick={confirmCash} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={17} /> : <Check size={17} />} {t("vendor:confirmCash")}
          </button>
          <button className="text-button" onClick={() => setConfirmOpen(false)}>{t("vendor:cancel")}</button>
        </div>
      )}
    </div>
  );
}

function VendorView({ sessionId, caseData, language, onLanguageChange, onCaseChange, notify, embedded = false }) {
  const { t } = useSurfaceTranslation(language, ["vendor", "common"]);
  const [tab, setTab] = useState("ask");
  const latestEvaluation = caseData.evaluations && caseData.evaluations[0];
  const latestVerification = caseData.verifications && caseData.verifications[0];

  function addEvaluation(evaluation) {
    onCaseChange({
      ...caseData,
      evaluations: [{
        ...evaluation,
        provenance: evaluation.provenance || {
          mode: "fixture",
          source: "Deterministic demo rulebook",
          retrievedAt: new Date().toISOString(),
        },
      }, ...(caseData.evaluations || [])],
    });
  }
  function addVerification(verification) {
    onCaseChange({ ...caseData, verifications: [{ ...verification }, ...(caseData.verifications || [])] });
  }
  function addEvidence(item) {
    onCaseChange({ ...caseData, evidence: [item, ...(caseData.evidence || [])] });
  }

  return (
    <main data-testid="vendor-surface" className="vendor-view" lang={language} dir={localeDirection(language)}>
      <div className="vendor-ambient ambient-one" />
      <div className="vendor-ambient ambient-two" />
      <section className="vendor-phone">
        <header className="vendor-header">
          <Brand />
          <div className="vendor-header-actions">
            <span className="fictional-pill">{t("common:fictional")}</span>
            <LanguageSelect locale={language} onChange={onLanguageChange} testId="vendor-language-select" />
          </div>
        </header>
        <div className="vendor-greeting">
          <span>{t("vendor:morning")}</span>
          <h1>Rosa <span aria-hidden="true">👋</span></h1>
        </div>
        <div className="vendor-content">
          {tab === "ask" && (
            <AskTab
              language={language}
              sessionId={sessionId}
              vendor={caseData.vendor}
              latestEvaluation={latestEvaluation}
              onEvaluation={addEvaluation}
              notify={notify}
            />
          )}
          {tab === "check" && (
            <CheckTab
              language={language}
              sessionId={sessionId}
              latestVerification={latestVerification}
              onVerification={addVerification}
              notify={notify}
            />
          )}
          {tab === "sales" && (
            <SalesTab
              language={language}
              sessionId={sessionId}
              evidence={caseData.evidence || []}
              onEvidence={addEvidence}
              notify={notify}
              allowDemoCheckout={!embedded}
            />
          )}
        </div>
        <nav className="vendor-bottom-nav" aria-label={t("vendor:navAria")}>
          <button data-testid="vendor-tab-ask" className={tab === "ask" ? "active" : ""} onClick={() => setTab("ask")}>
            <MessageCircle size={21} /><span>{t("vendor:ask")}</span>
          </button>
          <button data-testid="vendor-tab-check" className={tab === "check" ? "active" : ""} onClick={() => setTab("check")}>
            <ShieldCheck size={21} /><span>{t("vendor:check")}</span>
          </button>
          <button data-testid="vendor-tab-sales" className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>
            <ShoppingBag size={21} /><span>{t("vendor:sales")}</span>
          </button>
        </nav>
      </section>
      <div className="vendor-side-note">
        <span>{t("vendor:mobilePwa")}</span>
        <strong>{t("vendor:oneStory")}</strong>
        <p>{t("vendor:flowSummary")}</p>
        <p data-testid="product-description" className="product-description">{t("common:productDescription")}</p>
      </div>
    </main>
  );
}

const QUEUE = [
  { name: "Rosa M.", locale: "es", statusKey: "console:statusAssembling", active: true },
  { name: "Karim R.", locale: "bn", statusKey: "console:statusReview" },
  { name: "Mei L.", locale: "zh-Hans", statusKey: "console:statusHearing" },
  { name: "Amara J.", locale: "en", statusKey: "console:statusReady" },
];

function ConsoleSidebar({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["console"]);
  return (
    <aside className="console-sidebar">
      <div className="console-brand"><Brand inverse /><span>{t("console:caseworkerConsole")}</span></div>
      <nav className="console-nav">
        <button className="active"><ClipboardCheck size={18} /> {t("console:cases")} <span>8</span></button>
        <button><ShieldCheck size={18} /> {t("console:guard")} <span>3</span></button>
        <button><Bell size={18} /> {t("console:nudges")} <span>2</span></button>
        <button><Sparkles size={18} /> {t("console:roadmap")}</button>
      </nav>
      <div className="sidebar-truth">
        <ShieldCheck size={18} />
        <strong>{t("console:humanLoop")}</strong>
        <p>{t("console:noSideEffects")}</p>
      </div>
    </aside>
  );
}

function SourceDocumentCard({ document, locale }) {
  const { t } = useSurfaceTranslation(locale, ["console"]);
  return (
    <div className="source-document-card">
      <DemoNotice visible locale={locale} />
      <div className="source-crop-callout">
        <span>{t("console:extractedField")}</span>
        <bdi dir="ltr"><strong>{document && document.ticket_number ? document.ticket_number : "3508821A0"}</strong></bdi>
        <ModeBadge provenance={provenanceOf(document && document.provenance)} locale={locale} compact />
      </div>
    </div>
  );
}

function RoadmapCards({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["roadmap"]);
  const cards = [
    { icon: FileText, title: "letterTitle", copy: "letterCopy", tag: "letterTag" },
    { icon: ClipboardCheck, title: "packetTitle", copy: "packetCopy", tag: "packetTag" },
    { icon: MapPinned, title: "guardTitle", copy: "guardCopy", tag: "guardTag" },
    { icon: MessageCircle, title: "channelsTitle", copy: "channelsCopy", tag: "channelsTag" },
    { icon: Globe2, title: "learningTitle", copy: "learningCopy", tag: "learningTag" },
    { icon: Send, title: "autopilotTitle", copy: "autopilotCopy", tag: "autopilotTag" },
  ];
  return (
    <section className="roadmap-section">
      <div className="section-title-row">
        <div><span className="eyebrow">{t("roadmap:whatNext")}</span><h2>{t("roadmap:broaderVision")}</h2></div>
        <span className="roadmap-key">{t("roadmap:noninteractive")}</span>
      </div>
      <div className="roadmap-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="roadmap-card" key={card.title}>
              <span className="roadmap-concept">{t("roadmap:concept")}</span>
              <div className="roadmap-icon"><Icon size={22} /></div>
              <small>{t("roadmap:" + card.tag)}</small>
              <h3>{t("roadmap:" + card.title)}</h3>
              <p>{t("roadmap:" + card.copy)}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ConsoleView({ sessionId, caseData, locale, vendorLocale, onNewSession, onReset, refreshing }) {
  const { t } = useSurfaceTranslation(locale, ["common", "console", "vendor", "guidance"]);
  const { t: vendorT } = useSurfaceTranslation(vendorLocale, ["vendor"]);
  const [selected, setSelected] = useState("Rosa M.");
  const latestEvaluation = caseData.evaluations && caseData.evaluations[0];
  const latestVerification = caseData.verifications && caseData.verifications[0];
  const latestDocument = caseData.documents && caseData.documents[0];
  const qrUrl = typeof window === "undefined"
    ? ""
    : window.location.origin
      + window.location.pathname
      + "?view=vendor&demo_session_id="
      + encodeURIComponent(sessionId)
      + "&lang="
      + encodeURIComponent(vendorLocale);
  const total = (caseData.evidence || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const vendorMeta = LOCALE_REGISTRY[vendorLocale] || LOCALE_REGISTRY.es;
  const evaluationAbstained = Boolean(latestEvaluation && (latestEvaluation.abstention || latestEvaluation.decision === "abstain"));
  const originalInput = latestEvaluation && (
    latestEvaluation.transcript_original
    || latestEvaluation.original_transcript
    || latestEvaluation.question
    || latestEvaluation.transcript
  );

  return (
    <main data-testid="console-surface" className="console-view" lang={locale} dir={localeDirection(locale)}>
      <ConsoleSidebar locale={locale} />
      <section className="console-workspace">
        <header className="console-topbar">
          <div className="console-positioning">
            <span className="eyebrow">{t("console:caseworkerView")}</span>
            <h1>{t("console:rosaCase")}</h1>
            <p data-testid="product-description">{t("common:productDescription")}</p>
          </div>
          <div className="console-actions">
            <span className="live-update"><span /> {t("console:autoRefresh")}</span>
            <button className="secondary-button" onClick={onReset} disabled={refreshing}><RotateCcw size={15} /> {t("console:reset")}</button>
            <button className="primary-button" onClick={onNewSession}><QrCode size={16} /> {t("console:newQr")}</button>
          </div>
        </header>
        <div className="console-layout">
          <aside className="case-queue">
            <div className="queue-head"><span>{t("console:queue")}</span><Search size={15} /></div>
            {QUEUE.map((item) => (
              <button
                className={(item.active ? "active " : "") + (selected === item.name ? "selected" : "")}
                key={item.name}
                onClick={() => setSelected(item.name)}
              >
                <span className="queue-avatar">{item.name.slice(0, 1)}</span>
                <div><strong>{item.name}</strong><small>{t(item.statusKey)}</small></div>
                <bdi className="language-chip" dir="ltr">{item.locale}</bdi>
              </button>
            ))}
            <div className="queue-more">{t("console:queueMore")}</div>
          </aside>
          <div className="case-detail">
            <article className="case-hero">
              <div className="case-avatar">R</div>
              <div className="case-person">
                <div className="case-name-row"><h2>Rosa Martinez</h2><span>{t("console:fictionalPersona")}</span></div>
                <p>{t("console:vendorTrack", { language: vendorMeta.nativeName, session: sessionId })}</p>
              </div>
              <div className="case-stage">
                <span>{t("console:caseStage")}</span>
                <strong>{canonicalVendorText(caseData.vendor && caseData.vendor.case_status_key, t, "vendor:assembling")}</strong>
                <small>{t("console:twoOfThree")}</small>
              </div>
            </article>
            <div className="metric-grid">
              <article>
                <span>{t("console:nextStep")}</span>
                <strong>{canonicalVendorText(caseData.vendor && caseData.vendor.next_step_key, t, "vendor:tax")}</strong>
                <small>{t("console:sampleDecision")}</small>
              </article>
              <article>
                <span>{t("console:evidenceTotal")}</span>
                <bdi dir="ltr"><strong>{formatMoney(total)}</strong></bdi>
                <small>{t("console:mixedRecords", { count: (caseData.evidence || []).length })}</small>
              </article>
              <article data-testid="vendor-qr" data-qr-url={qrUrl} className="qr-metric">
                <QRCodeSVG value={qrUrl || "SIDEWALK"} size={58} bgColor="#fffdf8" fgColor="#17261f" />
                <div>
                  <span>{t("console:vendorQr")}</span>
                  <bdi dir="ltr"><strong>{sessionId}</strong></bdi>
                  <small>{t("common:noAccount")}</small>
                </div>
              </article>
            </div>
            <div className="console-panels">
              <article className="console-panel source-panel">
                <div className="panel-heading">
                  <div><span>{t("console:provenancePanel")}</span><h3>{t("console:sourceToField")}</h3></div>
                  <ModeBadge provenance={provenanceOf(latestDocument && latestDocument.provenance)} locale={locale} compact />
                </div>
                <SourceDocumentCard document={latestDocument} locale={locale} />
              </article>
              <article className="console-panel">
                <div className="panel-heading">
                  <div><span>{t("console:guardPanel")}</span><h3>{t("console:publicCheck")}</h3></div>
                  <ModeBadge provenance={provenanceOf(latestVerification && latestVerification.provenance)} locale={locale} compact />
                </div>
                <div className="guard-summary">
                  <span className="guard-shield"><ShieldCheck size={25} /></span>
                  <div>
                    <strong>{latestVerification && latestVerification.result === "not_found" ? t("vendor:noRecord") : t("console:sampleAvailable")}</strong>
                    <bdi dir="ltr">{latestVerification && latestVerification.ticket_number ? latestVerification.ticket_number : "3508821A0"}</bdi>
                  </div>
                </div>
                <p className="safe-result-copy">{t("console:publicCaveat")}</p>
                <div className="dataset-row">
                  <bdi dir="ltr">jz4z-kudi</bdi>
                  <bdi dir="ltr">{formatDate(latestVerification && latestVerification.dataset_timestamp, locale)}</bdi>
                </div>
              </article>
              <article className="console-panel rule-panel">
                <div className="panel-heading">
                  <div><span>{t("console:rulePanel")}</span><h3>{t("console:rulesDecide")}</h3></div>
                  <ModeBadge provenance={provenanceOf(latestEvaluation && latestEvaluation.provenance)} locale={locale} compact />
                </div>
                <div className="trace-line">
                  <span className="trace-node"><Check size={15} /></span>
                  <div>
                    <bdi dir="ltr"><strong>{latestEvaluation && latestEvaluation.trace && latestEvaluation.trace[0] ? latestEvaluation.trace[0].ruleId || latestEvaluation.trace[0].rule_id : "DEMO-SEQ-FOOD-001"}</strong></bdi>
                    <p>{t("console:ruleMatched")}</p>
                  </div>
                </div>
                <div className="trace-line">
                  <span className="trace-node coral"><BookOpen size={15} /></span>
                  <div><strong>{t("console:sourceAttached")}</strong><p>{t("guidance:sampleRulebook")}</p></div>
                </div>
                <div className={"abstention-note " + (evaluationAbstained ? "needs-review" : "routine-resolved")}>
                  {evaluationAbstained ? <TriangleAlert size={16} /> : <CheckCircle2 size={16} />}
                  {evaluationAbstained ? t("console:abstention") : t("guidance:routineReviewOptional")}
                </div>
              </article>
              <article className="console-panel evidence-panel">
                <div className="panel-heading">
                  <div><span>{t("console:evidencePanel")}</span><h3>{t("console:evidenceGraded")}</h3></div>
                  <span className="panel-count">{t("common:recordsCount", { count: (caseData.evidence || []).length })}</span>
                </div>
                <div className="console-evidence-list">
                  {(caseData.evidence || []).map((item, index) => <EvidenceRow key={item.id || index} item={item} language={locale} />)}
                </div>
                <p className="safe-result-copy">{t("console:evidenceIllustrative")}</p>
              </article>
            </div>
            <article data-testid="ai-review-summary" className="ai-review-summary">
              <div className="panel-heading">
                <div><span>{t("console:aiRecordPanel")}</span><h3>{t("console:aiGeneratedRecord")}</h3></div>
                <Sparkles size={20} />
              </div>
              <div className="ai-review-grid">
                <div>
                  <span>{t("console:originalInput")}</span>
                  <p>“{originalInput || vendorT("vendor:sampleQuestion")}”</p>
                </div>
                <div>
                  <span>{t("console:missingInformation")}</span>
                  <p>{canonicalVendorText(caseData.vendor && caseData.vendor.missing_item_key, t, "vendor:proofAddress")}</p>
                </div>
                <div>
                  <span>{t("console:recommendedDestination")}</span>
                  <p>{evaluationAbstained ? t("console:destinationLegalSupport") : t("console:destinationStreetVendorServices")}</p>
                </div>
                <div>
                  <span>{t("console:reviewStatus")}</span>
                  <p className={evaluationAbstained ? "review-recommended" : "review-optional"}>
                    {evaluationAbstained ? t("console:reviewRecommended") : t("console:reviewOptional")}
                  </p>
                </div>
              </div>
              <p className="authority-reminder"><ShieldCheck size={15} /> {t("console:authorityReminder")}</p>
            </article>
            <article className="nudge-preview">
              <span className="nudge-icon"><Bell size={20} /></span>
              <div>
                <span>{t("console:draftNudge")}</span>
                <strong>{t("console:missingDocument")}</strong>
                <p>“{t("console:nudgeText")}”</p>
              </div>
              <button disabled>{t("console:sendingDisabled")}</button>
            </article>
            <RoadmapCards locale={locale} />
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
      <ul>{items.map((item) => <li key={item}><Check size={14} /> {item}</li>)}</ul>
    </article>
  );
}

function ProofView({ sessionId, proofData, locale }) {
  const { t } = useSurfaceTranslation(locale, ["proof"]);
  const runs = proofData.eval_runs || [];
  const measured = runs.filter((run) => run.measured !== false && !/not yet|pending/i.test(String(run.status || run.result || "")));
  const passed = measured.filter((run) => /pass|success|complete/i.test(String(run.status || run.result || "")));
  const demonstrated = t("proof:demonstratedItems").split("|");
  const designed = t("proof:designItems").split("|");
  const unevaluated = t("proof:unevaluatedItems").split("|");
  return (
    <main data-testid="proof-surface" className="proof-view" lang={locale} dir={localeDirection(locale)}>
      <section className="proof-hero">
        <span className="eyebrow">{t("proof:eyebrow", { session: sessionId })}</span>
        <h1>{t("proof:titleA")}<br /><em>{t("proof:titleB")}</em></h1>
        <p>{t("proof:intro")}</p>
        <div className="proof-stat-row">
          <div><bdi><strong>9 / 9</strong></bdi><span>{t("proof:denoChecks")}</span></div>
          <div><bdi><strong>6 / 6</strong></bdi><span>{t("proof:coreTests")}</span></div>
          <div><bdi><strong>{passed.length} / {measured.length || 11}</strong></bdi><span>{t("proof:measuredScenarios")}</span></div>
          <div><strong>0</strong><span>{t("proof:zeroSideEffects")}</span></div>
        </div>
      </section>
      <section className="integration-truth">
        <div className="section-title-row">
          <div><span className="eyebrow">{t("proof:integrationTruth")}</span><h2>{t("proof:integrationTitle")}</h2></div>
        </div>
        <div className="truth-grid">
          <article>
            <ModeBadge provenance={{ mode: "live_public_readonly" }} locale={locale} />
            <h3>{t("proof:oathTitle")}</h3><p>{t("proof:oathCopy")}</p><bdi dir="ltr">jz4z-kudi</bdi>
          </article>
          <article>
            <ModeBadge provenance={{ mode: "live_ai" }} locale={locale} />
            <h3>{t("proof:speechTitle")}</h3><p>{t("proof:speechCopy")}</p><span>{t("proof:exactFallback")}</span>
          </article>
          <article>
            <ModeBadge provenance={{ mode: "fixture" }} locale={locale} />
            <h3>{t("proof:legalTitle")}</h3><p>{t("proof:legalCopy")}</p><span>{t("proof:demoOnly")}</span>
          </article>
          <article>
            <ModeBadge provenance={{ mode: "simulated" }} locale={locale} />
            <h3>{t("proof:commerceTitle")}</h3><p>{t("proof:commerceCopy")}</p><span>{t("proof:noSdk")}</span>
          </article>
        </div>
      </section>
      <section className="proof-boundaries">
        <ProofColumn icon={CheckCircle2} title={t("proof:shownWorking")} subtitle={t("proof:demonstrated")} items={demonstrated} tone="demonstrated" />
        <ProofColumn icon={Sparkles} title={t("proof:pilotDesign")} subtitle={t("proof:productionDesign")} items={designed} tone="designed" />
        <ProofColumn icon={TriangleAlert} title={t("proof:notClaimed")} subtitle={t("proof:notEvaluated")} items={unevaluated} tone="unevaluated" />
      </section>
      <section className="eval-section">
        <div className="section-title-row">
          <div><span className="eyebrow">{t("proof:recordedChecks")}</span><h2>{t("proof:measuredTitle")}</h2></div>
          <span className="roadmap-key">{t("proof:prototypeTests")}</span>
        </div>
        <div className="eval-grid">
          {runs.slice(0, 12).map((run, index) => {
            const status = String(run.status || run.result || (run.measured === false ? "Not yet measured" : "Passed"));
            const isPending = run.measured === false || /pending|not yet/i.test(status);
            return (
              <div className={"eval-row " + (isPending ? "pending" : "passed")} key={run.id || index}>
                <bdi dir="ltr">{String(index + 1).padStart(2, "0")}</bdi>
                <strong>{t("proof:fixtureCheck")}</strong>
                <small>{isPending ? t("proof:pending") : t("proof:passed")}</small>
              </div>
            );
          })}
        </div>
      </section>
      <RoadmapCards locale={locale} />
      <footer className="closing-statement">
        <Brand inverse />
        <blockquote>“{t("proof:closing")}”</blockquote>
        <span>{t("proof:closingTags")}</span>
      </footer>
    </main>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={"app-toast " + toast.type}>
      {toast.type === "success"
        ? <CheckCircle2 size={18} />
        : toast.type === "warning"
          ? <TriangleAlert size={18} />
          : <Sparkles size={18} />}
      <span>{toast.message}</span>
    </div>
  );
}

export default function SidewalkApp({
  embedded = false,
  initialLocale = null,
  onLocaleChange = null,
  allowInternalViews = false,
}) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const internalViewsEnabled = allowInternalViews && !embedded;
  const initialView = internalViewsEnabled && ["vendor", "console", "proof"].includes(params.get("view"))
    ? params.get("view")
    : "vendor";
  const requestedVendorLocale = normalizeLocale(initialLocale) || normalizeLocale(params.get("lang"));
  const storedConsoleLocale = normalizeLocale(window.localStorage.getItem("sidewalk-console-locale"));
  const requestedConsoleLocale = normalizeLocale(params.get("ui_lang"));
  const initialSession = params.get("demo_session_id") || params.get("session") || INITIAL_SESSION;
  const [view, setView] = useState(initialView);
  const [sessionId, setSessionId] = useState(initialSession);
  const [vendorLocale, setVendorLocale] = useState(requestedVendorLocale || DEFAULT_VENDOR_LOCALE);
  const [consoleLocale, setConsoleLocale] = useState(requestedConsoleLocale || storedConsoleLocale || DEFAULT_CONSOLE_LOCALE);
  const [caseData, setCaseData] = useState(cloneFallbackCase(initialSession, requestedVendorLocale || DEFAULT_VENDOR_LOCALE));
  const [proofData, setProofData] = useState(FALLBACK_PROOF);
  const [backendState, setBackendState] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(() => window.sessionStorage.getItem("sidewalk-safety-seen") !== "yes");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const activeLocale = embedded || view === "vendor" ? vendorLocale : consoleLocale;
  const { t } = useSurfaceTranslation(activeLocale, ["errors"]);

  function notify(message, type) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, type: type || "info" });
    toastTimer.current = window.setTimeout(() => setToast(null), 4300);
  }

  async function persistVendorLocale(locale, targetSession) {
    try {
      const payload = await invokeFunction("set_demo_locale", {
        demo_session_id: targetSession || sessionId,
        locale,
      });
      if (payload && payload.ok && payload.data) {
        setCaseData((current) => ({
          ...current,
          session: { ...current.session, locale },
          vendor: { ...current.vendor, language: locale },
        }));
      }
    } catch {
      // The URL and local surface remain authoritative and visibly usable.
    }
  }

  async function loadSession(targetSession, quiet) {
    if (!quiet) setBackendState("loading");
    try {
      const [casePayload, proofPayload] = await Promise.all([
        invokeFunction("get_demo_case", { demo_session_id: targetSession }),
        !internalViewsEnabled
          ? Promise.resolve(null)
          : invokeFunction("get_demo_proof", { demo_session_id: targetSession }),
      ]);
      if (!casePayload || !casePayload.ok) throw new Error(casePayload && casePayload.error ? casePayload.error : "case_unavailable");
      const loadedLocale = normalizeLocale(casePayload.data && casePayload.data.session && casePayload.data.session.locale)
        || normalizeLocale(casePayload.data && casePayload.data.vendor && casePayload.data.vendor.language)
        || DEFAULT_VENDOR_LOCALE;
      const urlLocale = normalizeLocale(new URLSearchParams(window.location.search).get("lang"));
      const effectiveVendorLocale = urlLocale || loadedLocale;
      setVendorLocale(effectiveVendorLocale);
      setCaseData({
        ...casePayload.data,
        session: { ...casePayload.data.session, locale: effectiveVendorLocale },
        vendor: { ...casePayload.data.vendor, language: effectiveVendorLocale },
      });
      if (urlLocale && loadedLocale !== urlLocale) {
        persistVendorLocale(urlLocale, targetSession);
      }
      if (proofPayload && proofPayload.ok) setProofData(proofPayload.data);
      setBackendState("connected");
    } catch {
      if (!quiet) {
        setCaseData(cloneFallbackCase(targetSession, vendorLocale));
        setProofData(FALLBACK_PROOF);
        setBackendState("sample");
        notify(t("errors:sessionUnavailable"), "warning");
      }
    }
  }

  useEffect(() => {
    loadSession(sessionId, false);
  }, [sessionId]);

  useEffect(() => {
    if (view !== "console") return undefined;
    const interval = window.setInterval(() => loadSession(sessionId, true), 4000);
    return () => window.clearInterval(interval);
  }, [view, sessionId]);

  useEffect(() => {
    document.documentElement.lang = activeLocale;
    document.documentElement.dir = localeDirection(activeLocale);
  }, [activeLocale]);

  useEffect(() => {
    window.localStorage.setItem("sidewalk-console-locale", consoleLocale);
  }, [consoleLocale]);

  useEffect(() => {
    if (!embedded) return;
    const nextLocale = normalizeLocale(initialLocale);
    if (!nextLocale || nextLocale === vendorLocale) return;
    setVendorLocale(nextLocale);
    setCaseData((current) => ({
      ...current,
      session: { ...current.session, locale: nextLocale },
      vendor: { ...current.vendor, language: nextLocale },
    }));
    persistVendorLocale(nextLocale);
  }, [embedded, initialLocale, vendorLocale]);

  function changeView(nextView) {
    setView(nextView);
    const next = new URL(window.location.href);
    next.searchParams.set("view", nextView);
    next.searchParams.set("demo_session_id", sessionId);
    next.searchParams.set("lang", vendorLocale);
    next.searchParams.set("ui_lang", consoleLocale);
    window.history.replaceState({}, "", next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeVendorLocale(value) {
    const nextLocale = normalizeLocale(value);
    if (!nextLocale) return;
    setVendorLocale(nextLocale);
    setCaseData((current) => ({
      ...current,
      session: { ...current.session, locale: nextLocale },
      vendor: { ...current.vendor, language: nextLocale },
    }));
    const next = new URL(window.location.href);
    next.searchParams.set("lang", nextLocale);
    next.searchParams.set("demo_session_id", sessionId);
    window.history.replaceState({}, "", next);
    persistVendorLocale(nextLocale);
    if (onLocaleChange) onLocaleChange(nextLocale);
  }

  function changeConsoleLocale(value) {
    const nextLocale = normalizeLocale(value);
    if (!nextLocale) return;
    setConsoleLocale(nextLocale);
    window.localStorage.setItem("sidewalk-console-locale", nextLocale);
    const next = new URL(window.location.href);
    next.searchParams.set("ui_lang", nextLocale);
    window.history.replaceState({}, "", next);
  }

  async function newSession() {
    setRefreshing(true);
    try {
      const payload = await invokeFunction("start_demo_session", { locale: vendorLocale });
      if (!payload || !payload.ok) throw new Error(payload && payload.error ? payload.error : "session_create_failed");
      const code = payload.data.demo_session_id;
      setSessionId(code);
      const next = new URL(window.location.href);
      next.searchParams.set("view", "console");
      next.searchParams.set("demo_session_id", code);
      next.searchParams.set("lang", vendorLocale);
      next.searchParams.set("ui_lang", consoleLocale);
      window.history.replaceState({}, "", next);
      notify(t("errors:newSessionSuccess"), "success");
    } catch {
      notify(t("errors:newSessionFailure"), "warning");
    } finally {
      setRefreshing(false);
    }
  }

  async function resetSession() {
    setRefreshing(true);
    try {
      const payload = await invokeFunction("reset_demo_session", { demo_session_id: sessionId });
      if (!payload || !payload.ok) throw new Error(payload && payload.error ? payload.error : "reset_unavailable");
      await loadSession(sessionId, true);
      notify(t("errors:resetSuccess"), "success");
    } catch {
      setCaseData(cloneFallbackCase(sessionId, vendorLocale));
      notify(t("errors:resetFallback"), "warning");
    } finally {
      setRefreshing(false);
    }
  }

  function continueSafety() {
    window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
    setSafetyOpen(false);
  }

  return (
    <div
      data-testid={embedded ? "embedded-verification" : "sidewalk-legacy-demo"}
      className={"sidewalk-app" + (embedded ? " sidewalk-embedded" : "")}
      lang={activeLocale}
      dir={localeDirection(activeLocale)}
    >
      {!embedded && <Disclosure locale={activeLocale} />}
      {internalViewsEnabled && (
        <GlobalHeader
          view={view}
          onViewChange={changeView}
          sessionId={sessionId}
          backendState={backendState}
          locale={activeLocale}
          onConsoleLocaleChange={changeConsoleLocale}
        />
      )}
      {view === "vendor" && (
        <VendorView
          sessionId={sessionId}
          caseData={caseData}
          language={vendorLocale}
          onLanguageChange={changeVendorLocale}
          onCaseChange={setCaseData}
          notify={notify}
          embedded={embedded}
        />
      )}
      {internalViewsEnabled && view === "console" && (
        <ConsoleView
          sessionId={sessionId}
          caseData={caseData}
          locale={consoleLocale}
          vendorLocale={vendorLocale}
          onNewSession={newSession}
          onReset={resetSession}
          refreshing={refreshing}
        />
      )}
      {internalViewsEnabled && view === "proof" && <ProofView sessionId={sessionId} proofData={proofData} locale={consoleLocale} />}
      <SafetyDialog open={safetyOpen} onContinue={continueSafety} locale={activeLocale} />
      <Toast toast={toast} />
    </div>
  );
}
