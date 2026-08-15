/** Loads sidewalk/.env into process.env (no dotenv dep). Existing env vars win. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./db.js";

const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env) && m[2] !== "") process.env[m[1]] = m[2];
  }
}

export const env = (k: string, dflt = ""): string => process.env[k] ?? dflt;
export const CHANNELS = () => env("SIDEWALK_CHANNELS", "web").split(",").map((s) => s.trim());
