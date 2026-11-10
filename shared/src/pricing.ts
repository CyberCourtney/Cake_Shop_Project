// Money is always integer pence. Floating-point pounds are only ever produced for display.

export function formatPence(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}£${pounds.toLocaleString("en-GB")}${rest === 0 ? "" : "." + String(rest).padStart(2, "0")}`;
}

/** Always shows pence, e.g. £25.00. Used where columns of prices line up. */
export function formatPenceFixed(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}£${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parses a price typed in pounds ("25", "25.5", "£25.50") into pence. Returns null if invalid. */
export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, "").replace(/,/g, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export interface PricedLine {
  quantity: number;
  unitPricePence: number;
}

export function lineTotal(line: PricedLine): number {
  return line.quantity * line.unitPricePence;
}

export function orderTotal(lines: readonly PricedLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}
