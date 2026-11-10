// "Cakes to bake": totals of every cake still to be made, so nobody has to open each order.
import type { FulfilmentStatus } from "./statuses";
import type { Order, Product } from "./types";

/** Orders in these states still need baking. Ready, collected and cancelled orders are done. */
export const TO_BAKE_STATUSES: readonly FulfilmentStatus[] = ["NEW", "CONFIRMED"];

export interface BakingRow {
  productId: string;
  name: string;
  total: number;
  variants: Array<{ variantId: string; label: string; quantity: number }>;
}

export interface BakingSummary {
  totalCakes: number;
  orders: number;
  products: BakingRow[];
}

/**
 * Totals cakes by product and by variant (iced / un-iced) across all orders still to bake,
 * paid or not. Products follow the catalogue order, and every enabled product and variant
 * is listed even at zero so the cards don't jump about. A product or variant that is in an
 * order but no longer in the catalogue still counts, under the name the order recorded.
 */
export function bakingSummary(orders: readonly Order[], catalogue: readonly Product[]): BakingSummary {
  const rows = new Map<string, BakingRow>();
  const row = (productId: string, name: string): BakingRow => {
    let r = rows.get(productId);
    if (!r) rows.set(productId, (r = { productId, name, total: 0, variants: [] }));
    return r;
  };
  const variant = (r: BakingRow, variantId: string, label: string) => {
    let v = r.variants.find((x) => x.variantId === variantId);
    if (!v) r.variants.push((v = { variantId, label, quantity: 0 }));
    return v;
  };

  for (const p of catalogue) {
    if (!p.enabled) continue;
    const r = row(p.productId, p.name);
    for (const v of p.variants) if (v.enabled) variant(r, v.variantId, v.label);
  }

  let totalCakes = 0;
  let count = 0;
  for (const o of orders) {
    if (!TO_BAKE_STATUSES.includes(o.fulfilmentStatus)) continue;
    count += 1;
    for (const l of o.lines) {
      const p = catalogue.find((x) => x.productId === l.productId);
      const r = row(l.productId, p?.name ?? l.productName);
      const label = p?.variants.find((x) => x.variantId === l.variantId)?.label ?? l.variantLabel;
      variant(r, l.variantId, label).quantity += l.quantity;
      r.total += l.quantity;
      totalCakes += l.quantity;
    }
  }

  const rank = (id: string) => {
    const i = catalogue.findIndex((p) => p.productId === id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const products = [...rows.values()]
    .filter((r) => r.total > 0 || catalogue.some((p) => p.productId === r.productId && p.enabled))
    .sort((a, b) => rank(a.productId) - rank(b.productId) || a.name.localeCompare(b.name));
  return { totalCakes, orders: count, products };
}
