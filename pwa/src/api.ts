export const deviceId = (): string => {
  let id = localStorage.getItem("sidewalk_device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sidewalk_device", id);
  }
  return id;
};

export const getLang = (): string => localStorage.getItem("sidewalk_lang") ?? "es";
export const setLang = (l: string) => localStorage.setItem("sidewalk_lang", l);

const H = () => ({ "content-type": "application/json", "x-device-id": deviceId() });

export async function api<T = Record<string, unknown>>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: H(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function uploadMedia(file: Blob, ext: string): Promise<{ sha256: string; ext: string }> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  const data_base64 = btoa(binary);
  const out = await api<{ ok: boolean; sha256: string; ext: string }>("/api/media", { data_base64, ext });
  return { sha256: out.sha256, ext: out.ext };
}

export type Reply = {
  intent: string;
  reply: {
    text: string;
    sentences: string[];
    citations: Array<{ idx: number; citation: string; text: string }>;
    tier: string;
    lang_used: string;
    lang_fallback: boolean;
    freshness?: string;
  };
  guard: { injection: boolean; scam_pattern: string | null; pii_overshare: boolean };
  actions?: Record<string, unknown>;
};

export type InboundResult = { ok: boolean; data: Reply; tts?: { audio_urls?: string[]; audio_unavailable?: boolean } };

export const sendInbound = (payload: Record<string, unknown>): Promise<InboundResult> =>
  api<InboundResult>("/api/inbound", { lang: getLang(), ...payload });
