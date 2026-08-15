/**
 * NYC Open Data (Socrata) client. Live queries with fixture fallback.
 * Invariant 6: every answer carries the dataset's publication timestamp (dataset_as_of).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./db.js";

export const DATASETS = {
  oath_hearings: "jz4z-kudi", // OATH Hearings Division case status
  license_applications: "ptev-4hud", // DCA/DCWP license applications
  businesses: "w7w3-xahh", // DCA/DCWP legally operating businesses
  complaints_311: "erm2-nwe9", // 311 service requests
  events: "tvpp-9vvx", // permitted events
} as const;

const BASE = "https://data.cityofnewyork.us";
const asOfCache = new Map<string, { asOf: string; at: number }>();

/** Publication timestamp from dataset metadata (rowsUpdatedAt), cached 1h. */
export async function datasetAsOf(datasetId: string): Promise<string> {
  const hit = asOfCache.get(datasetId);
  if (hit && Date.now() - hit.at < 3600_000) return hit.asOf;
  try {
    const res = await fetch(`${BASE}/api/views/${datasetId}.json`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`metadata ${res.status}`);
    const meta = (await res.json()) as { rowsUpdatedAt?: number };
    const asOf = meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString() : new Date().toISOString();
    asOfCache.set(datasetId, { asOf, at: Date.now() });
    return asOf;
  } catch {
    const fx = fixtureFor(datasetId);
    return fx?.as_of ?? "unknown (offline; fixture data)";
  }
}

function fixtureFor(datasetId: string): { as_of: string; rows: Record<string, unknown>[] } | null {
  const p = join(ROOT, "fixtures", "socrata", `${datasetId}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export type SocrataResult = {
  rows: Record<string, unknown>[];
  dataset_id: string;
  dataset_as_of: string;
  source: "live" | "fixture";
};

/** SoQL query. params example: { ticket_number: "0123456789" } or { $where: "...", $limit: "50" } */
export async function query(datasetId: string, params: Record<string, string>): Promise<SocrataResult> {
  const url = new URL(`${BASE}/resource/${datasetId}.json`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has("$limit")) url.searchParams.set("$limit", "50");
  const headers: Record<string, string> = {};
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`socrata ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    return { rows, dataset_id: datasetId, dataset_as_of: await datasetAsOf(datasetId), source: "live" };
  } catch (err) {
    const fx = fixtureFor(datasetId);
    if (!fx) throw err;
    // crude local filter so fixture behavior matches simple equality queries
    const eq = Object.entries(params).filter(([k]) => !k.startsWith("$"));
    const rows = fx.rows.filter((r) => eq.every(([k, v]) => String(r[k] ?? "").toLowerCase() === v.toLowerCase()));
    return { rows, dataset_id: datasetId, dataset_as_of: fx.as_of, source: "fixture" };
  }
}
