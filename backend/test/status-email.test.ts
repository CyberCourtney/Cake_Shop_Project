import { describe, expect, it } from "vitest";
import type { BusinessInfo, Order } from "@kvc/shared";
import { customerEmail, statusEmail } from "../functions/notifier/templates";

const order: Order = {
  orderRef: "KV-ABC123",
  submittedAt: "2026-11-20T18:42:10Z",
  seasonId: "2026",
  customer: { name: "Jane <Brown>", email: "jane@example.com", phone: "07700 900123" },
  lines: [{ productId: "cake-8in", productName: "8-inch cake", variantId: "iced", variantLabel: "Iced", quantity: 1, unitPricePence: 5000, lineTotalPence: 5000 }],
  totalPence: 5000,
  collectionDate: "2026-12-23",
  customerNotes: "",
  fulfilmentStatus: "CONFIRMED",
  paymentStatus: "AWAITING_PAYMENT",
  internalNotes: [],
  version: 2,
  updatedAt: "2026-11-21T09:00:00Z",
};

const business: BusinessInfo = {
  name: "Example Cake Co",
  bakerName: "Sam",
  phone: "01234 567890",
  email: "hello@example.com",
  collectionAddressSummary: "Collect from Sam's home (address in this email).",
  paymentInfo: "Cash or bank transfer on collection.",
  allergenNotice: "",
};

describe("statusEmail", () => {
  it("confirms the order with the collection date and payment details", () => {
    const m = statusEmail(order, business, "CONFIRMED");
    expect(m.subject).toBe("Your order KV-ABC123 is confirmed - Example Cake Co");
    expect(m.text).toContain("Sam has confirmed your order");
    expect(m.text).toContain("Payment: Cash or bank transfer on collection.");
    expect(m.html).toContain("Your order is confirmed");
  });

  it("says the order is ready", () => {
    expect(statusEmail(order, business, "READY_FOR_COLLECTION").subject).toBe("Your order KV-ABC123 is ready to collect - Example Cake Co");
  });

  it("leaves payment and collection details out of a cancellation", () => {
    const m = statusEmail({ ...order, fulfilmentStatus: "CANCELLED" }, business, "CANCELLED");
    expect(m.subject).toBe("Your order KV-ABC123 has been cancelled - Example Cake Co");
    expect(m.text).not.toContain("Payment:");
    expect(m.html).not.toContain("Payment is made in person");
  });

  it("escapes customer-supplied text in the HTML", () => {
    expect(statusEmail(order, business, "CONFIRMED").html).toContain("Jane &lt;Brown&gt;");
  });
});

describe("customer emails", () => {
  it("never include the phone number", () => {
    for (const s of ["CONFIRMED", "READY_FOR_COLLECTION", "CANCELLED"] as const) {
      const m = statusEmail(order, business, s);
      expect(m.text).not.toContain(business.phone);
      expect(m.html).not.toContain(business.phone);
    }
    const ack = customerEmail(order, business);
    expect(ack.text).not.toContain(business.phone);
    expect(ack.html).not.toContain(business.phone);
  });
});
