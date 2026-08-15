process.env.SIDEWALK_DB = ":memory:";
import { describe, it, expect } from "vitest";
import { entities, type Ctx } from "../src/entities.js";

const sys: Ctx = { kind: "system" };
const tenantA: Ctx = { kind: "vendor", vendor_id: "vendor-a" };
const tenantB: Ctx = { kind: "vendor", vendor_id: "vendor-b" };
const orgNoGrant: Ctx = { kind: "org", org_id: "org-x", grants: [] };
const orgWithGrant: Ctx = { kind: "org", org_id: "org-x", grants: ["vendor-a"] };

const vendorEntities = entities.names().filter((n) => entities.rlsOf(n) === "vendor");

describe("Gate 0 — cross-tenant isolation on every RLS entity", () => {
  it("seeds one row per vendor-scoped entity for tenant A", () => {
    for (const name of vendorEntities) {
      entities.create(sys, name, { vendor_id: "vendor-a", probe: `secret-${name}` });
    }
    expect(vendorEntities.length).toBeGreaterThanOrEqual(12);
  });

  it("tenant B sees zero of tenant A's rows on every entity", () => {
    for (const name of vendorEntities) {
      expect(entities.list(tenantB, name), name).toHaveLength(0);
    }
  });

  it("tenant B cannot get, update, or delete tenant A's rows by id", () => {
    for (const name of vendorEntities) {
      const [row] = entities.list(tenantA, name);
      expect(entities.get(tenantB, name, row.id), name).toBeNull();
      expect(() => entities.update(tenantB, name, row.id, { probe: "stolen" }), name).toThrow(/RLS/);
      expect(() => entities.delete(tenantB, name, row.id), name).toThrow(/RLS/);
    }
  });

  it("org caseworker sees rows only with an explicit grant", () => {
    for (const name of vendorEntities) {
      expect(entities.list(orgNoGrant, name), name).toHaveLength(0);
      expect(entities.list(orgWithGrant, name), name).toHaveLength(1);
    }
  });

  it("vendor ctx cannot create rows under another vendor's id", () => {
    expect(() => entities.create(tenantB, "CaseFile", { vendor_id: "vendor-a" })).toThrow(/RLS/);
  });

  it("FLS strips sensitive fields for non-admin readers", () => {
    entities.create(sys, "Vendor", { vendor_id: "vendor-a", display_name: "Rosa", base44_user_id: "u_secret" });
    const rows = entities.list(orgWithGrant, "Vendor");
    const rosa = rows.find((r) => r.display_name === "Rosa")!;
    expect(rosa.base44_user_id).toBeUndefined();
    const admin = entities.list({ kind: "org", org_id: "org-x", grants: ["vendor-a"], admin: true }, "Vendor");
    expect(admin.find((r) => r.display_name === "Rosa")!.base44_user_id).toBe("u_secret");
  });

  it("forbidden fields (invariant 3) are rejected at the layer", () => {
    expect(() => entities.create(sys, "Vendor", { vendor_id: "v", immigration_status: "x" })).toThrow(/forbidden/);
  });

  it("deletion on request purges every vendor-scoped row", () => {
    const n = entities.purgeVendor(tenantA, "vendor-a");
    expect(n).toBeGreaterThan(0);
    for (const name of vendorEntities) expect(entities.list(tenantA, name)).toHaveLength(0);
  });
});
