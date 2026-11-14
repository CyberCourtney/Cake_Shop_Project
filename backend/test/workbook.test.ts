import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { Order } from "@kvc/shared";
import { buildOrdersWorkbook, safeText } from "../functions/admin-export/workbook";

const order = (ref: string, over: Partial<Order> = {}): Order => ({
  orderRef: ref,
  submittedAt: "2026-11-20T18:42:10Z",
  seasonId: "2026",
  customer: { name: "Jane Brown", email: "jane@example.com", phone: "07700 900123" },
  lines: [
    { productId: "cake-8in", productName: "8-inch cake", variantId: "iced", variantLabel: "Iced", quantity: 1, unitPricePence: 5000, lineTotalPence: 5000 },
    { productId: "rose-mini", productName: "Rose mini", variantId: "uniced", variantLabel: "Un-iced", quantity: 3, unitPricePence: 1000, lineTotalPence: 3000 },
  ],
  totalPence: 8000,
  collectionDate: "2026-12-23",
  customerNotes: "",
  fulfilmentStatus: "NEW",
  paymentStatus: "AWAITING_PAYMENT",
  internalNotes: [],
  version: 1,
  updatedAt: "2026-11-20T18:42:10Z",
  ...over,
});

async function open(orders: Order[]) {
  const buf = await buildOrdersWorkbook(orders, { businessName: "Example Cake Co", exportedBy: "admin", exportedAt: new Date("2026-12-01T10:00:00Z"), filtersDescription: "test" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}

describe("Excel export", () => {
  it("has the three sheets and the brief's columns in order", async () => {
    const wb = await open([order("KV-AAAAAA")]);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Orders", "Baking summary", "Export info"]);
    const header = (wb.getWorksheet("Orders")!.getRow(1).values as string[]).slice(1);
    expect(header).toEqual([
      "Order reference", "Date received", "Customer name", "Customer email", "Customer telephone", "Product", "Variant",
      "Quantity", "Unit price", "Line total", "Order total", "Collection date", "Fulfilment status", "Payment status", "Customer notes", "Internal notes",
    ]);
  });

  it("writes one row per line, real numbers and dates, and the order total on the first row only", async () => {
    const ws = (await open([order("KV-AAAAAA")])).getWorksheet("Orders")!;
    const r2 = ws.getRow(2);
    const r3 = ws.getRow(3);
    expect(r2.getCell(8).value).toBe(1);
    expect(r2.getCell(9).value).toBe(50);
    expect(r2.getCell(9).numFmt).toContain("£");
    expect(r2.getCell(11).value).toBe(80);
    expect(r3.getCell(11).value).toBeNull();
    expect(r2.getCell(12).value).toBeInstanceOf(Date);
    expect(r2.getCell(5).value).toBe("07700 900123"); // text keeps the leading zero
    expect(r2.getCell(13).value).toBe("New");
    expect(r2.getCell(14).value).toBe("Awaiting payment");
    expect(ws.getCell("A5").value).toBe("Totals");
  });

  it("stops formula injection", async () => {
    expect(safeText("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeText("+44")).toBe("'+44");
    expect(safeText("Jane")).toBe("Jane");
    const ws = (await open([order("KV-BBBBBB", { customer: { name: "=1+1", email: "a@b.co", phone: "07700 900123" }, customerNotes: "@SUM(A1)" })])).getWorksheet("Orders")!;
    expect(ws.getRow(2).getCell(3).value).toBe("'=1+1");
    expect(ws.getRow(2).getCell(15).value).toBe("'@SUM(A1)");
  });

  it("leaves cancelled orders out of the baking summary", async () => {
    const wb = await open([order("KV-AAAAAA"), order("KV-CCCCCC", { fulfilmentStatus: "CANCELLED" })]);
    const bake = wb.getWorksheet("Baking summary")!;
    expect(bake.getRow(2).getCell(4).value).toBe(1);
    expect(bake.getRow(3).getCell(4).value).toBe(3);
  });
});
