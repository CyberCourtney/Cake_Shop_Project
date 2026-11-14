// Order queries used by admin-api and admin-export (both are admin-only).
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { londonToday, normaliseOrderRef, type FulfilmentStatus, type Order, type OrderEvent, type PaymentStatus } from "@kvc/shared";
import { ddb, keys, stripKeys, tableName } from "./db";

export interface OrderFilters {
  seasonId: string;
  collectionDate?: string;
  fulfilmentStatus?: FulfilmentStatus;
  paymentStatus?: PaymentStatus;
  q?: string;
  notifyFailed?: boolean;
  upcoming?: boolean;
}

/** All orders for a season (optionally one date), via the sparse GSI. Handles paging. */
export async function querySeasonOrders(seasonId: string, collectionDate?: string): Promise<Order[]> {
  const out: Order[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: "gsi1",
        KeyConditionExpression: collectionDate ? "gsi1pk = :s AND begins_with(gsi1sk, :d)" : "gsi1pk = :s",
        ExpressionAttributeValues: collectionDate ? { ":s": `SEASON#${seasonId}`, ":d": `${collectionDate}#` } : { ":s": `SEASON#${seasonId}` },
        ExclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) out.push(stripKeys(item) as unknown as Order);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export async function getOrder(ref: string): Promise<{ order: Order; history: OrderEvent[] } | null> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `ORDER#${ref}` },
      ConsistentRead: true,
    }),
  );
  let order: Order | null = null;
  const history: OrderEvent[] = [];
  for (const item of res.Items ?? []) {
    if (item.sk === "META") order = stripKeys(item) as unknown as Order;
    else history.push(stripKeys(item) as unknown as OrderEvent);
  }
  return order ? { order, history: history.sort((a, b) => a.at.localeCompare(b.at)) } : null;
}

/** Filtering is done here rather than with extra indexes: see docs/data-model.md section 3. */
export async function findOrders(f: OrderFilters): Promise<Order[]> {
  const ref = f.q ? normaliseOrderRef(f.q) : null;
  let orders: Order[];
  if (ref) {
    const res = await ddb.send(new GetCommand({ TableName: tableName(), Key: keys.order(ref) }));
    orders = res.Item ? [stripKeys(res.Item) as unknown as Order] : [];
  } else {
    orders = await querySeasonOrders(f.seasonId, f.collectionDate);
  }
  const q = !ref && f.q ? f.q.trim().toLowerCase() : "";
  const today = londonToday();
  return orders
    .filter((o) => !f.collectionDate || o.collectionDate === f.collectionDate)
    .filter((o) => !f.fulfilmentStatus || o.fulfilmentStatus === f.fulfilmentStatus)
    .filter((o) => !f.paymentStatus || o.paymentStatus === f.paymentStatus)
    .filter((o) => !f.notifyFailed || o.notificationProblem === true)
    .filter((o) => !f.upcoming || (o.collectionDate >= today && o.fulfilmentStatus !== "CANCELLED" && o.fulfilmentStatus !== "COLLECTED"))
    .filter((o) => !q || o.customer.name.toLowerCase().includes(q) || o.customer.email.includes(q) || o.orderRef.toLowerCase().includes(q))
    .sort((a, b) => a.collectionDate.localeCompare(b.collectionDate) || a.submittedAt.localeCompare(b.submittedAt));
}

const FULFILMENT = ["NEW", "CONFIRMED", "READY_FOR_COLLECTION", "COLLECTED", "CANCELLED"];
const PAYMENT = ["AWAITING_PAYMENT", "PAID", "REFUNDED"];

export function filtersFromQuery(qs: Record<string, string | undefined> | undefined, activeSeasonId: string): OrderFilters {
  const p = qs ?? {};
  const pick = <T extends string>(v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? (v as T) : undefined);
  return {
    seasonId: p.season && /^[A-Za-z0-9-]{1,20}$/.test(p.season) ? p.season : activeSeasonId,
    collectionDate: p.collectionDate && /^\d{4}-\d{2}-\d{2}$/.test(p.collectionDate) ? p.collectionDate : undefined,
    fulfilmentStatus: pick<FulfilmentStatus>(p.status, FULFILMENT),
    paymentStatus: pick<PaymentStatus>(p.payment, PAYMENT),
    q: p.q ? p.q.slice(0, 100) : undefined,
    notifyFailed: p.notifyFailed === "true",
    upcoming: p.upcoming === "true",
  };
}
