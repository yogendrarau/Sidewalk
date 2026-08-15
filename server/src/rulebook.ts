/** Rulebook loader: content-hash versioning; rules without verified citations are treated as absent. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./db.js";
import { entities } from "./entities.js";

export type Rule = {
  rule_id?: string;
  type: "eligibility" | "sequence" | "document_requirement" | "fee" | "placement" | "price" | "vocabulary";
  citation?: string;
  last_verified?: string;
  [k: string]: unknown;
};

export type Rulebook = { version: string; hash: string; records: Rule[]; dropped: string[] };

let cached: Rulebook | null = null;

export function loadRulebook(): Rulebook {
  if (cached) return cached;
  const raw = readFileSync(join(ROOT, "rulebook", "rulebook.v1.json"), "utf8");
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  const parsed = JSON.parse(raw) as { version: string; records: Rule[] };
  // A rule without a verified citation does not ship; the engine treats it as absent and abstains.
  const dropped: string[] = [];
  const records = parsed.records.filter((r) => {
    const ok = typeof r.citation === "string" && r.citation.length > 0 && typeof r.last_verified === "string" && r.last_verified.length > 0;
    if (!ok) dropped.push(r.rule_id ?? r.type);
    return ok;
  });
  cached = { version: parsed.version, hash, records, dropped };
  try {
    if (!entities.list({ kind: "system" }, "RulebookVersion", { hash }).length) {
      entities.create({ kind: "system" }, "RulebookVersion", {
        hash, released_at: new Date().toISOString(),
        changelog: `${parsed.version}: ${records.length} rules shipped, ${dropped.length} dropped (unverified citation)`,
      });
    }
  } catch { /* db may be readonly in some test contexts */ }
  return cached;
}

export function vocabulary(lang: string): Array<{ surface: string[]; maps_to: string }> {
  try {
    const v = JSON.parse(readFileSync(join(ROOT, "rulebook", `vocabulary.${lang}.json`), "utf8"));
    return v.terms ?? [];
  } catch { return []; }
}

export function prices(): Record<string, Record<string, unknown>> {
  return JSON.parse(readFileSync(join(ROOT, "rulebook", "prices.json"), "utf8"));
}
