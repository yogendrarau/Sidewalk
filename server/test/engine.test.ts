import { describe, it, expect } from "vitest";
import { loadRulebook } from "../src/rulebook.js";
import { evaluate } from "../src/engine.js";
import { evaluate_eligibility } from "../src/functions/evaluate_eligibility.js";
import { explain_reply } from "../src/functions/explain_reply.js";

const rb = loadRulebook();

describe("rulebook", () => {
  it("ships only rules with verified citations", () => {
    expect(rb.records.every((r) => r.citation && r.last_verified)).toBe(true);
    expect(rb.hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("engine (§8) — pure, deterministic, abstaining", () => {
  it("property: byte-identical traces on identical inputs", () => {
    const facts = { vending_kind: "food" as const, wants: "license" as const, completed_steps: ["food_protection_course"] };
    const a = JSON.stringify(evaluate(rb, facts));
    for (let i = 0; i < 25; i++) expect(JSON.stringify(evaluate(rb, facts))).toBe(a);
  });

  it("assigns supervisory_food track for food + license", () => {
    const ev = evaluate(rb, { vending_kind: "food", wants: "license" });
    expect(ev.track).toBe("supervisory_food");
    expect(ev.rules_fired.some((r) => r.rule_id === "ELIG-SUPERV-001")).toBe(true);
  });

  it("sequencer names the state tax certificate first with 4–6 weeks (definition of done §18)", () => {
    const ev = evaluate(rb, { vending_kind: "food", wants: "license" });
    const steps = ev.sequencer!.next_steps.map((s) => s.step);
    expect(steps).toContain("nys_sales_tax_certificate");
    const tax = ev.sequencer!.next_steps.find((s) => s.step === "nys_sales_tax_certificate")!;
    expect(tax.duration_days_range).toEqual([28, 42]);
    expect(steps).not.toContain("submit_license_application"); // blocked by deps
  });

  it("honest total timeline covers the dependency chain", () => {
    const ev = evaluate(rb, { vending_kind: "food", wants: "license" });
    // critical path: max(tax 28-42, course 2-21) then submission 7-14 → [35, 56]
    expect(ev.sequencer!.timeline_days_range).toEqual([35, 56]);
    const done = evaluate(rb, {
      vending_kind: "food", wants: "license",
      completed_steps: ["nys_sales_tax_certificate", "food_protection_course"],
    });
    expect(done.sequencer!.next_steps.map((s) => s.step)).toEqual(["submit_license_application"]);
  });

  it("missing fact → typed abstention naming the fact", () => {
    const ev = evaluate(rb, { wants: "license" });
    expect(ev.track).toBeNull();
    expect(ev.abstentions.some((a) => a.kind === "missing_fact" && a.fact === "vending_kind")).toBe(true);
  });

  it("placement abstains with a physical checklist (TODO(law) values never computed)", () => {
    const ev = evaluate(rb, { topic: "placement" });
    expect(ev.placement?.computable).toBe(false);
    expect(ev.placement!.checklist.length).toBeGreaterThanOrEqual(5);
    expect(ev.abstentions.some((a) => a.kind === "indeterminate" && a.rule_id === "PLACE-001")).toBe(true);
  });

  it("surfaces the veteran fee waiver automatically", () => {
    const ev = evaluate(rb, { vending_kind: "food", wants: "license", is_veteran: true });
    expect(ev.fees[0].amount_usd).toBe(50);
    expect(ev.fees[0].waived_for_veteran).toBe(true);
  });

  it("documents: missing list derived from track requirements", () => {
    const ev = evaluate(rb, { vending_kind: "food", wants: "license", documents_present: ["identity_document"] });
    expect(ev.documents!.missing).toContain("proof_of_address");
    expect(ev.documents!.missing).not.toContain("identity_document");
    expect(ev.documents!.notes.identity_document).toMatch(/foreign passport/i);
  });
});

describe("Gate 1 — Spanish text question → correct cited answer", () => {
  it("es: '¿puedo obtener una licencia si vendo comida?' → supervisory track, cited, gated", async () => {
    const evalRes = await evaluate_eligibility({
      vendor_id: "rosa-test",
      question: "¿Puedo obtener una licencia si vendo comida?",
      facts: { vending_kind: "food", wants: "license" },
    });
    expect(evalRes.ok).toBe(true);
    if (!evalRes.ok) return;
    const ev = evalRes.data.evaluation;
    const rule = ev.rules_fired.find((r) => r.rule_id === "ELIG-SUPERV-001")!;

    const reply = await explain_reply({
      lang: "es",
      question: "¿Puedo obtener una licencia si vendo comida?",
      template_key: "track_supervisory_food",
      template_params: {},
      citations: [{ idx: 1, citation: rule.citation, text: JSON.stringify(rule.outcome) }],
      trace: ev.rules_fired,
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.data.text).toMatch(/supervisora de comida/);
    expect(reply.data.text).toMatch(/2,?200/);
    expect(reply.data.citations[0].citation).toMatch(/Intro 1251/);
    const report = reply.data.gate_report as { pass: boolean };
    expect(report.pass).toBe(true);
    expect(reply.timing_ms).toBeLessThan(10_000);
  });

  it("gate rejects a sentence whose number is not verbatim from the trace", async () => {
    const { entailmentGate } = await import("../src/gate.js");
    const bad = await entailmentGate(
      ["The city issues 9,999 licenses per year. [1]"],
      [{ idx: 1, citation: "Intro 1251", text: "2,200 per year through 2031" }],
      "2,200 per year through 2031",
    );
    expect(bad.pass).toBe(false);
    const good = await entailmentGate(
      ["The city issues 2,200 licenses per year. [1]"],
      [{ idx: 1, citation: "Intro 1251", text: "2,200 per year through 2031" }],
      "2,200 per year through 2031",
    );
    expect(good.pass).toBe(true);
  });

  it("template fallback carries citations in bn/ar/zh too", async () => {
    for (const lang of ["bn", "ar", "zh"]) {
      const reply = await explain_reply({
        lang,
        question: "license?",
        template_key: "track_supervisory_food",
        template_params: {},
        citations: [{ idx: 1, citation: "Intro 1251 / Local Law of 2026", text: "2,200/yr through 2031" }],
        trace: { annual_slots: 2200, window: "through 2031" },
      });
      expect(reply.ok).toBe(true);
      if (reply.ok) {
        expect(reply.data.lang_fallback).toBe(false);
        expect((reply.data.gate_report as { pass: boolean }).pass).toBe(true);
      }
    }
  });
});
