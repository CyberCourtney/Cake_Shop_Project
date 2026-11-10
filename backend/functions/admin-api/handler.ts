// /api/admin/*: everything the admin portal does, except the Excel export.
// API Gateway has already verified the Cognito token. requireAdmin() checks the group.
import { ConditionalCheckFailedException, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ListSubscriptionsByTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  bakingSummary,
  canChangeFulfilment,
  canChangePayment,
  FULFILMENT_LABELS,
  isCompleted,
  isValidDate,
  londonToday,
  normaliseOrderRef,
  PAYMENT_LABELS,
  fieldErrors,
  updateOrderSchema,
  updateProductSchema,
  updateSettingsSchema,
  upsertCollectionDateSchema,
} from "@kvc/shared";
import { requireAdmin } from "../../lib/auth";
import { ddb, keys, stripKeys, tableName } from "../../lib/db";
import { HttpError, httpHandler, json, parseJsonBody, type Event } from "../../lib/http";
import { log } from "../../lib/log";
import { filtersFromQuery, findOrders, getOrder, querySeasonOrders } from "../../lib/orders";
import { getProducts, getSeason, getSettings } from "../../lib/repo";

const sns = new SNSClient({});
/** Orders are kept for 18 months after collection, then DynamoDB TTL deletes them (docs/data-model.md section 5). */
const RETENTION_DAYS = 548;

type Route = (event: Event, params: string[], user: { username: string }) => Promise<ReturnType<typeof json>>;

const routes: Array<[string, RegExp, Route]> = [
  ["GET", /^\/api\/admin\/dashboard$/, dashboard],
  ["GET", /^\/api\/admin\/orders$/, listOrders],
  ["GET", /^\/api\/admin\/orders\/([^/]+)$/, orderDetail],
  ["PATCH", /^\/api\/admin\/orders\/([^/]+)$/, updateOrder],
  ["POST", /^\/api\/admin\/orders\/([^/]+)\/resend$/, resendNotifications],
  ["POST", /^\/api\/admin\/orders\/([^/]+)\/erase$/, eraseOrder],
  ["GET", /^\/api\/admin\/products$/, listProducts],
  ["PUT", /^\/api\/admin\/products\/([a-z0-9-]{1,40})$/, updateProduct],
  ["GET", /^\/api\/admin\/settings$/, getAllSettings],
  ["PUT", /^\/api\/admin\/settings$/, updateSettings],
  ["PUT", /^\/api\/admin\/dates\/(\d{4}-\d{2}-\d{2})$/, upsertDate],
];

export const handler = httpHandler(async (event) => {
  const user = requireAdmin(event);
  const method = event.requestContext.http.method;
  for (const [m, pattern, fn] of routes) {
    const match = pattern.exec(event.rawPath);
    if (match && m === method) return fn(event, match.slice(1), user);
  }
  throw new HttpError(404, "NOT_FOUND", "Not found.");
});

// ---- Dashboard -----------------------------------------------------------------------

async function dashboard() {
  const settings = await getSettings();
  const [orders, products] = await Promise.all([querySeasonOrders(settings.activeSeasonId), getProducts()]);
  const live = orders.filter((o) => o.fulfilmentStatus !== "CANCELLED");
  const today = londonToday();
  const upcomingOrders = live.filter((o) => o.collectionDate >= today && o.fulfilmentStatus !== "COLLECTED");

  const byDate = new Map<string, { date: string; orders: number; items: Map<string, number> }>();
  for (const o of upcomingOrders) {
    const entry = byDate.get(o.collectionDate) ?? { date: o.collectionDate, orders: 0, items: new Map() };
    entry.orders += 1;
    for (const l of o.lines) {
      const label = `${l.productName} (${l.variantLabel})`;
      entry.items.set(label, (entry.items.get(label) ?? 0) + l.quantity);
    }
    byDate.set(o.collectionDate, entry);
  }

  return json(200, {
    seasonId: settings.activeSeasonId,
    tiles: {
      totalOrders: live.length,
      newOrders: live.filter((o) => o.fulfilmentStatus === "NEW").length,
      confirmedOrders: live.filter((o) => o.fulfilmentStatus === "CONFIRMED").length,
      upcomingCollections: upcomingOrders.length,
      awaitingPayment: live.filter((o) => o.paymentStatus === "AWAITING_PAYMENT").length,
      completedOrders: live.filter(isCompleted).length,
      cancelledOrders: orders.length - live.length,
      totalValuePence: live.reduce((s, o) => s + o.totalPence, 0),
      outstandingPence: live.filter((o) => o.paymentStatus === "AWAITING_PAYMENT").reduce((s, o) => s + o.totalPence, 0),
      notificationProblems: orders.filter((o) => o.notificationProblem).length,
    },
    upcoming: [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date, orders: d.orders, items: [...d.items].map(([label, quantity]) => ({ label, quantity })) })),
    toBake: bakingSummary(orders, products),
    internalRecipients: await subscriberHealth(),
  });
}

