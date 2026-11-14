import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// One client per container, reused across invocations.
const client = new DynamoDBClient(
  process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT, region: "eu-west-2" } : {},
);
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export function tableName(): string {
  const t = process.env.TABLE_NAME;
  if (!t) throw new Error("TABLE_NAME is not set");
  return t;
}

// Key helpers (docs/data-model.md section 2).
export const keys = {
  product: (id: string) => ({ pk: "CATALOGUE", sk: `PRODUCT#${id}` }),
  settings: () => ({ pk: "CONFIG", sk: "SETTINGS" }),
  season: (id: string) => ({ pk: `SEASON#${id}`, sk: "META" }),
  collectionDate: (seasonId: string, date: string) => ({ pk: `SEASON#${seasonId}`, sk: `DATE#${date}` }),
  order: (ref: string) => ({ pk: `ORDER#${ref}`, sk: "META" }),
  idempotency: (key: string) => ({ pk: `IDEMP#${key}`, sk: "META" }),
  rate: (emailHash: string, day: string) => ({ pk: `RATE#${emailHash}#${day}`, sk: "META" }),
};

/** Removes the DynamoDB key and housekeeping attributes before data leaves the API. */
export function stripKeys<T extends Record<string, unknown>>(item: T): Omit<T, "pk" | "sk" | "gsi1pk" | "gsi1sk" | "entityType"> {
  const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, entityType: _e, ...rest } = item;
  return rest;
}
