// The customer's order in progress. Kept in sessionStorage so a refresh doesn't lose it.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogueResponse } from "@kvc/shared";
import { load, save } from "./storage";

export interface BasketLine {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface PricedBasketLine extends BasketLine {
  productName: string;
  variantLabel: string;
  unitPricePence: number;
  lineTotalPence: number;
  maxQuantity: number;
}

interface BasketApi {
  lines: BasketLine[];
  add(productId: string, variantId: string, quantity: number): void;
  setQuantity(productId: string, variantId: string, quantity: number): void;
  clear(): void;
  count: number;
}

const Ctx = createContext<BasketApi | null>(null);

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BasketLine[]>(() => load<BasketLine[]>("kvc.basket", []));
  useEffect(() => save("kvc.basket", lines), [lines]);

  const api = useMemo<BasketApi>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      add(productId, variantId, quantity) {
        setLines((ls) => {
          const i = ls.findIndex((l) => l.productId === productId && l.variantId === variantId);
          if (i === -1) return [...ls, { productId, variantId, quantity }];
          return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + quantity } : l));
        });
      },
      setQuantity(productId, variantId, quantity) {
        setLines((ls) =>
          quantity <= 0
            ? ls.filter((l) => !(l.productId === productId && l.variantId === variantId))
            : ls.map((l) => (l.productId === productId && l.variantId === variantId ? { ...l, quantity } : l)),
        );
      },
      clear() {
        setLines([]);
      },
    }),
    [lines],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useBasket(): BasketApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBasket outside BasketProvider");
  return v;
}

/** Prices the basket for display, using the catalogue. Lines for cakes no longer on sale are dropped. */
export function priceBasket(lines: BasketLine[], catalogue: CatalogueResponse | null): PricedBasketLine[] {
  if (!catalogue) return [];
  const out: PricedBasketLine[] = [];
  for (const l of lines) {
    const p = catalogue.products.find((x) => x.productId === l.productId);
    const v = p?.variants.find((x) => x.variantId === l.variantId);
    if (!p || !v) continue;
    out.push({
      ...l,
      productName: p.name,
      variantLabel: v.label,
      unitPricePence: v.pricePence,
      lineTotalPence: v.pricePence * l.quantity,
      maxQuantity: p.maxQuantityPerOrder,
    });
  }
  return out;
}
