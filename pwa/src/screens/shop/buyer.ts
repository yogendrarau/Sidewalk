/**
 * Shopper "account" (demo-grade, no PII): a device-held buyer ref attaches orders to
 * this phone so /orders can show history. No login, no email — the anonymous ≤45s
 * checkout path is unchanged; the ref rides along invisibly.
 */
export function buyerId(): string {
  let id = localStorage.getItem("sidewalk_buyer");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("sidewalk_buyer", id);
  }
  return id;
}

export const buyerName = (): string => localStorage.getItem("sidewalk_buyer_name") ?? "";
export const setBuyerName = (n: string): void => localStorage.setItem("sidewalk_buyer_name", n.slice(0, 40));
