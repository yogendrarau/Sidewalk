/**
 * Deterministic core (§8). evaluate() is a pure function: no model calls, no clock,
 * no I/O. Property: byte-identical traces on identical inputs.
 * Missing fact → typed abstention naming the fact. Indeterminate rules → abstain with referral.
 */
import type { Rule, Rulebook } from "./rulebook.js";

export type CaseFacts = {
  vending_kind?: "food" | "merchandise";
  wants?: "license";
  instrument?: "civil_summons" | "criminal_looking";
  topic?: string;
  completed_steps?: string[];
  documents_present?: string[];
  is_veteran?: boolean;
};

export type RuleFired = { rule_id: string; inputs: Record<string, unknown>; outcome: unknown; citation: string };
export type Abstention = {
  kind: "missing_fact" | "indeterminate";
  fact?: string;
  rule_id?: string;
  reason: string;
  checklist?: string[];
  referral_kind?: string;
};
export type SequencerResult = {
  track: string;
  next_steps: Array<{ step: string; duration_days_range: [number, number] | null; note?: string; citation: string }>;
  remaining_steps: string[];
  completed_steps: string[];
  timeline_days_range: [number, number] | null;
  timeline_note?: string;
};
export type Evaluation = {
  rulebook_version: string;
  track: string | null;
  eligibility: Array<{ rule_id: string; summary: string; data: Record<string, unknown> }>;
  sequencer: SequencerResult | null;
  documents: { required: string[]; notes: Record<string, string>; present: string[]; missing: string[] } | null;
  fees: Array<{ item: string; amount_usd: number; term_years?: number; waiver?: string; waived_for_veteran?: boolean }>;
  placement: { computable: false; checklist: string[]; abstain_reason: string } | null;
  rules_fired: RuleFired[];
  abstentions: Abstention[];
};

const sortById = <T extends Rule>(rs: T[]) => [...rs].sort((a, b) => String(a.rule_id).localeCompare(String(b.rule_id)));

function matches(cond: Record<string, unknown>, facts: CaseFacts): boolean | string {
  for (const [k, v] of Object.entries(cond)) {
    const fv = (facts as Record<string, unknown>)[k];
    if (fv === undefined) return k; // name the missing fact
    if (fv !== v) return false;
  }
  return true;
}