/** "Internal notifications: 2 of 2 recipients subscribed". An unsubscribe click is otherwise silent. */
async function subscriberHealth(): Promise<{ confirmed: number; pending: number } | null> {
  const topic = process.env.ORDER_TOPIC_ARN;
  if (!topic) return null;
  try {
    let confirmed = 0;
    let pending = 0;
    let NextToken: string | undefined;
    do {
      const res = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: topic, NextToken }));
      for (const s of res.Subscriptions ?? []) {
        if (s.SubscriptionArn && s.SubscriptionArn.startsWith("arn:")) confirmed++;
        else pending++;
      }
      NextToken = res.NextToken;
    } while (NextToken);
    return { confirmed, pending };
  } catch (err) {
    log.warn("could not read SNS subscriptions", { errorName: (err as Error).name });
    return null;
  }
}

// ---- Orders --------------------------------------------------------------------------

async function listOrders(event: Event) {
  const settings = await getSettings();
  const filters = filtersFromQuery(event.queryStringParameters, settings.activeSeasonId);
  const orders = await findOrders(filters);
  return json(200, { seasonId: filters.seasonId, count: orders.length, orders });
}

function refParam(raw: string | undefined): string {
  const ref = normaliseOrderRef(decodeURIComponent(raw ?? ""));
  if (!ref) throw new HttpError(404, "NOT_FOUND", "That order reference doesn't look right.");
  return ref;
}

async function orderDetail(_e: Event, [raw]: string[]) {
  const found = await getOrder(refParam(raw));
  if (!found) throw new HttpError(404, "NOT_FOUND", "Order not found.");
  return json(200, found);
}

async function updateOrder(event: Event, [raw]: string[], user: { username: string }) {
  const ref = refParam(raw);
  const parsed = updateOrderSchema.safeParse(parseJsonBody(event));
  if (!parsed.success) throw new HttpError(400, "VALIDATION", "Please check the change.", { fields: fieldErrors(parsed.error) });
  const change = parsed.data;

  const found = await getOrder(ref);
  if (!found) throw new HttpError(404, "NOT_FOUND", "Order not found.");
  const order = found.order;
  if (order.version !== change.version) {
    throw new HttpError(409, "CONFLICT", "This order was changed somewhere else. Please reload it and try again.");
  }
  const fulfilmentChanged = change.fulfilmentStatus && change.fulfilmentStatus !== order.fulfilmentStatus;
  const paymentChanged = change.paymentStatus && change.paymentStatus !== order.paymentStatus;
  if (fulfilmentChanged && !canChangeFulfilment(order.fulfilmentStatus, change.fulfilmentStatus!)) {
    throw new HttpError(400, "INVALID_TRANSITION", `An order that is "${FULFILMENT_LABELS[order.fulfilmentStatus]}" can't be changed to "${FULFILMENT_LABELS[change.fulfilmentStatus!]}".`);
  }
  if (paymentChanged && !canChangePayment(order.paymentStatus, change.paymentStatus!)) {
    throw new HttpError(400, "INVALID_TRANSITION", `Payment that is "${PAYMENT_LABELS[order.paymentStatus]}" can't be changed to "${PAYMENT_LABELS[change.paymentStatus!]}".`);
  }

  const now = new Date().toISOString();
  const sets = ["version = version + :one", "updatedAt = :now"];
  const values: Record<string, unknown> = { ":one": 1, ":now": now, ":expected": order.version };
  const events: Array<Record<string, unknown>> = [];
  if (fulfilmentChanged) {
    sets.push("fulfilmentStatus = :f");
    values[":f"] = change.fulfilmentStatus;
    events.push({ type: "STATUS_CHANGED", field: "fulfilmentStatus", from: order.fulfilmentStatus, to: change.fulfilmentStatus });
    if (change.fulfilmentStatus === "COLLECTED" || change.fulfilmentStatus === "CANCELLED") {
      sets.push("expiresAt = :exp");
      values[":exp"] = Math.floor(new Date(`${order.collectionDate}T00:00:00Z`).getTime() / 1000) + RETENTION_DAYS * 86400;
    }
  }
  if (paymentChanged) {
    sets.push("paymentStatus = :p");
    values[":p"] = change.paymentStatus;
    events.push({ type: "STATUS_CHANGED", field: "paymentStatus", from: order.paymentStatus, to: change.paymentStatus });
  }
  if (change.note) {
    sets.push("internalNotes = list_append(if_not_exists(internalNotes, :empty), :note)");
    values[":empty"] = [];
    values[":note"] = [{ at: now, by: user.username, text: change.note }];
    events.push({ type: "NOTE_ADDED" });
  }
  if (events.length === 0) return json(200, found);

  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]> = [
    {
      Update: {
        TableName: tableName(),
        Key: keys.order(ref),
        UpdateExpression: "SET " + sets.join(", "),
        ConditionExpression: "version = :expected",
        ExpressionAttributeValues: values,
      },
    },
    ...events.map((e, i) => ({
      Put: {
        TableName: tableName(),
        Item: { pk: `ORDER#${ref}`, sk: `EVENT#${now}#${i}`, entityType: "OrderEvent", at: now, by: user.username, ...e },
      },
    })),
  ];
  // A cancelled order frees its place on the collection date.
  if (fulfilmentChanged && change.fulfilmentStatus === "CANCELLED") {
    items.push({
      Update: {
        TableName: tableName(),
        Key: keys.collectionDate(order.seasonId, order.collectionDate),
        UpdateExpression: "ADD bookedUnits :minus",
        ConditionExpression: "bookedUnits > :zero",
        ExpressionAttributeValues: { ":minus": -1, ":zero": 0 },
      },
    });
  }
  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: items }));
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const reasons = err.CancellationReasons ?? [];
      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        throw new HttpError(409, "CONFLICT", "This order was changed somewhere else. Please reload it and try again.");
      }
      // The date counter was already 0 (for example, a date added by hand). Not worth failing for.
      if (reasons.at(-1)?.Code === "ConditionalCheckFailed") {
        await ddb.send(new TransactWriteCommand({ TransactItems: items.slice(0, -1) }));
      } else throw err;
    } else throw err;
  }
  log.info("order updated", { orderRef: ref, changes: events.map((e) => e.type) });
  return json(200, await getOrder(ref));
}

