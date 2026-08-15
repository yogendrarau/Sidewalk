/** Version B ships web only (§3). A-channels + voice stay interface-conformant stubs behind the flag. */
import { NotActivated, type ChannelAdapter } from "./adapter.js";

const stub = (name: string, note: string): ChannelAdapter => {
  const nope = () => { throw new NotActivated(name, note); };
  return { name, verifyIdentity: nope, toNormalized: nope, send: async () => nope() };
};

export const whatsappAdapter = stub("whatsapp", "Version A: Base44 in-app Agent on the dedicated number; Twilio WhatsApp sender fallback.");
export const telegramAdapter = stub("telegram", "Version A: bot API; transcode OGG/Opus before ASR.");
export const smsAdapter = stub("sms", "Version A: Twilio SMS/MMS, text+image only; replies link to PWA for audio.");
export const voiceAdapter = stub("voice", "Stretch: Twilio Voice into the same pipeline, only after all gates.");
