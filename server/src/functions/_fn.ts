/** Backend-function wrapper (§9): schema-validated I/O, {ok, data|error, timing_ms}, telemetry row. */
import type { ZodType, ZodTypeDef } from "zod";
import { db } from "../db.js";

db.exec(`CREATE TABLE IF NOT EXISTS Telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fn TEXT, ok INTEGER, timing_ms REAL, at TEXT, note TEXT)`);

export type FnResult<T> = { ok: true; data: T; timing_ms: number } | { ok: false; error: string; timing_ms: number };

export function defineFn<I, O>(
  name: string,
  inputSchema: ZodType<I, ZodTypeDef, unknown>,
  handler: (input: I) => Promise<O>,
): (raw: unknown) => Promise<FnResult<O>> {
  return async (raw: unknown) => {
    const t0 = performance.now();
    const done = (ok: boolean, note = "") => {
      const ms = performance.now() - t0;
      db.prepare(`INSERT INTO Telemetry (fn, ok, timing_ms, at, note) VALUES (?,?,?,?,?)`)
        .run(name, ok ? 1 : 0, ms, new Date().toISOString(), note.slice(0, 200));
      return ms;
    };
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) {
      const ms = done(false, "input schema");
      return { ok: false, error: `invalid input: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`, timing_ms: ms };
    }
    try {
      const data = await handler(parsed.data);
      return { ok: true, data, timing_ms: done(true) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg, timing_ms: done(false, msg) };
    }
  };
}

export function telemetrySummary(): Array<{ fn: string; calls: number; ok_rate: number; p50_ms: number; p95_ms: number }> {
  const rows = db.prepare(`SELECT fn, ok, timing_ms FROM Telemetry`).all() as Array<{ fn: string; ok: number; timing_ms: number }>;
  const byFn = new Map<string, { ok: number; times: number[] }>();
  for (const r of rows) {
    const e = byFn.get(r.fn) ?? { ok: 0, times: [] };
    e.ok += r.ok;
    e.times.push(r.timing_ms);
    byFn.set(r.fn, e);
  }
  const pct = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
  };
  return [...byFn.entries()].map(([fn, e]) => ({
    fn, calls: e.times.length, ok_rate: e.ok / e.times.length,
    p50_ms: Math.round(pct(e.times, 50)), p95_ms: Math.round(pct(e.times, 95)),
  }));
}