async function resendNotifications(_e: Event, [raw]: string[], user: { username: string }) {
  const ref = refParam(raw);
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            // pendingNotify makes the stream deliver this MODIFY to the notifier, which
            // retries whatever failed and then removes the flag (so there is no loop).
            Update: {
              TableName: tableName(),
              Key: keys.order(ref),
              UpdateExpression: "SET pendingNotify = :r, updatedAt = :now",
              ConditionExpression: "attribute_exists(pk)",
              ExpressionAttributeValues: { ":r": "RESEND", ":now": now },
            },
          },
          { Put: { TableName: tableName(), Item: { pk: `ORDER#${ref}`, sk: `EVENT#${now}#resend`, entityType: "OrderEvent", at: now, by: user.username, type: "RESEND_REQUESTED" } } },
        ],
      }),
    );
  } catch (err) {
    if (err instanceof TransactionCanceledException) throw new HttpError(404, "NOT_FOUND", "Order not found.");
    throw err;
  }
  return json(202, { message: "Notifications will be sent again within a minute." });
}

async function eraseOrder(event: Event, [raw]: string[], user: { username: string }) {
  const ref = refParam(raw);
  const body = parseJsonBody(event) as { confirm?: string };
  if (body.confirm !== ref) throw new HttpError(400, "CONFIRM", `Type ${ref} to confirm erasing this customer's details.`);
  const now = new Date().toISOString();
  const erased = "[erased]";
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          // Keeps the reference, lines and totals (needed for the accounts). Removes the person.
          Update: {
            TableName: tableName(),
            Key: keys.order(ref),
            UpdateExpression: "SET customer = :c, customerNameLower = :e, customerNotes = :e, version = version + :one, updatedAt = :now, erasedAt = :now",
            ConditionExpression: "attribute_exists(pk)",
            ExpressionAttributeValues: { ":c": { name: erased, email: erased, phone: erased }, ":e": erased, ":one": 1, ":now": now },
          },
        },
        { Put: { TableName: tableName(), Item: { pk: `ORDER#${ref}`, sk: `EVENT#${now}#erased`, entityType: "OrderEvent", at: now, by: user.username, type: "ERASED" } } },
      ],
    }),
  );
  log.info("order personal data erased", { orderRef: ref });
  return json(200, await getOrder(ref));
}

// ---- Products ------------------------------------------------------------------------

async function listProducts() {
  return json(200, { products: await getProducts() });
}

