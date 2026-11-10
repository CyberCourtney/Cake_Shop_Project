#!/usr/bin/env node
// Loads the starting catalogue, shop settings, season and collection dates.
//
//   node scripts/seed-catalogue.mjs --table kvc-dev-main
//   node scripts/seed-catalogue.mjs --table kvc-local-main --endpoint http://localhost:8000
//
// Every write is conditional (attribute_not_exists), so this is safe to run on every
// deploy: it fills in anything missing and NEVER overwrites a price, description or date
// that the baker has changed in the admin portal. deploy.sh runs it after each stack update.
//
// Values marked PLACEHOLDER are waiting on "Facts from the baker" (docs/open-questions.md) and
// are meant to be edited in the admin portal, not here.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.table) {
  console.error("Usage: seed-catalogue.mjs --table <name> [--endpoint <url>]");
  process.exit(1);
}
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2", ...(args.endpoint ? { endpoint: args.endpoint } : {}) }),
);

const SEASON = "2026";
const now = new Date().toISOString();
const PLACEHOLDER_ALLERGENS = ["PLACEHOLDER: to be confirmed by the baker"];

const items = [
  {
    pk: "CONFIG", sk: "SETTINGS", entityType: "Settings",
    activeSeasonId: SEASON,
    business: {
      phone: "PLACEHOLDER 07000 000000",
      email: "PLACEHOLDER orders@example.invalid",
      collectionAddressSummary: "PLACEHOLDER: collection is from the baker's home. The address is sent when your order is confirmed.",
      paymentInfo: "PLACEHOLDER: pay by cash or bank transfer when you collect. No card details are taken online.",
      allergenNotice: "PLACEHOLDER: allergen details are being confirmed. Our cakes are made in a home kitchen that handles nuts, eggs, milk and gluten.",
    },
    maxOrdersPerEmailPerDay: 3,
    version: 1, updatedAt: now,
  },
  {
    pk: `SEASON#${SEASON}`, sk: "META", entityType: "Season",
    label: "Christmas & New Year 2026",
    orderingOpensAt: "2026-11-01T00:00:00.000Z",
    // A placeholder deadline. It is data, changed in Admin > Season and dates.
    orderingDeadline: "2026-12-12T23:59:00.000Z",
    isOpen: true,
    version: 1, updatedAt: now,
  },
  ...["2026-12-19", "2026-12-20", "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-30", "2026-12-31"].map((date) => ({
    pk: `SEASON#${SEASON}`, sk: `DATE#${date}`, entityType: "CollectionDate",
    enabled: true, collectionWindow: "PLACEHOLDER 10:00 to 16:00", bookedUnits: 0,
  })),
  {
    pk: "CATALOGUE", sk: "PRODUCT#cake-6in", entityType: "Product", productId: "cake-6in",
    name: "6-inch Jamaican Christmas cake",
    tagline: "Just right for a family table",
    description: "PLACEHOLDER: A rich, dark fruit cake made the traditional Jamaican way, with fruit soaked in rum and wine. Choose it plain, or iced with marzipan and royal icing.",
    illustration: "round-cake", enabled: true, sortOrder: 1, maxQuantityPerOrder: 10,
    variants: [
      { variantId: "uniced", label: "Un-iced", pricePence: 2500, enabled: true },
      { variantId: "iced", label: "Iced", pricePence: 3500, enabled: true },
    ],
    allergens: PLACEHOLDER_ALLERGENS, version: 1, updatedAt: now,
  },
  {
    pk: "CATALOGUE", sk: "PRODUCT#cake-8in", entityType: "Product", productId: "cake-8in",
    name: "8-inch Jamaican Christmas cake",
    tagline: "For a crowd, or to share with neighbours",
    description: "PLACEHOLDER: The same traditional recipe in a larger size. Plenty for Christmas Day and the days after.",
    illustration: "round-cake", enabled: true, sortOrder: 2, maxQuantityPerOrder: 10,
    variants: [
      { variantId: "uniced", label: "Un-iced", pricePence: 4000, enabled: true },
      { variantId: "iced", label: "Iced", pricePence: 5000, enabled: true },
    ],
    allergens: PLACEHOLDER_ALLERGENS, version: 1, updatedAt: now,
  },
  {
    pk: "CATALOGUE", sk: "PRODUCT#rose-mini", entityType: "Product", productId: "rose-mini",
    name: "Rose-shaped mini cake",
    tagline: "Great for tasters or an excellent gift",
    description: "PLACEHOLDER: A small rose-shaped cake made with the same rich fruit mixture.",
    illustration: "rose", enabled: true, sortOrder: 3, maxQuantityPerOrder: 20,
    variants: [{ variantId: "uniced", label: "Un-iced", pricePence: 1000, enabled: true }],
    allergens: PLACEHOLDER_ALLERGENS, version: 1, updatedAt: now,
  },
];

let created = 0;
let kept = 0;
for (const Item of items) {
  try {
    await ddb.send(new PutCommand({ TableName: args.table, Item, ConditionExpression: "attribute_not_exists(pk)" }));
    created++;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) kept++;
    else throw err;
  }
}
console.log(`Seed: ${created} item(s) created, ${kept} already present and left unchanged.`);
