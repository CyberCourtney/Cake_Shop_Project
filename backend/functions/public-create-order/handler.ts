// POST /api/orders: validate, price on the server, and store the order.
//
// This function only writes to DynamoDB. It never sends email. The notifier Lambda picks
// the new order up from the table's stream afterwards, so an email problem can never lose
// an order or show the customer an error ("write first, notify second").
import { createHash, randomBytes } from "node:crypto";
import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  createOrderRequestSchema,
  fieldErrors,
  generateOrderRef,
  londonToday,
  orderTotal,
  type CreateOrderResponse,
  type OrderLine,
  type Product,
} from "@kvc/shared";
import { ddb, keys, tableName } from "../../lib/db";
import { HttpError, httpHandler, json, parseJsonBody } from "../../lib/http";
import { log } from "../../lib/log";
import { getProducts, getSeason, getSettings, orderingState } from "../../lib/repo";

const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;
const RATE_TTL_SECONDS = 48 * 3600;
const MAX_REF_ATTEMPTS = 3;

export const handler = httpHandler(async (event) => {
  const parsed = createOrderRequestSchema.safeParse(parseJsonBody(event));
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION", "Some details need checking.", { fields: fieldErrors(parsed.error) });
  }
  const req = parsed.data;
  if (req.website) {
    log.warn("honeypot field filled; rejecting");
    throw new HttpError(400, "VALIDATION", "Sorry, we couldn't accept that order. Please try again.");
  }

  // 1. Seen this checkout before? (double-click, slow network retry, refresh and resubmit)
  const previous = await findPrevious(req.idempotencyKey);
  if (previous) return json(200, previous);

  // 2. Is the shop open, and is the date available?
  const settings = await getSettings();
  const [products, { season, dates }] = await Promise.all([getProducts(), getSeason(settings.activeSeasonId)]);
  if (!season) throw new HttpError(409, "ORDERING_CLOSED", "Ordering is closed at the moment.");
  const state = orderingState(season);
  if (!state.acceptingOrders) {
    const message =
      state.closedReason === "deadline-passed"
        ? "Sorry, the ordering deadline for this season has passed."
        : state.closedReason === "not-open-yet"
          ? "Ordering for this season hasn't opened yet."
          : "Ordering is closed at the moment.";
    throw new HttpError(409, "ORDERING_CLOSED", message);
  }
  const date = dates.find((d) => d.date === req.collectionDate);
  if (!date || !date.enabled || req.collectionDate <= londonToday()) {
    throw new HttpError(409, "DATE_UNAVAILABLE", "That collection date isn't available. Please choose another.");
  }

  // 3. Price every line from the catalogue. The browser's total is ignored.
  const lines = priceLines(req.lines, products);
  const totalPence = orderTotal(lines);
  if (req.clientTotalPence !== undefined && req.clientTotalPence !== totalPence) {
    // Not an error: prices may have changed since the page loaded. The confirmation shows
    // the real total. Logged so a pricing bug in the shop would be noticed.
    log.warn("client total differed from server total", { clientTotalPence: req.clientTotalPence, totalPence });
  }

  // 4. Write everything in one transaction.
  const now = new Date();
  const submittedAt = now.toISOString();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const emailHash = createHash("sha256").update(req.customer.email).digest("hex");

  for (let attempt = 1; attempt <= MAX_REF_ATTEMPTS; attempt++) {
    const orderRef = generateOrderRef((n) => randomBytes(n));
    const response: CreateOrderResponse = {
      orderRef,
      totalPence,
      collectionDate: req.collectionDate,
      status: "received",
      lines,
      customerEmailEnabled: process.env.CUSTOMER_EMAIL_ENABLED === "true",
    };
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName(),
                Item: {
                  ...keys.order(orderRef),
                  entityType: "Order",
                  gsi1pk: `SEASON#${season.seasonId}`,
                  gsi1sk: `${req.collectionDate}#${orderRef}`,
                  orderRef,
                  submittedAt,
                  seasonId: season.seasonId,
                  customer: req.customer,
                  customerNameLower: req.customer.name.toLowerCase(),
                  lines,
                  totalPence,
                  collectionDate: req.collectionDate,
                  customerNotes: req.customerNotes.trim(),
                  fulfilmentStatus: "NEW",
                  paymentStatus: "AWAITING_PAYMENT",
                  internalNotes: [],
                  notifications: {},
                  idempotencyKey: req.idempotencyKey,
                  version: 1,
                  updatedAt: submittedAt,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Put: {
                TableName: tableName(),
                Item: {
                  ...keys.idempotency(req.idempotencyKey),
                  entityType: "Idempotency",
                  response,
                  expiresAt: nowSeconds + IDEMPOTENCY_TTL_SECONDS,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              // Capacity counts orders per date. With no capacityUnits, a date is unlimited.
              Update: {
                TableName: tableName(),
                Key: keys.collectionDate(season.seasonId, req.collectionDate),
                UpdateExpression: "ADD bookedUnits :one",
                ConditionExpression:
                  "enabled = :true AND (attribute_not_exists(capacityUnits) OR bookedUnits < capacityUnits)",
                ExpressionAttributeValues: { ":one": 1, ":true": true },
              },
            },
            {
              Update: {
                TableName: tableName(),
                Key: keys.rate(emailHash, londonToday(now)),
                UpdateExpression: "ADD #count :one SET expiresAt = if_not_exists(expiresAt, :exp)",
                ConditionExpression: "attribute_not_exists(#count) OR #count < :max",
                ExpressionAttributeNames: { "#count": "count" },
                ExpressionAttributeValues: {
                  ":one": 1,
                  ":max": settings.maxOrdersPerEmailPerDay,
                  ":exp": nowSeconds + RATE_TTL_SECONDS,
                },
              },
            },
            {
              Put: {
                TableName: tableName(),
                Item: {
                  pk: `ORDER#${orderRef}`,
                  sk: `EVENT#${submittedAt}#created`,
                  entityType: "OrderEvent",
                  at: submittedAt,
                  type: "CREATED",
                  by: "customer",
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      );
      log.info("order created", { orderRef, lineCount: lines.length, totalPence, collectionDate: req.collectionDate });
      return json(201, response);
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const failed = (err.CancellationReasons ?? []).map((r) => r.Code === "ConditionalCheckFailed");
      if (failed[1]) {
        // The same checkout was submitted twice at the same moment. Return the first one.
        const again = await findPrevious(req.idempotencyKey);
        if (again) return json(200, again);
      }
      if (failed[2]) throw new HttpError(409, "DATE_FULL", "Sorry, that collection date has just filled up. Please choose another.");
      if (failed[3]) {
        throw new HttpError(429, "TOO_MANY_ORDERS", "You've placed several orders today already. Please call or message us if you need to change an order.");
      }
      if (failed[0] && attempt < MAX_REF_ATTEMPTS) {
        log.warn("order reference clash; trying another", { attempt });
        continue;
      }
      throw err;
    }
  }
  throw new HttpError(500, "INTERNAL", "Something went wrong on our side. Please try again in a minute.");
});

async function findPrevious(idempotencyKey: string): Promise<CreateOrderResponse | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: tableName(), Key: keys.idempotency(idempotencyKey), ConsistentRead: true }),
  );
  return (res.Item?.response as CreateOrderResponse | undefined) ?? null;
}

