// GET /api/admin/exports/orders.xlsx?<same filters as the order list>
// Returns the workbook directly (base64 through API Gateway), not via S3, so no copies of
// customer data are left in a bucket. A season is ~100-200 KB, well under the 6 MB limit.
import { FULFILMENT_LABELS, PAYMENT_LABELS, formatCollectionDate } from "@kvc/shared";
import { requireAdmin } from "../../lib/auth";
import { HttpError, httpHandler } from "../../lib/http";
import { log } from "../../lib/log";
import { filtersFromQuery, findOrders, type OrderFilters } from "../../lib/orders";
import { getSettings } from "../../lib/repo";
import { buildOrdersWorkbook } from "./workbook";

export const handler = httpHandler(async (event) => {
  const user = requireAdmin(event);
  if (!/^\/api\/admin\/exports\/orders\.xlsx$/.test(event.rawPath)) throw new HttpError(404, "NOT_FOUND", "Not found.");

  const settings = await getSettings();
  const filters = filtersFromQuery(event.queryStringParameters, settings.activeSeasonId);
  const orders = await findOrders(filters);
  const businessName = process.env.BUSINESS_NAME || "Example Cake Co";
  const exportedAt = new Date();
  const buffer = await buildOrdersWorkbook(orders, {
    businessName,
    exportedBy: user.username,
    exportedAt,
    filtersDescription: describe(filters),
  });

  const filename = `${businessName.replace(/[^A-Za-z0-9]/g, "")}-orders${filters.collectionDate ? "-" + filters.collectionDate : ""}-exported-${exportedAt.toISOString().slice(0, 10)}.xlsx`;
  log.info("export built", { orders: orders.length, bytes: buffer.length });
  return {
    statusCode: 200,
    isBase64Encoded: true,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
    body: buffer.toString("base64"),
  };
});

export function describe(f: OrderFilters): string {
  const parts = [`Season ${f.seasonId}`];
  if (f.collectionDate) parts.push(`collection date ${formatCollectionDate(f.collectionDate, { year: true })}`);
  if (f.fulfilmentStatus) parts.push(`status ${FULFILMENT_LABELS[f.fulfilmentStatus]}`);
  if (f.paymentStatus) parts.push(`payment ${PAYMENT_LABELS[f.paymentStatus]}`);
  if (f.q) parts.push(`search "${f.q}"`);
  if (f.notifyFailed) parts.push("notification problems only");
  if (f.upcoming) parts.push("upcoming collections only");
  return parts.length === 1 ? `${parts[0]}, all orders` : parts.join(", ");
}
