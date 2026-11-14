// Reads shared by several functions. Each function's IAM role limits which of these it can
// actually call (for example, public-catalogue cannot read ORDER# items at all).
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { CollectionDate, Product, Season, Settings } from "@kvc/shared";
import { ddb, keys, stripKeys, tableName } from "./db";

export async function getSettings(): Promise<Settings> {
  const res = await ddb.send(new GetCommand({ TableName: tableName(), Key: keys.settings() }));
  if (!res.Item) throw new Error("Shop settings are missing. Run the seed step (scripts/seed-catalogue.mjs).");
  return stripKeys(res.Item) as unknown as Settings;
}

export async function getProducts(): Promise<Product[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":pk": "CATALOGUE", ":p": "PRODUCT#" },
    }),
  );
  return (res.Items ?? [])
    .map((i) => stripKeys(i) as unknown as Product)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The season's META item and all its collection dates, in one Query. */
export async function getSeason(seasonId: string): Promise<{ season: Season | null; dates: CollectionDate[] }> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `SEASON#${seasonId}` },
      ConsistentRead: false,
    }),
  );
  let season: Season | null = null;
  const dates: CollectionDate[] = [];
  for (const item of res.Items ?? []) {
    if (item.sk === "META") season = { ...(stripKeys(item) as unknown as Season), seasonId };
    else if (typeof item.sk === "string" && item.sk.startsWith("DATE#")) {
      const d = stripKeys(item) as unknown as CollectionDate;
      dates.push({ ...d, date: item.sk.slice(5), bookedUnits: d.bookedUnits ?? 0 });
    }
  }
  dates.sort((a, b) => a.date.localeCompare(b.date));
  return { season, dates };
}

export type OrderingState = { acceptingOrders: boolean; closedReason?: "not-open-yet" | "deadline-passed" | "closed" };

export function orderingState(season: Season, now = new Date()): OrderingState {
  if (!season.isOpen) return { acceptingOrders: false, closedReason: "closed" };
  if (now < new Date(season.orderingOpensAt)) return { acceptingOrders: false, closedReason: "not-open-yet" };
  if (now > new Date(season.orderingDeadline)) return { acceptingOrders: false, closedReason: "deadline-passed" };
  return { acceptingOrders: true };
}

export function businessInfo(settings: Settings) {
  // Both names come from the deployment parameters (Lambda environment), never from the code.
  return { name: process.env.BUSINESS_NAME || "Example Cake Co", bakerName: process.env.BAKER_NAME || "Sam", ...settings.business };
}