export function priceLines(
  requested: Array<{ productId: string; variantId: string; quantity: number }>,
  products: Product[],
): OrderLine[] {
  // Merge repeated product+variant lines so limits apply to the real quantity.
  const merged = new Map<string, { productId: string; variantId: string; quantity: number }>();
  for (const l of requested) {
    const k = `${l.productId}/${l.variantId}`;
    const existing = merged.get(k);
    if (existing) existing.quantity += l.quantity;
    else merged.set(k, { ...l });
  }
  return [...merged.values()].map((l) => {
    const product = products.find((p) => p.productId === l.productId && p.enabled);
    const variant = product?.variants.find((v) => v.variantId === l.variantId && v.enabled);
    if (!product || !variant) {
      throw new HttpError(409, "PRODUCT_UNAVAILABLE", "One of the cakes in your order is no longer available. Please review your order.");
    }
    if (l.quantity > product.maxQuantityPerOrder) {
      throw new HttpError(400, "QUANTITY_LIMIT", `You can order up to ${product.maxQuantityPerOrder} of the ${product.name} online. For more, please get in touch.`);
    }
    return {
      productId: product.productId,
      productName: product.name,
      variantId: variant.variantId,
      variantLabel: variant.label,
      quantity: l.quantity,
      unitPricePence: variant.pricePence,
      lineTotalPence: l.quantity * variant.pricePence,
    };
  });
}