export function evaluate(rulebook: Rulebook, facts: CaseFacts): Evaluation {
  const fired: RuleFired[] = [];
  const abstentions: Abstention[] = [];
  const fire = (r: Rule, inputs: Record<string, unknown>, outcome: unknown) =>
    fired.push({ rule_id: String(r.rule_id), inputs, outcome, citation: String(r.citation) });

  // --- eligibility rules
  const eligibility: Evaluation["eligibility"] = [];
  let track: string | null = null;
  const missingFacts = new Set<string>();
  for (const r of sortById(rulebook.records.filter((x) => x.type === "eligibility"))) {
    const cond = (r.if ?? {}) as Record<string, unknown>;
    const m = matches(cond, facts);
    if (m === true) {
      const then = (r.then ?? {}) as Record<string, unknown>;
      eligibility.push({ rule_id: String(r.rule_id), summary: String(then.summary ?? ""), data: then });
      if (typeof then.track === "string") track = then.track;
      fire(r, Object.fromEntries(Object.keys(cond).map((k) => [k, (facts as Record<string, unknown>)[k]])), then);
    } else if (typeof m === "string" && ("vending_kind" in cond || "wants" in cond)) {
      missingFacts.add(m);
    }
  }
  if (!track && (facts.wants === "license" || facts.vending_kind === undefined)) {
    for (const f of missingFacts) {
      if (f === "vending_kind" || f === "wants")
        abstentions.push({ kind: "missing_fact", fact: f, reason: `cannot assign a track without ${f}` });
    }
  }

  // --- sequencer: topological order over sequence records for the track
  let sequencer: SequencerResult | null = null;
  if (track) {
    const seq = sortById(rulebook.records.filter((x) => x.type === "sequence" && (x.track === track || x.track === "any")))
      .filter((x) => x.track === track);
    const completed = [...(facts.completed_steps ?? [])].sort();
    const byStep = new Map(seq.map((r) => [String(r.step), r]));
    const remaining = seq.filter((r) => !completed.includes(String(r.step)));
    const nextSteps = remaining.filter((r) =>
      ((r.depends_on ?? []) as string[]).every((d) => completed.includes(d) || !byStep.has(d)),
    );
    // honest total timeline: longest dependency chain over remaining steps
    const memo = new Map<string, [number, number] | null>();
    const chain = (step: string): [number, number] | null => {
      if (memo.has(step)) return memo.get(step)!;
      const r = byStep.get(step);
      if (!r || completed.includes(step)) return [0, 0];
      const d = r.duration_days_range as [number, number] | null;
      if (d === null) { memo.set(step, null); return null; }
      let best: [number, number] = [0, 0];
      for (const dep of (r.depends_on ?? []) as string[]) {
        const c = chain(dep);
        if (c === null) { memo.set(step, null); return null; }
        if (c[1] > best[1]) best = c;
      }
      const out: [number, number] = [best[0] + d[0], best[1] + d[1]];
      memo.set(step, out);
      return out;
    };
    let timeline: [number, number] | null = [0, 0];
    let timelineNote: string | undefined;
    for (const r of remaining) {
      const c = chain(String(r.step));
      if (c === null) { timeline = null; timelineNote = String(r.note ?? "timeline not determinable"); break; }
      if (timeline && c[1] > timeline[1]) timeline = c;
    }
    sequencer = {
      track,
      next_steps: nextSteps.map((r) => ({
        step: String(r.step),
        duration_days_range: (r.duration_days_range as [number, number] | null) ?? null,
        note: r.note ? String(r.note) : undefined,
        citation: String(r.citation),
      })),
      remaining_steps: remaining.map((r) => String(r.step)),
      completed_steps: completed,
      timeline_days_range: timeline,
      timeline_note: timelineNote,
    };
    for (const r of nextSteps) fire(r, { track, completed_steps: completed }, { next_step: r.step });
  }

  // --- document requirements
  let documents: Evaluation["documents"] = null;
  if (track) {
    const reqs = sortById(rulebook.records.filter((x) => x.type === "document_requirement" && x.track === track));
    if (reqs.length) {
      const required = reqs.flatMap((r) => (r.requires ?? []) as string[]);
      const notes = Object.assign({}, ...reqs.map((r) => (r.notes ?? {}) as Record<string, string>));
      const present = [...(facts.documents_present ?? [])].sort();
      const missing = required.filter((d) => !present.includes(d));
      documents = { required, notes, present, missing };
      for (const r of reqs) fire(r, { track, documents_present: present }, { missing });
    }
  }

  // --- fees (waiver surfaced automatically per FEE-001)
  const fees: Evaluation["fees"] = [];
  if (facts.vending_kind === "food") {
    for (const r of sortById(rulebook.records.filter((x) => x.type === "fee"))) {
      const fee = {
        item: String(r.item),
        amount_usd: Number(r.amount_usd),
        term_years: r.term_years ? Number(r.term_years) : undefined,
        waiver: r.waiver ? String(r.waiver) : undefined,
        waived_for_veteran: facts.is_veteran === true ? true : undefined,
      };
      fees.push(fee);
      fire(r, { vending_kind: facts.vending_kind, is_veteran: facts.is_veteran ?? null }, fee);
    }
  }

  // --- placement: statutory values TODO(law) → abstain + physical checklist (never computed)
  let placement: Evaluation["placement"] = null;
  const pl = rulebook.records.find((x) => x.type === "placement");
  if (pl && facts.topic === "placement") {
    placement = {
      computable: false,
      checklist: (pl.checklist ?? []) as string[],
      abstain_reason: String(pl.abstain_reason ?? "placement rules not computable"),
    };
    abstentions.push({
      kind: "indeterminate",
      rule_id: String(pl.rule_id),
      reason: String(pl.abstain_reason),
      checklist: placement.checklist,
      referral_kind: "city_office",
    });
    fire(pl, { topic: "placement" }, { abstained: true });
  }

  return {
    rulebook_version: rulebook.hash,
    track,
    eligibility,
    sequencer,
    documents,
    fees,
    placement,
    rules_fired: fired,
    abstentions,
  };
}
