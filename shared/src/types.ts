// Domain types shared by the browser and the Lambdas. See docs/data-model.md.
import type { CustomerEmailStatus, FulfilmentStatus, PaymentStatus } from "./statuses";

export interface Variant {
  variantId: string;
  label: string;
  pricePence: number;
  enabled: boolean;
}

export interface Product {
  productId: string;
  name: string;
  description: string;
  /** Short line shown under the name, e.g. "Great for tasters or an excellent gift". */
  tagline?: string;
  /** Picks the built-in illustration until real photos exist. */
  illustration?: "round-cake" | "rose";
  imageUrl?: string;
  enabled: boolean;
  sortOrder: number;
  maxQuantityPerOrder: number;
  variants: Variant[];
  allergens: string[];
  version: number;
  updatedAt?: string;
}

export interface BusinessInfo {
  name: string;
  /** The baker's first name, used to sign customer emails. From the BAKER_NAME setting. */
  bakerName: string;
  phone: string;
  email: string;
  collectionAddressSummary: string;
  paymentInfo: string;
  allergenNotice: string;
}

export interface Settings {
  activeSeasonId: string;
  business: Omit<BusinessInfo, "name" | "bakerName">;
  maxOrdersPerEmailPerDay: number;
  version: number;
  updatedAt?: string;
}

export interface Season {
  seasonId: string;
  label: string;
  orderingOpensAt: string;
  orderingDeadline: string;
  isOpen: boolean;
  version: number;
}

export interface CollectionDate {
  date: string;
  enabled: boolean;
  collectionWindow: string;
  /** Maximum number of orders for this date. Absent means unlimited. */
  capacityUnits?: number;
  bookedUnits: number;
}

/** GET /api/catalogue */
export interface CatalogueResponse {
  business: BusinessInfo;
  season: {
    seasonId: string;
    label: string;
    orderingOpensAt: string;
    orderingDeadline: string;
    /** Open right now: the switch is on and we are between the opening time and the deadline. */
    acceptingOrders: boolean;
    closedReason?: "not-open-yet" | "deadline-passed" | "closed";
  };
  products: Array<Omit<Product, "version" | "updatedAt" | "maxQuantityPerOrder"> & { maxQuantityPerOrder: number }>;
  collectionDates: Array<{ date: string; collectionWindow: string; full: boolean }>;
  generatedAt: string;
}

export interface OrderLine {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  unitPricePence: number;
  lineTotalPence: number;
}

export type NotificationState =
  | { status: "SENT"; at: string; messageId?: string }
  | { status: "FAILED"; at: string; error: string; attempts: number }
  | { status: "SKIPPED"; at: string; reason: string };

export interface InternalNote {
  at: string;
  by: string;
  text: string;
}

export interface Order {
  orderRef: string;
  submittedAt: string;
  seasonId: string;
  customer: { name: string; email: string; phone: string };
  lines: OrderLine[];
  totalPence: number;
  collectionDate: string;
  customerNotes: string;
  fulfilmentStatus: FulfilmentStatus;
  paymentStatus: PaymentStatus;
  internalNotes: InternalNote[];
  notifications?: {
    customerAck?: NotificationState;
    internalAlert?: NotificationState;
    /** Customer emails sent when the order moves to one of these statuses. */
    statusEmails?: Partial<Record<CustomerEmailStatus, NotificationState>>;
  };
  notificationProblem?: boolean;
  version: number;
  updatedAt: string;
}

export interface OrderEvent {
  at: string;
  type: "CREATED" | "STATUS_CHANGED" | "NOTE_ADDED" | "RESEND_REQUESTED" | "ERASED";
  field?: "fulfilmentStatus" | "paymentStatus";
  from?: string;
  to?: string;
  by: string;
}

/** POST /api/orders response */
export interface CreateOrderResponse {
  orderRef: string;
  totalPence: number;
  collectionDate: string;
  status: "received";
  lines: OrderLine[];
  customerEmailEnabled: boolean;
}
