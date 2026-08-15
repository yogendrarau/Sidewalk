/**
 * web adapter (§10): PWA → authenticated fetch → route_inbound.
 * Anonymous device account upgradeable to phone-verified. Replies return in the same
 * HTTP response (the web transport's "send"); audio synthesis happens per sentence.
 */
import { createHash } from "node:crypto";
import type { ChannelAdapter, NormalizedInbound, NormalizedOutbound } from "./adapter.js";

export const webAdapter: ChannelAdapter = {
  name: "web",
  verifyIdentity(raw: unknown) {
    const { device_id } = raw as { device_id: string };
    const address_hash = createHash("sha256").update(device_id).digest("hex").slice(0, 24);
    return { vendor_id: `web-${address_hash.slice(0, 12)}`, channel: "web", address_hash };
  },
  toNormalized(raw: unknown): NormalizedInbound {
    const b = raw as Record<string, unknown>;
    return {
      channel: "web",
      sender_ref: String(b.device_id),
      kind: (b.kind as NormalizedInbound["kind"]) ?? "text",
      text: b.text as string | undefined,
      media_url: b.media_sha as string | undefined,
      lat: b.lat as number | undefined,
      lon: b.lon as number | undefined,
      ts: new Date().toISOString(),
    };
  },
  async send(_identity, _out: NormalizedOutbound[]) {
    // web replies ride the HTTP response; nothing to push
  },
};
