// GET /api/catalogue: everything the shop needs to draw itself, in one request.
// CloudFront caches the response for 60 seconds, so a busy evening costs a handful of
// Lambda and DynamoDB calls a minute, not one per visitor.
import type { CatalogueResponse } from "@kvc/shared";
import { londonToday } from "@kvc/shared";
import { httpHandler, json } from "../../lib/http";
import { businessInfo, getProducts, getSeason, getSettings, orderingState } from "../../lib/repo";

export const handler = httpHandler(async () => {
  const settings = await getSettings();
  const [products, { season, dates }] = await Promise.all([getProducts(), getSeason(settings.activeSeasonId)]);
  const today = londonToday();

  const state = season ? orderingState(season) : { acceptingOrders: false, closedReason: "closed" as const };
  const body: CatalogueResponse = {
    business: businessInfo(settings),
    season: {
      seasonId: settings.activeSeasonId,
      label: season?.label ?? "",
      orderingOpensAt: season?.orderingOpensAt ?? "",
      orderingDeadline: season?.orderingDeadline ?? "",
      ...state,
    },
    products: products
      .filter((p) => p.enabled && p.variants.some((v) => v.enabled))
      .map(({ version: _v, updatedAt: _u, ...p }) => ({ ...p, variants: p.variants.filter((v) => v.enabled) })),
    // Only future, enabled dates. "Full" is a hint for the date picker; the order
    // function checks capacity again, atomically, when an order is placed.
    collectionDates: dates
      .filter((d) => d.enabled && d.date > today)
      .map((d) => ({
        date: d.date,
        collectionWindow: d.collectionWindow,
        full: d.capacityUnits !== undefined && d.capacityUnits !== null && d.bookedUnits >= d.capacityUnits,
      })),
    generatedAt: new Date().toISOString(),
  };
  return json(200, body, 60);
});
