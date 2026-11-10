// Builds the .xlsx workbook (docs/excel-export.md). Kept separate from the handler so the
// tests can open the result and check every column, format and total.
import ExcelJS from "exceljs";
import { FULFILMENT_LABELS, PAYMENT_LABELS, type Order } from "@kvc/shared";

const RED = "FF9E1B22";
const SHADE = "FFF6EBD3"; // ivory, alternates by order
const GBP = '"£"#,##0.00';

/**
 * Formula injection: a customer could type "=HYPERLINK(...)" into a field. Every value from
 * customer input is written as a string, and anything that starts like a formula gets an
 * apostrophe in front, so Excel shows it as text and never runs it.
 */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Excel has no time zones. Dates are converted to London wall-clock time first. */
function londonWallClock(iso: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export interface ExportMeta {
  businessName: string;
  exportedBy: string;
  exportedAt: Date;
  filtersDescription: string;
}

export async function buildOrdersWorkbook(orders: Order[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.businessName;
  wb.created = meta.exportedAt;

  // ---- Sheet 1: one row per order line ------------------------------------------------
  const ws = wb.addWorksheet("Orders", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Order reference", key: "ref", width: 15 },
    { header: "Date received", key: "received", width: 17, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { header: "Customer name", key: "name", width: 24 },
    { header: "Customer email", key: "email", width: 30 },
    { header: "Customer telephone", key: "phone", width: 18 },
    { header: "Product", key: "product", width: 32 },
    { header: "Variant", key: "variant", width: 10 },
    { header: "Quantity", key: "qty", width: 10, style: { numFmt: "0" } },
    { header: "Unit price", key: "unit", width: 11, style: { numFmt: GBP } },
    { header: "Line total", key: "line", width: 11, style: { numFmt: GBP } },
    { header: "Order total", key: "total", width: 12, style: { numFmt: GBP } },
    { header: "Collection date", key: "collection", width: 16, style: { numFmt: "ddd dd/mm/yyyy" } },
    { header: "Fulfilment status", key: "fulfilment", width: 20 },
    { header: "Payment status", key: "payment", width: 17 },
    { header: "Customer notes", key: "customerNotes", width: 36 },
    { header: "Internal notes", key: "notes", width: 40 },
  ];

  let shaded = false;
  for (const o of orders) {
    shaded = !shaded;
    const internalNotes = (o.internalNotes ?? [])
      .map((n) => `${n.at.slice(8, 10)}/${n.at.slice(5, 7)} ${n.text}`)
      .join("\n");
    o.lines.forEach((l, i) => {
      const row = ws.addRow({
        ref: o.orderRef,
        received: londonWallClock(o.submittedAt),
        name: safeText(o.customer.name),
        email: safeText(o.customer.email),
        phone: safeText(o.customer.phone), // text, so the leading 0 is kept
        product: safeText(l.productName),
        variant: safeText(l.variantLabel),
        qty: l.quantity,
        unit: l.unitPricePence / 100,
        line: l.lineTotalPence / 100,
        // Only on the first line of each order, so summing the column never double-counts.
        total: i === 0 ? o.totalPence / 100 : null,
        collection: dateOnly(o.collectionDate),
        fulfilment: FULFILMENT_LABELS[o.fulfilmentStatus],
        payment: PAYMENT_LABELS[o.paymentStatus],
        customerNotes: i === 0 ? safeText(o.customerNotes ?? "") : "",
        notes: i === 0 ? safeText(internalNotes) : "",
      });
      row.alignment = { vertical: "top" };
      row.getCell("customerNotes").alignment = { wrapText: true, vertical: "top" };
      row.getCell("notes").alignment = { wrapText: true, vertical: "top" };
      if (shaded) row.eachCell({ includeEmpty: true }, (c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SHADE } }));
    });
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  const lastDataRow = ws.rowCount;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, lastDataRow), column: ws.columnCount } };

  // Totals row. Real formulas over real numbers, so they stay right if the baker filters or edits.
  if (lastDataRow > 1) {
    ws.addRow([]);
    const totals = ws.addRow({ ref: "Totals", qty: { formula: `SUBTOTAL(9,H2:H${lastDataRow})` }, line: { formula: `SUBTOTAL(9,J2:J${lastDataRow})` }, total: { formula: `SUBTOTAL(9,K2:K${lastDataRow})` } });
    totals.font = { bold: true };
    totals.getCell("qty").numFmt = "0";
    totals.getCell("line").numFmt = GBP;
    totals.getCell("total").numFmt = GBP;
  }

  // ---- Sheet 2: what to bake for each date --------------------------------------------
  const bake = wb.addWorksheet("Baking summary", { views: [{ state: "frozen", ySplit: 1 }] });
  bake.columns = [
    { header: "Collection date", key: "date", width: 18, style: { numFmt: "ddd dd/mm/yyyy" } },
    { header: "Product", key: "product", width: 32 },
    { header: "Variant", key: "variant", width: 10 },
    { header: "Quantity", key: "qty", width: 10 },
  ];
  const summary = new Map<string, { date: string; product: string; variant: string; qty: number }>();
  for (const o of orders) {
    if (o.fulfilmentStatus === "CANCELLED") continue;
    for (const l of o.lines) {
      const k = `${o.collectionDate}|${l.productName}|${l.variantLabel}`;
      const e = summary.get(k) ?? { date: o.collectionDate, product: l.productName, variant: l.variantLabel, qty: 0 };
      e.qty += l.quantity;
      summary.set(k, e);
    }
  }
  for (const e of [...summary.values()].sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product) || a.variant.localeCompare(b.variant))) {
    bake.addRow({ date: dateOnly(e.date), product: safeText(e.product), variant: safeText(e.variant), qty: e.qty });
  }
  const bh = bake.getRow(1);
  bh.font = { bold: true, color: { argb: "FFFFFFFF" } };
  bh.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  bake.addRow([]);
  bake.addRow(["Cancelled orders are not included."]).font = { italic: true };

  // ---- Sheet 3: where this file came from ---------------------------------------------
  const info = wb.addWorksheet("Export info");
  info.columns = [{ width: 22 }, { width: 60 }];
  info.addRows([
    ["Business", meta.businessName],
    ["Exported at", londonWallClock(meta.exportedAt.toISOString())],
    ["Exported by", safeText(meta.exportedBy)],
    ["Filters", safeText(meta.filtersDescription)],
    ["Orders", orders.length],
    ["Order lines", orders.reduce((n, o) => n + o.lines.length, 0)],
    [],
    ["Note", "This is a copy. The ordering system is the source of truth, and changes made here do not flow back."],
    ["Privacy", "This file contains customers' personal details. Keep it on a password-protected device and delete it when no longer needed."],
  ]);
  info.getCell("B2").numFmt = "dd/mm/yyyy hh:mm";
  info.getColumn(1).font = { bold: true };
  info.getCell("B8").alignment = { wrapText: true };
  info.getCell("B9").alignment = { wrapText: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
