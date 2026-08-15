/**
 * Channel adapter contract (§10). Adapters are TRANSPORT ONLY.
 * Nothing outside channels/ imports a channel SDK or branches on channel (invariant 10).
 */
export type NormalizedInbound = {
  channel: "whatsapp" | "telegram" | "sms" | "web" | "voice";
  sender_ref: string;
  kind: "text" | "audio" | "image" | "location";
  text?: string;
  media_url?: string;
  lat?: number;
  lon?: number;
  reply_to?: string;
  ts: string;
};

export type NormalizedOutbound = {
  kind: "text" | "audio" | "image" | "file";
  text?: string;
  media_url?: string;
  citations?: Array<{ idx: number; citation: string }>;
  freshness?: string;
};

export interface ChannelAdapter {
  name: string;
  verifyIdentity(raw: unknown): { vendor_id: string; channel: string; address_hash: string };
  toNormalized(raw: unknown): NormalizedInbound;
  send(identity: { vendor_id: string }, out: NormalizedOutbound[]): Promise<void>;
}

export class NotActivated extends Error {
  constructor(channel: string, activation: string) {
    super(`${channel} is not activated. ${activation}`);
  }
}
