/**
 * wechat (§3): strategically right for Mandarin speakers, gated by official-account business
 * verification. Interface-conformant stub throwing NotActivated. Activation path: README §Channels.
 */
import { NotActivated, type ChannelAdapter } from "./adapter.js";

const nope = () => {
  throw new NotActivated(
    "wechat",
    "Activation: register a WeChat Official Account (business verification, ~1–2 weeks), then set WECHAT_APP_ID/SECRET and flip SIDEWALK_CHANNELS.",
  );
};

export const wechatAdapter: ChannelAdapter = {
  name: "wechat",
  verifyIdentity: nope,
  toNormalized: nope,
  send: async () => nope(),
};
