import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = process.env.SIDEWALK_DATA_DIR ?? join(ROOT, "server", "data");
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(join(DATA_DIR, "media"), { recursive: true });

export const MEDIA_DIR = join(DATA_DIR, "media");

export const db = new DatabaseSync(
  process.env.SIDEWALK_DB === ":memory:" ? ":memory:" : join(DATA_DIR, "sidewalk.db"),
);

db.exec(`PRAGMA journal_mode = WAL;`);
