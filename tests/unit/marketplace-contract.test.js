import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_ACCOUNT_ROLES,
  PROTOTYPE_ACCOUNT_STORAGE_KEY,
  clearPrototypeMarketplaceAccount,
  createPrototypeAccountRecord,
  loadMarketplaceAccount,
  logoutMarketplaceAccount,
  parsePrototypeAccountRecord,
  readPendingMarketplaceRole,
  saveMarketplaceAccountRole,
  savePendingMarketplaceRole,
} from "../../src/lib/marketplaceAccount.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function read(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

function stripJsonComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function sourceFiles(relativeDirectory) {
  const root = join(PROJECT_ROOT, relativeDirectory);
  const files = [];
  if (!existsSync(root)) return files;

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extname(entry.name))) {
        files.push(path);
      }
    }
  }

  visit(root);
  return files;
}

function allCode() {
  return [...sourceFiles("src"), ...sourceFiles("base44")]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

describe("marketplace account role contract", () => {
  it("stores buyer/vendor in a dedicated account_role without overloading Base44's system role", () => {
    const user = JSON.parse(stripJsonComments(read("base44/entities/User.jsonc")));

    expect(user.properties.role.enum).toEqual(["admin", "user"]);
    expect(user.properties.account_role.enum).toEqual(["buyer", "vendor"]);
    expect(user.required).toContain("role");
    expect(user.required).not.toContain("account_role");
  });

  it("provides a prototype-safe persistent account adapter", () => {
    const source = read("src/lib/marketplaceAccount.js");
    for (const exportedName of [
      "MARKETPLACE_ACCOUNT_ROLES",
      "PROTOTYPE_ACCOUNT_STORAGE_KEY",
      "PENDING_ACCOUNT_ROLE_STORAGE_KEY",
      "isMarketplaceAccountRole",
      "normalizeMarketplaceAccountRole",
      "createPrototypeAccountRecord",
      "parsePrototypeAccountRecord",
      "readPrototypeMarketplaceAccount",
      "createPrototypeMarketplaceAccount",
      "readPendingMarketplaceRole",
      "savePendingMarketplaceRole",
      "clearPendingMarketplaceRole",
      "loadMarketplaceAccount",
      "saveMarketplaceAccountRole",
      "clearPrototypeMarketplaceAccount",
      "logoutMarketplaceAccount",
    ]) {
      expect(source, `marketplace account adapter exports ${exportedName}`).toMatch(
        new RegExp(`export\\s+(?:const|function|async\\s+function)\\s+${exportedName}\\b`),
      );
    }

    expect(source).toMatch(/account_role/);
    expect(source).toMatch(/localStorage|Storage/);
  });

  it.each(MARKETPLACE_ACCOUNT_ROLES)("persists the %s role with a closed, non-PII record", async (role) => {
    const storage = new MemoryStorage();
    const now = new Date("2026-08-15T12:00:00.000Z");
    const { account, sync } = saveMarketplaceAccountRole(role, {
      storage,
      sync: false,
      locale: "en",
      now,
      idFactory: () => "proto_00000000000000000000000000000000",
    });

    expect(account).toMatchObject({
      role,
      account_role: role,
      locale: "en",
      is_fictional: true,
      is_prototype: true,
      persistence: "prototype_local",
    });
    expect(await sync).toBe(account);
    expect(loadMarketplaceAccount({ storage })).toMatchObject({ role, account_role: role });

    const persisted = JSON.parse(storage.getItem(PROTOTYPE_ACCOUNT_STORAGE_KEY));
    expect(Object.keys(persisted).sort()).toEqual([
      "account_role",
      "created_at",
      "is_fictional",
      "locale",
      "prototype_account_id",
      "schema_version",
      "updated_at",
    ]);
    expect(JSON.stringify(persisted)).not.toMatch(
      /email|phone|address|immigration|password|payment|card|financial/i,
    );
  });

  it("rejects malformed or expanded local records and clears account state synchronously", async () => {
    const storage = new MemoryStorage();
    const record = createPrototypeAccountRecord("buyer", {
      locale: "es",
      now: new Date("2026-08-15T12:00:00.000Z"),
      idFactory: () => "proto_11111111111111111111111111111111",
    });

    expect(parsePrototypeAccountRecord({ ...record, email: "not-allowed@example.test" })).toBeNull();
    expect(parsePrototypeAccountRecord({ ...record, account_role: "admin" })).toBeNull();
    expect(parsePrototypeAccountRecord({ ...record, account_role: "user" })).toBeNull();

    storage.setItem(PROTOTYPE_ACCOUNT_STORAGE_KEY, JSON.stringify(record));
    const result = logoutMarketplaceAccount({
      storage,
      client: {},
      timeoutMs: 5,
    });
    expect(result).toMatchObject({ account: null, cleared: true });
    expect(loadMarketplaceAccount({ storage })).toBeNull();
    await expect(result.sync).resolves.toMatchObject({ remote_cleanup: "unavailable" });
    expect(clearPrototypeMarketplaceAccount(storage)).toBe(false);
  });

  it("persists only a valid pending buyer/vendor selection", () => {
    const storage = new MemoryStorage();
    savePendingMarketplaceRole("vendor", storage, new Date("2026-08-15T12:00:00.000Z"));
    expect(readPendingMarketplaceRole(storage)).toBe("vendor");
    expect(() => savePendingMarketplaceRole("admin", storage)).toThrow(/buyer or vendor/i);
  });
});

describe("Base44 marketplace role persistence", () => {
  it("keeps the synthetic role record admin-only and free of commerce or personal fields", () => {
    const entity = JSON.parse(
      stripJsonComments(read("base44/entities/MarketplacePrototypeAccount.jsonc")),
    );
    expect(entity.properties.account_role.enum).toEqual(["buyer", "vendor"]);
    expect(Object.keys(entity.properties).sort()).toEqual([
      "account_role",
      "is_fictional",
      "last_synced_at",
      "locale",
      "prototype_account_id",
      "prototype_created_at",
      "schema_version",
    ]);
    for (const operation of ["create", "read", "update", "delete"]) {
      expect(entity.rls[operation].user_condition).toEqual({ role: "admin" });
    }
  });

  it("uses one strict get/upsert/delete gateway and never trusts the browser as a service role", () => {
    const source = read("base44/functions/sync_marketplace_account/entry.ts");
    expect(source).toMatch(/action\s*!==\s*["']get["']/);
    expect(source).toMatch(/action\s*!==\s*["']upsert["']/);
    expect(source).toMatch(/action\s*!==\s*["']delete["']/);
    expect(source).toMatch(/hasExactKeys/);
    expect(source).toMatch(/ACCOUNT_ROLES/);
    expect(source).toMatch(/SUPPORTED_LOCALES/);
    expect(source).toMatch(/asServiceRole\.entities\.MarketplacePrototypeAccount/);
    expect(source).not.toMatch(/email|phone|address|immigration|payment|card_number|financial/i);
  });
});

describe("truthful marketplace shell contract", () => {
  it("ships the exact role chooser and intentional empty-state copy", () => {
    const sources = allCode();
    for (const copy of [
      "What would you like to do?",
      "I’m looking to buy",
      "Discover food, goods, and services from local street vendors.",
      "I’m looking to sell",
      "Set up your vendor workspace, prepare for verification, and manage future sales.",
      "Explore local vendors.",
      "Vendor stores will appear here as they join SIDEWALK.",
      "You haven’t placed any orders yet.",
      "Store setup coming soon.",
      "New orders will appear here once your store is live.",
      "Continue verification preparation",
    ]) {
      expect(sources, `marketplace copy: ${copy}`).toContain(copy);
    }
  });

  it("does not define commerce entities or initialize payment, messaging, fulfillment, or delivery SDKs", () => {
    for (const entity of ["Store", "Product", "Order", "Checkout", "Payment", "Delivery"] ) {
      expect(existsSync(join(PROJECT_ROOT, `base44/entities/${entity}.jsonc`)), entity).toBe(false);
    }

    const marketplace = read("src/pages/Marketplace.jsx");
    expect(marketplace).not.toMatch(/\b(?:stores|products|customers|orders)\s*=\s*\[/i);
    expect(marketplace).not.toMatch(/\b(?:store_id|product_id|customer_id|order_id)\b/i);

    const sources = allCode();
    const forbiddenInitializers = [
      /from\s+["']@stripe\//i,
      /\bloadStripe\s*\(/i,
      /\bnew\s+Stripe\s*\(/i,
      /from\s+["']@paypal\//i,
      /\bpaypal\.Buttons\s*\(/i,
      /from\s+["']@square\//i,
      /\bSquare\.payments\s*\(/i,
      /from\s+["'](?:@shopify\/|shopify-api)/i,
      /from\s+["'](?:twilio|@sendgrid\/|pusher-js|ably|socket\.io-client)["']/i,
      /from\s+["'](?:shippo|@easypost\/)/i,
      /integrations\.Core\.(?:SendEmail|SendSMS)\s*\(/i,
      /\.entities\.(?:Store|Product|Order|Checkout|Payment|Delivery)\./i,
      /(?:api\.stripe\.com|api-m\.paypal\.com|connect\.squareupsandbox\.com|api\.twilio\.com)/i,
    ];

    for (const pattern of forbiddenInitializers) expect(sources).not.toMatch(pattern);
  });
});
