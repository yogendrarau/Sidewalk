/**
 * Merchant identity (v3 §3.1): one standalone app, no channel adapters (invariant 10).
 * Locally this emulates Base44 Auth: a device credential hashes to a stable vendor identity.
 * The `web-<12 hex>` scheme is kept from the prior build so seeded data stays valid.
 */
import { createHash } from "node:crypto";

export function vendorIdOf(deviceId: string): string {
  const h = createHash("sha256").update(deviceId).digest("hex");
  return `web-${h.slice(0, 12)}`;
}
