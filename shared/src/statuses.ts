// Fulfilment and payment are two independent fields (docs/architecture.md section 4).
// The allowed transitions are enforced by admin-api, not only hidden in the UI.

export const FULFILMENT_STATUSES = ["NEW", "CONFIRMED", "READY_FOR_COLLECTION", "COLLECTED", "CANCELLED"] as const;
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

/** Fulfilment statuses that send the customer an email when an admin moves an order to them. */
export const CUSTOMER_EMAIL_STATUSES = ["CONFIRMED", "READY_FOR_COLLECTION", "CANCELLED"] as const satisfies readonly FulfilmentStatus[];
export type CustomerEmailStatus = (typeof CUSTOMER_EMAIL_STATUSES)[number];

export const PAYMENT_STATUSES = ["AWAITING_PAYMENT", "PAID", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILMENT_LABELS: Record<FulfilmentStatus, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  READY_FOR_COLLECTION: "Ready for collection",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  REFUNDED: "Refunded",
};

const FULFILMENT_NEXT: Record<FulfilmentStatus, readonly FulfilmentStatus[]> = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["READY_FOR_COLLECTION", "CANCELLED"],
  READY_FOR_COLLECTION: ["COLLECTED", "CANCELLED"],
  COLLECTED: [],
  CANCELLED: [],
};

const PAYMENT_NEXT: Record<PaymentStatus, readonly PaymentStatus[]> = {
  AWAITING_PAYMENT: ["PAID"],
  PAID: ["REFUNDED"],
  REFUNDED: [],
};

export function allowedFulfilmentTransitions(from: FulfilmentStatus): readonly FulfilmentStatus[] {
  return FULFILMENT_NEXT[from];
}

export function allowedPaymentTransitions(from: PaymentStatus): readonly PaymentStatus[] {
  return PAYMENT_NEXT[from];
}

export function canChangeFulfilment(from: FulfilmentStatus, to: FulfilmentStatus): boolean {
  return FULFILMENT_NEXT[from].includes(to);
}

export function canChangePayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_NEXT[from].includes(to);
}

/** "Completed" on the dashboard means collected and paid. */
export function isCompleted(o: { fulfilmentStatus: FulfilmentStatus; paymentStatus: PaymentStatus }): boolean {
  return o.fulfilmentStatus === "COLLECTED" && o.paymentStatus === "PAID";
}