async function updateProduct(event: Event, [id]: string[], user: { username: string }) {
  const parsed = updateProductSchema.safeParse(parseJsonBody(event));
  if (!parsed.success) throw new HttpError(400, "VALIDATION", "Please check the highlighted fields.", { fields: fieldErrors(parsed.error) });
  const p = parsed.data;
  const ids = new Set(p.variants.map((v) => v.variantId));
  if (ids.size !== p.variants.length) throw new HttpError(400, "VALIDATION", "Each option needs a different name.");
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: keys.product(id!),
        UpdateExpression:
          "SET #name = :name, description = :d, tagline = :t, enabled = :en, sortOrder = :so, maxQuantityPerOrder = :mq, variants = :v, allergens = :a, version = version + :one, updatedAt = :now, updatedBy = :by",
        ConditionExpression: "attribute_exists(pk) AND version = :expected",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: {
          ":name": p.name, ":d": p.description, ":t": p.tagline, ":en": p.enabled, ":so": p.sortOrder,
          ":mq": p.maxQuantityPerOrder, ":v": p.variants, ":a": p.allergens, ":one": 1,
          ":now": new Date().toISOString(), ":by": user.username, ":expected": p.version,
        },
        ReturnValues: "ALL_NEW",
      }),
    );
    log.info("product updated", { productId: id });
    return json(200, { product: stripKeys(res.Attributes ?? {}) });
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new HttpError(409, "CONFLICT", "This cake was changed somewhere else. Please reload and try again.");
    }
    throw err;
  }
}

// ---- Settings, season and collection dates ---------------------------------------------

async function getAllSettings() {
  const settings = await getSettings();
  const { season, dates } = await getSeason(settings.activeSeasonId);
  return json(200, { settings, season, dates });
}

async function updateSettings(event: Event, _p: string[], user: { username: string }) {
  const parsed = updateSettingsSchema.safeParse(parseJsonBody(event));
  if (!parsed.success) throw new HttpError(400, "VALIDATION", "Please check the highlighted fields.", { fields: fieldErrors(parsed.error) });
  const s = parsed.data;
  if (new Date(s.season.orderingDeadline) <= new Date(s.season.orderingOpensAt)) {
    throw new HttpError(400, "VALIDATION", "The ordering deadline must be after the opening time.", {
      fields: { "season.orderingDeadline": "Must be after the opening time." },
    });
  }
  const current = await getSettings();
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: tableName(),
              Key: keys.settings(),
              UpdateExpression: "SET business = :b, maxOrdersPerEmailPerDay = :m, version = version + :one, updatedAt = :now, updatedBy = :by",
              ConditionExpression: "version = :v",
              ExpressionAttributeValues: { ":b": s.business, ":m": s.maxOrdersPerEmailPerDay, ":one": 1, ":now": now, ":by": user.username, ":v": s.settingsVersion },
            },
          },
          {
            Update: {
              TableName: tableName(),
              Key: keys.season(current.activeSeasonId),
              UpdateExpression: "SET label = :l, orderingOpensAt = :o, orderingDeadline = :d, isOpen = :i, version = version + :one, updatedAt = :now",
              ConditionExpression: "version = :v",
              ExpressionAttributeValues: { ":l": s.season.label, ":o": new Date(s.season.orderingOpensAt).toISOString(), ":d": new Date(s.season.orderingDeadline).toISOString(), ":i": s.season.isOpen, ":one": 1, ":now": now, ":v": s.seasonVersion },
            },
          },
        ],
      }),
    );
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      throw new HttpError(409, "CONFLICT", "These settings were changed somewhere else. Please reload and try again.");
    }
    throw err;
  }
  log.info("settings updated");
  return getAllSettings();
}

async function upsertDate(event: Event, [date]: string[]) {
  if (!isValidDate(date!)) throw new HttpError(400, "VALIDATION", "That isn't a real date.");
  const parsed = upsertCollectionDateSchema.safeParse(parseJsonBody(event));
  if (!parsed.success) throw new HttpError(400, "VALIDATION", "Please check the date details.", { fields: fieldErrors(parsed.error) });
  const d = parsed.data;
  const settings = await getSettings();
  // Collection dates are never deleted (they may have orders); they are switched off instead.
  await ddb.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.collectionDate(settings.activeSeasonId, date!),
      UpdateExpression:
        "SET entityType = :t, enabled = :en, collectionWindow = :w, bookedUnits = if_not_exists(bookedUnits, :zero)" +
        (d.capacityUnits === null ? " REMOVE capacityUnits" : ", capacityUnits = :cap"),
      ExpressionAttributeValues: {
        ":t": "CollectionDate", ":en": d.enabled, ":w": d.collectionWindow, ":zero": 0,
        ...(d.capacityUnits === null ? {} : { ":cap": d.capacityUnits }),
      },
    }),
  );
  return getAllSettings();
}
