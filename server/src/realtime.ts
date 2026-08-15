/**
 * Realtime bus (v3 §3.3 / §11): emulates Base44 realtime subscriptions with SSE.
 * Topics: `vendor:<id>` (orders, notifications), `order:<token>` (shopper order page),
 * `org:<id>` (console). The Gate-3 demo beat — an order appearing on the merchant's
 * screen without refresh — rides this bus.
 */
import type { Response } from "express";

type Client = { topics: Set<string>; res: Response };
const clients = new Set<Client>();

/** Latency proof for /demo/platform: last publish→flush time per topic class. */
export const realtimeStats = { last_event_at: null as string | null, last_latency_ms: null as number | null, events: 0 };

export function subscribe(res: Response, topics: string[]): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ topics })}\n\n`);
  const client: Client = { topics: new Set(topics), res };
  clients.add(client);
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
  res.on("close", () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

export function publish(topic: string, event: string, data: unknown): void {
  const t0 = performance.now();
  const frame = `event: ${event}\ndata: ${JSON.stringify({ topic, ...(data as object) })}\n\n`;
  for (const c of clients) if (c.topics.has(topic)) c.res.write(frame);
  realtimeStats.events += 1;
  realtimeStats.last_event_at = new Date().toISOString();
  realtimeStats.last_latency_ms = Math.round((performance.now() - t0) * 100) / 100;
}
