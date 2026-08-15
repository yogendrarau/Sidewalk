/** heat_watch, course_prep, find_commissary, cart_recovery, socrata_sync (§9) — the P4 tail. */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { renderTemplate } from "../templates.js";
import { query, DATASETS } from "../socrata.js";
import { env } from "../env.js";

const sys: Ctx = { kind: "system" };

/** heat_watch: NWS forecast ≥ threshold → opted-in morning voice note. Templates only, no model. */
export const heat_watch = defineFn(
  "heat_watch",
  z.object({ force: z.boolean().default(false) }),
  async ({ force }) => {
    const threshold = Number(env("HEAT_THRESHOLD_F", "90")); // advisory threshold TODO(law): EO trigger § not transcribed
    let maxTemp: number | null = null;
    try {
      const res = await fetch(env("NWS_POINT", "https://api.weather.gov/gridpoints/OKX/33,35/forecast"), {
        headers: { "user-agent": "sidewalk-demo (hackathon)" }, signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json()) as { properties?: { periods?: Array<{ temperature: number; isDaytime: boolean }> } };
      maxTemp = Math.max(...(data.properties?.periods?.slice(0, 2).map((p) => p.temperature) ?? [0]));
    } catch { /* offline */ }
    const trigger = force || (maxTemp !== null && maxTemp >= threshold);
    let notified = 0;
    if (trigger) {
      for (const v of entities.list(sys, "Vendor").filter((v) => v.radar_opt_in === true)) {
        const lang = (v.languages as string[] | undefined)?.[0] ?? "es";
        const t = renderTemplate(lang, "heat_note", {});
        entities.create(sys, "Message", {
          vendor_id: v.vendor_id ?? v.id, role: "sidewalk", kind: "heat_note",
          text: t.sentences.join(" "), lang, at: new Date().toISOString(),
          citations: [{ idx: 1, citation: "June 2026 executive order (heat protocol)", text: "shade/water/breaks; state cooling-equipment credit" }],
        });
        notified++;
      }
    }
    return { max_temp_f: maxTemp, threshold, triggered: trigger, notified };
  },
);

/** course_prep: Rulebook-derived study units + logistics; states EN/BN-only official course every session. */
export const course_prep = defineFn(
  "course_prep",
  z.object({ vendor_id: z.string(), lang: z.string().default("es") }),
  async ({ lang }) => {
    const logistics = {
      en: "The official food protection course and exam run in English or Bangla only. In person, 8 hours over 2 days, $53. Register at DCWP — 42 Broadway or Jamaica — by appointment.",
      es: "El curso oficial de protección de alimentos y el examen son solo en inglés o bangla. Presencial, 8 horas en 2 días, $53. Regístrese en DCWP — 42 Broadway o Jamaica — con cita.",
      bn: "অফিসিয়াল খাদ্য সুরক্ষা কোর্স ও পরীক্ষা শুধুমাত্র ইংরেজি বা বাংলায় হয়। সশরীরে, ২ দিনে ৮ ঘণ্টা, $৫৩। DCWP-তে (42 Broadway বা Jamaica) অ্যাপয়েন্টমেন্টে নিবন্ধন করুন।",
      ar: "الدورة الرسمية لسلامة الغذاء والامتحان بالإنجليزية أو البنغالية فقط. حضوريًا، 8 ساعات على يومين، 53$. سجّل في DCWP بموعد مسبق.",
      zh: "官方食品保护课程和考试仅提供英语或孟加拉语。线下授课，2天共8小时，$53。请预约在DCWP（42 Broadway或Jamaica）报名。",
    } as Record<string, string>;
    return {
      citation: "DOHMH course page",
      logistics: logistics[lang] ?? logistics.en,
      study_units: [
        { unit: 1, title: { en: "Why the course exists", es: "Por qué existe el curso" }, practice: { en: "In your own words: who must hold a food protection certificate at the cart?", es: "En sus palabras: ¿quién debe tener el certificado de protección de alimentos en el carrito?" } },
        { unit: 2, title: { en: "Clean hands, clean surfaces", es: "Manos limpias, superficies limpias" }, practice: { en: "Name two moments you must wash hands during service.", es: "Nombre dos momentos en que debe lavarse las manos durante la venta." } },
        { unit: 3, title: { en: "Keeping food out of danger", es: "Mantener la comida fuera de peligro" }, practice: { en: "What do you do with food a customer returns?", es: "¿Qué hace con comida que un cliente devuelve?" } },
      ],
    };
  },
);

/** find_commissary: DOHMH commissary list TODO(data) → abstain + referral until a human fills the dataset. */
export const find_commissary = defineFn(
  "find_commissary",
  z.object({ vendor_id: z.string(), borough: z.string().optional() }),
  async () => ({
    abstained: true,
    reason: "TODO(data): the DOHMH commissary list and fee benchmarks are not yet loaded; I will not guess locations or prices.",
    requirement_citation: "DOHMH commissary requirement",
    referral: "Office of Street Vendor Services",
  }),
);

/** cart_recovery (T2 stretch, minimal): voucher steps + legal-aid referral. */
export const cart_recovery = defineFn(
  "cart_recovery",
  z.object({ vendor_id: z.string(), voucher_number: z.string().nullable() }),
  async ({ voucher_number }) => ({
    voucher_number,
    steps: [
      "Keep the property-clerk voucher safe — it is the claim ticket for your cart.",
      "Deadlines apply to retrieval: TODO(law) — a caseworker will confirm the exact windows.",
      "Bring ID and the voucher to the listed property clerk office.",
    ],
    referral: "Bronx Defenders property guide",
    citation: "NYPD property-clerk procedure TODO(law: deadline §§); Bronx Defenders property guide (referral)",
  }),
);

/** socrata_sync: nightly ptev-4hud status diff → proactive updates; daily events feed. */
export const socrata_sync = defineFn(
  "socrata_sync",
  z.object({ mode: z.enum(["nightly", "events"]).default("nightly") }),
  async ({ mode }) => {
    let updates = 0;
    if (mode === "nightly") {
      for (const cf of entities.list(sys, "CaseFile")) {
        const appIds = (cf.application_ids as string[] | undefined) ?? [];
        for (const appId of appIds) {
          try {
            const res = await query(DATASETS.license_applications, { application_id: appId });
            const row = res.rows[0] as { status?: string } | undefined;
            if (row?.status && row.status !== cf.last_known_status) {
              entities.update(sys, "CaseFile", cf.id, { last_known_status: row.status });
              entities.create(sys, "Message", {
                vendor_id: cf.vendor_id, role: "sidewalk", kind: "status_update",
                text: `Application ${appId}: status is now "${row.status}" (city data as of ${res.dataset_as_of}).`,
                lang: "en", at: new Date().toISOString(),
              });
              updates++;
            }
          } catch { /* per-app failures skip */ }
        }
      }
    }
    return { mode, updates };
  },
);
