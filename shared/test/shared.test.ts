import { describe, expect, it } from "vitest";
import {
  bakingSummary, canChangeFulfilment, canChangePayment, createOrderRequestSchema, formatPence, formatPenceFixed,
  generateOrderRef, isValidDate, normaliseOrderRef, normaliseUkPhone, orderTotal, ORDER_REF_PATTERN, parsePoundsToPence,
} from "../src";
import type { Order, Product } from "../src";

describe("pricing (integer pence)", () => {
  it("formats pence", () => {
    expect(formatPence(2500)).toBe("£25");
    expect(formatPence(2550)).toBe("£25.50");
    expect(formatPenceFixed(2500)).toBe("£25.00");
    expect(formatPenceFixed(123456)).toBe("£1,234.56");
  });
  it("parses typed pounds", () => {
    expect(parsePoundsToPence("35")).toBe(3500);
    expect(parsePoundsToPence("£35.5")).toBe(3550);
    expect(parsePoundsToPence("0.10")).toBe(10);
    expect(parsePoundsToPence("35.555")).toBeNull();
    expect(parsePoundsToPence("abc")).toBeNull();
    expect(parsePoundsToPence("-5")).toBeNull();
  });
  it("totals without floating-point drift", () => {
    expect(orderTotal([{ quantity: 3, unitPricePence: 1000 }, { quantity: 1, unitPricePence: 5000 }])).toBe(8000);
  });
});

describe("order references", () => {
  it("generates KV- plus six Crockford characters", () => {
    for (let i = 0; i < 200; i++) {
      const ref = generateOrderRef((n) => crypto.getRandomValues(new Uint8Array(n)));
      expect(ref).toMatch(ORDER_REF_PATTERN);
      expect(ref.slice(3)).not.toMatch(/[ILOU]/);
    }
  });
  it("normalises what people type", () => {
    expect(normaliseOrderRef("kv-7k3qxm")).toBe("KV-7K3QXM");
    expect(normaliseOrderRef("KV 7K3QXM")).toBe("KV-7K3QXM");
    expect(normaliseOrderRef("7k3qxm")).toBe("KV-7K3QXM");
    expect(normaliseOrderRef("KV-O1L2I3")).toBe("KV-011213");
    expect(normaliseOrderRef("Brown")).toBeNull();
  });
});

describe("statuses", () => {
  it("only allows forward fulfilment moves", () => {
    expect(canChangeFulfilment("NEW", "CONFIRMED")).toBe(true);
    expect(canChangeFulfilment("CONFIRMED", "COLLECTED")).toBe(false);
    expect(canChangeFulfilment("COLLECTED", "NEW")).toBe(false);
    expect(canChangeFulfilment("CANCELLED", "CONFIRMED")).toBe(false);
  });
  it("only refunds paid orders", () => {
    expect(canChangePayment("AWAITING_PAYMENT", "REFUNDED")).toBe(false);
    expect(canChangePayment("PAID", "REFUNDED")).toBe(true);
  });
});

describe("validation", () => {
  const valid = {
    idempotencyKey: "6f1c2c4e-1111-4222-8333-444455556666",
    lines: [{ productId: "cake-6in", variantId: "iced", quantity: 1 }],
    customer: { name: "Jane Brown", email: "Jane@Example.com ", phone: "+44 7700 900123" },
    collectionDate: "2026-12-23",
  };
  it("accepts and normalises a good order", () => {
    const r = createOrderRequestSchema.parse(valid);
    expect(r.customer.email).toBe("jane@example.com");
    expect(r.customer.phone).toBe("07700 900123");
    expect(r.customerNotes).toBe("");
  });
  it("rejects bad input", () => {
    expect(createOrderRequestSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...valid, collectionDate: "2026-02-30" }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...valid, customer: { ...valid.customer, email: "nope" } }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], quantity: 0 }] }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...valid, idempotencyKey: "x" }).success).toBe(false);
  });
  it("checks UK phone numbers", () => {
    expect(normaliseUkPhone("07700900123")).toBe("07700 900123");
    expect(normaliseUkPhone("020 7946 0958")).toBe("02079460958");
    expect(normaliseUkPhone("12345")).toBeNull();
  });
  it("checks real dates", () => {
    expect(isValidDate("2026-12-23")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
  });
});

describe("cakes to bake", () => {
  const product = (productId: string, name: string, variants: Array<[string, string]>, enabled = true) =>
    ({ productId, name, enabled, sortOrder: 0, variants: variants.map(([variantId, label]) => ({ variantId, label, pricePence: 1, enabled: true })) }) as unknown as Product;
  const catalogue = [
    product("cake-6in", "6-inch cake", [["uniced", "Un-iced"], ["iced", "Iced"]]),
    product("cake-8in", "8-inch cake", [["uniced", "Un-iced"], ["iced", "Iced"]]),
    product("rose-mini", "Rose mini", [["uniced", "Un-iced"]]),
    product("old", "Retired", [["uniced", "Un-iced"]], false),
  ];
  const order = (fulfilmentStatus: string, lines: Array<[string, string, number]>, paymentStatus = "AWAITING_PAYMENT") =>
    ({ fulfilmentStatus, paymentStatus, lines: lines.map(([productId, variantId, quantity]) => ({ productId, variantId, quantity, productName: productId, variantLabel: variantId })) }) as unknown as Order;

  it("totals new and confirmed orders by product and variant, paid or not", () => {
    const s = bakingSummary(
      [
        order("NEW", [["cake-8in", "iced", 1], ["rose-mini", "uniced", 3]]),
        order("CONFIRMED", [["cake-8in", "iced", 2], ["cake-8in", "uniced", 1]], "PAID"),
        order("READY_FOR_COLLECTION", [["cake-6in", "iced", 5]]),
        order("COLLECTED", [["cake-6in", "iced", 5]]),
        order("CANCELLED", [["cake-6in", "iced", 5]]),
      ],
      catalogue,
    );
    expect(s.totalCakes).toBe(7);
    expect(s.orders).toBe(2);
    expect(s.products.map((p) => [p.name, p.total, p.variants.map((v) => `${v.label}:${v.quantity}`).join(" ")])).toEqual([
      ["6-inch cake", 0, "Un-iced:0 Iced:0"],
      ["8-inch cake", 4, "Un-iced:1 Iced:3"],
      ["Rose mini", 3, "Un-iced:3"],
    ]);
  });

  it("still counts cakes for products no longer in the catalogue", () => {
    const s = bakingSummary([order("NEW", [["old", "uniced", 2], ["gone", "iced", 1]])], catalogue);
    expect(s.totalCakes).toBe(3);
    expect(s.products.slice(-2).map((p) => [p.name, p.total])).toEqual([["Retired", 2], ["gone", 1]]);
  });
});
