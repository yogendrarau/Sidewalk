import { start_demo_session } from "@/functions/start_demo_session";
import { transcribe_audio } from "@/functions/transcribe_audio";
import { answer_demo_question } from "@/functions/answer_demo_question";
import { extract_summons } from "@/functions/extract_summons";
import { check_summons } from "@/functions/check_summons";
import { record_cash_sale } from "@/functions/record_cash_sale";
import { complete_demo_checkout } from "@/functions/complete_demo_checkout";
import { get_demo_case } from "@/functions/get_demo_case";
import { get_demo_proof } from "@/functions/get_demo_proof";
import { reset_demo_session } from "@/functions/reset_demo_session";
import { base44 } from "@/api/base44Client";

async function unwrap(promise) {
  try {
    const res = await promise;
    return res.data || { ok: false, error: "Empty response" };
  } catch (err) {
    return (err && err.response && err.response.data) || { ok: false, error: (err && err.message) || "Network error" };
  }
}

export const api = {
  startSession: (p) => unwrap(start_demo_session(p)),
  transcribe: (p) => unwrap(transcribe_audio(p)),
  answer: (p) => unwrap(answer_demo_question(p)),
  extractSummons: (p) => unwrap(extract_summons(p)),
  checkSummons: (p) => unwrap(check_summons(p)),
  recordCash: (p) => unwrap(record_cash_sale(p)),
  checkout: (p) => unwrap(complete_demo_checkout(p)),
  getCase: (p) => unwrap(get_demo_case(p)),
  getProof: (p) => unwrap(get_demo_proof(p)),
  reset: (p) => unwrap(reset_demo_session(p)),
  uploadFile: async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  },
};

export const PROVENANCE_LABELS = {
  live_public_readonly: { label: "LIVE PUBLIC DATA", className: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  live_ai: { label: "LIVE AI", className: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  fixture: { label: "SAMPLE DATA", className: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  simulated: { label: "SIMULATED", className: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  unavailable: { label: "UNAVAILABLE", className: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
};

export function speak(text, locale) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale === "en" ? "en-US" : "es-ES";
    window.speechSynthesis.speak(u);
  } catch (e) {
    /* noop */
  }
}

export const DISCLAIMER =
  "Hackathon prototype · Fictional demo data · Not affiliated with NYC · Not legal advice · No real payments, filings, or messages.";
export const FIRST_USE_WARNING =
  "Use only the provided demo materials. Do not enter personal, financial, immigration, or confidential information.";

export const SEED_ASSETS = {
  summons_image_url: "https://media.base44.com/images/public/6a807abba4a26b462c198c81/48f76c2e2_generated_image.png",
  letter_reader_image_url: "https://media.base44.com/images/public/6a807abba4a26b462c198c81/a5f03bfc2_generated_image.png",
  draft_packet_image_url: "https://media.base44.com/images/public/6a807abba4a26b462c198c81/92638a3e5_generated_image.png",
};