// One set of validation rules, used by the browser (for friendly messages as you type)
// and by the Lambdas (as the authority). Never trust the browser's copy.
import { z } from "zod";
import { DATE_PATTERN, isValidDate } from "./dates";

export const LIMITS = {
  nameMax: 100,
  emailMax: 254,
  notesMax: 500,
  maxLines: 10,
  maxQuantity: 20,
  internalNoteMax: 1000,
} as const;

// Control characters (other than line breaks in notes) are never legitimate input.
const noControlChars = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

export function normaliseUkPhone(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, "");
  let national: string;
  if (/^\+44\d{9,10}$/.test(digits)) national = "0" + digits.slice(3).replace(/^0/, "");
  else if (/^0044\d{9,10}$/.test(digits)) national = "0" + digits.slice(4).replace(/^0/, "");
  else if (/^0\d{9,10}$/.test(digits)) national = digits;
  else return null;
  if (national.length !== 11 && national.length !== 10) return null;
  // Mobile numbers as 07xxx xxxxxx, others left as typed digits.
  return /^07\d{9}$/.test(national) ? `${national.slice(0, 5)} ${national.slice(5)}` : national;
}

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(LIMITS.nameMax, `Please keep your name under ${LIMITS.nameMax} characters.`)
    .refine(noControlChars, "Your name contains characters we can't accept."),
  email: z
    .string()
    .trim()
    .max(LIMITS.emailMax)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Please enter an email address like name@example.com.")
    .transform((s) => s.toLowerCase()),
  phone: z
    .string()
    .trim()
    .refine((s) => normaliseUkPhone(s) !== null, "Please enter a UK phone number, for example 07700 900123.")
    .transform((s) => normaliseUkPhone(s) as string),
});

export const orderLineRequestSchema = z.object({
  productId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  variantId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  quantity: z.number().int().min(1).max(LIMITS.maxQuantity),
});

export const createOrderRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  lines: z.array(orderLineRequestSchema).min(1, "Please add at least one cake.").max(LIMITS.maxLines),
  customer: customerSchema,
  collectionDate: z.string().regex(DATE_PATTERN).refine(isValidDate, "Please choose a collection date."),
  customerNotes: z
    .string()
    .max(LIMITS.notesMax, `Please keep notes under ${LIMITS.notesMax} characters.`)
    .refine(noControlChars)
    .optional()
    .default(""),
  // Honeypot: a hidden field that people never fill in but simple bots do.
  website: z.string().max(200).optional(),
  // The browser's total is accepted for comparison only; the server recalculates.
  clientTotalPence: z.number().int().optional(),
});

export type CreateOrderRequest = z.input<typeof createOrderRequestSchema>;
export type CreateOrderParsed = z.output<typeof createOrderRequestSchema>;

// ---- Admin inputs --------------------------------------------------------------------

export const updateOrderSchema = z
  .object({
    version: z.number().int().min(1),
    fulfilmentStatus: z.enum(["NEW", "CONFIRMED", "READY_FOR_COLLECTION", "COLLECTED", "CANCELLED"]).optional(),
    paymentStatus: z.enum(["AWAITING_PAYMENT", "PAID", "REFUNDED"]).optional(),
    note: z.string().trim().min(1).max(LIMITS.internalNoteMax).refine(noControlChars).optional(),
  })
  .refine((v) => v.fulfilmentStatus || v.paymentStatus || v.note, "Nothing to change.");

export const variantSchema = z.object({
  variantId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  label: z.string().trim().min(1).max(40),
  pricePence: z.number().int().min(0).max(100000),
  enabled: z.boolean(),
});

export const updateProductSchema = z.object({
  version: z.number().int().min(1),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600),
  tagline: z.string().trim().max(120).optional().default(""),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(99),
  maxQuantityPerOrder: z.number().int().min(1).max(LIMITS.maxQuantity),
  variants: z.array(variantSchema).min(1).max(4),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20),
});

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date and time.");

export const updateSettingsSchema = z.object({
  settingsVersion: z.number().int().min(1),
  seasonVersion: z.number().int().min(1),
  business: z.object({
    phone: z.string().trim().max(40),
    email: z.string().trim().max(LIMITS.emailMax),
    collectionAddressSummary: z.string().trim().max(300),
    paymentInfo: z.string().trim().max(400),
    allergenNotice: z.string().trim().max(600),
  }),
  maxOrdersPerEmailPerDay: z.number().int().min(1).max(50),
  season: z.object({
    label: z.string().trim().min(2).max(80),
    orderingOpensAt: isoDateTime,
    orderingDeadline: isoDateTime,
    isOpen: z.boolean(),
  }),
});

export const upsertCollectionDateSchema = z.object({
  enabled: z.boolean(),
  collectionWindow: z.string().trim().max(60),
  capacityUnits: z.number().int().min(1).max(1000).nullable(),
});

/** Turns a Zod error into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
