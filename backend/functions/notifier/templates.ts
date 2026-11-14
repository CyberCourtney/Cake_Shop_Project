// Message text for the two notification paths. Plain functions so they can be tested.
import { formatCollectionDate, formatPenceFixed, type BusinessInfo, type CustomerEmailStatus, type Order } from "@kvc/shared";

export function internalSubject(o: Order, resend: boolean): string {
  // SNS subjects must be ASCII, one line, at most 100 characters.
  const s = `${resend ? "(Resent) " : ""}New order ${o.orderRef} - ${formatCollectionDate(o.collectionDate, { short: true })} - ${formatPenceFixed(o.totalPence).replace("£", "GBP ")}`;
  return s.replace(/[^\x20-\x7E]/g, "").slice(0, 100);
}

export function internalMessage(o: Order, siteUrl: string): string {
  const lines = o.lines.map((l) => `  ${l.quantity} x ${l.productName} (${l.variantLabel}) @ ${formatPenceFixed(l.unitPricePence)} = ${formatPenceFixed(l.lineTotalPence)}`);
  return [
    "New order received",
    "",
    `Reference:       ${o.orderRef}`,
    `Collection date: ${formatCollectionDate(o.collectionDate, { year: true })}`,
    "",
    "Customer",
    `  Name:  ${o.customer.name}`,
    `  Email: ${o.customer.email}`,
    `  Phone: ${o.customer.phone}`,
    "",
    "Order",
    ...lines,
    `  Total: ${formatPenceFixed(o.totalPence)} (payment in person, not yet paid)`,
    "",
    o.customerNotes ? `Customer notes:\n  ${o.customerNotes.replace(/\n/g, "\n  ")}\n` : "Customer notes: none\n",
    "This order is NEW and has not been confirmed with the customer yet.",
    `Open it in the admin portal: ${siteUrl}/admin/orders/${o.orderRef}`,
  ].join("\n");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Customer acknowledgement. Says "received", never "accepted" (brief section 2). */
export function customerEmail(o: Order, b: BusinessInfo): { subject: string; text: string; html: string } {
  const subject = `We've received your order ${o.orderRef} - ${b.name}`;
  const dateText = formatCollectionDate(o.collectionDate, { year: true });
  const text = [
    `Dear ${o.customer.name},`,
    "",
    `Thank you for your order with ${b.name}. We have RECEIVED it. It is not confirmed yet: ${b.bakerName} will check it and be in touch to confirm.`,
    "",
    `Order reference: ${o.orderRef}`,
    `Requested collection date: ${dateText}`,
    "",
    ...o.lines.map((l) => `${l.quantity} x ${l.productName} (${l.variantLabel}) at ${formatPenceFixed(l.unitPricePence)} = ${formatPenceFixed(l.lineTotalPence)}`),
    `Total: ${formatPenceFixed(o.totalPence)}`,
    "",
    `Payment: ${b.paymentInfo}`,
    `Collection: ${b.collectionAddressSummary}`,
    "",
    `Questions? Email ${b.email}, quoting ${o.orderRef}.`,
    "",
    "Best wishes,",
    b.bakerName,
  ].join("\n");
  const rows = o.lines
    .map((l) => `<tr><td style="padding:6px 0">${l.quantity} &times; ${esc(l.productName)} (${esc(l.variantLabel)})</td><td style="padding:6px 0;text-align:right">${formatPenceFixed(l.lineTotalPence)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border-top:6px solid #9e1b22" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<p style="margin:0;font-size:26px;color:#9e1b22;font-family:Georgia,serif">${esc(b.name)}</p>
<h1 style="font-size:20px;margin:20px 0 8px">We've received your order</h1>
<p style="margin:0 0 16px">Dear ${esc(o.customer.name)}, thank you. Your order has been <strong>received but not yet confirmed</strong>. ${esc(b.bakerName)} will check it and be in touch to confirm.</p>
<p style="margin:0 0 4px"><strong>Order reference:</strong> ${o.orderRef}</p>
<p style="margin:0 0 16px"><strong>Requested collection:</strong> ${esc(dateText)}</p>
<table role="presentation" width="100%" style="border-top:1px solid #e6e7ea;border-bottom:1px solid #e6e7ea">${rows}
<tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatPenceFixed(o.totalPence)}</td></tr></table>
<p style="background:#f6ebd3;padding:12px;border-radius:8px;margin:16px 0"><strong>Payment is made in person.</strong> ${esc(b.paymentInfo)}</p>
<p style="margin:0 0 16px">${esc(b.collectionAddressSummary)}</p>
<p style="margin:0">Questions? Email ${esc(b.email)}, quoting ${o.orderRef}.</p>
<p style="margin:20px 0 0">Best wishes,<br><span style="font-family:Georgia,serif;font-size:20px;color:#c62828">${esc(b.bakerName)}</span></p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

const STATUS_COPY: Record<CustomerEmailStatus, { subject: string; heading: string; body: (date: string, baker: string) => string }> = {
  CONFIRMED: {
    subject: "Your order {ref} is confirmed",
    heading: "Your order is confirmed",
    body: (date, baker) => `Good news: ${baker} has confirmed your order. Please collect it on ${date}.`,
  },
  READY_FOR_COLLECTION: {
    subject: "Your order {ref} is ready to collect",
    heading: "Your order is ready to collect",
    body: (date) => `Your cakes are ready. Your collection date is ${date}.`,
  },
  CANCELLED: {
    subject: "Your order {ref} has been cancelled",
    heading: "Your order has been cancelled",
    body: () => "Your order has been cancelled. If you weren't expecting this, please get in touch.",
  },
};

/** Customer email when an admin moves the order to Confirmed, Ready for collection or Cancelled. */
export function statusEmail(o: Order, b: BusinessInfo, status: CustomerEmailStatus): { subject: string; text: string; html: string } {
  const copy = STATUS_COPY[status];
  const subject = `${copy.subject.replace("{ref}", o.orderRef)} - ${b.name}`;
  const dateText = formatCollectionDate(o.collectionDate, { year: true });
  const body = copy.body(dateText, b.bakerName);
  const cancelled = status === "CANCELLED";
  const lines = o.lines.map((l) => `${l.quantity} x ${l.productName} (${l.variantLabel})`);
  const text = [
    `Dear ${o.customer.name},`,
    "",
    body,
    "",
    `Order reference: ${o.orderRef}`,
    ...lines,
    `Total: ${formatPenceFixed(o.totalPence)}`,
    "",
    ...(cancelled ? [] : [`Payment: ${b.paymentInfo}`, `Collection: ${b.collectionAddressSummary}`, ""]),
    `Questions? Email ${b.email}, quoting ${o.orderRef}.`,
    "",
    "Best wishes,",
    b.bakerName,
  ].join("\n");
  const rows = o.lines.map((l) => `<li>${l.quantity} &times; ${esc(l.productName)} (${esc(l.variantLabel)})</li>`).join("");
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;background:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border-top:6px solid #9e1b22" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<p style="margin:0;font-size:26px;color:#9e1b22;font-family:Georgia,serif">${esc(b.name)}</p>
<h1 style="font-size:20px;margin:20px 0 8px">${copy.heading}</h1>
<p style="margin:0 0 16px">Dear ${esc(o.customer.name)}, ${esc(body)}</p>
<p style="margin:0 0 4px"><strong>Order reference:</strong> ${o.orderRef}</p>
<ul style="margin:8px 0 8px;padding-left:20px">${rows}</ul>
<p style="margin:0 0 16px"><strong>Total:</strong> ${formatPenceFixed(o.totalPence)}</p>
${cancelled ? "" : `<p style="background:#f6ebd3;padding:12px;border-radius:8px;margin:16px 0"><strong>Payment is made in person.</strong> ${esc(b.paymentInfo)}</p>\n<p style="margin:0 0 16px">${esc(b.collectionAddressSummary)}</p>`}
<p style="margin:0">Questions? Email ${esc(b.email)}, quoting ${o.orderRef}.</p>
<p style="margin:20px 0 0">Best wishes,<br><span style="font-family:Georgia,serif;font-size:20px;color:#c62828">${esc(b.bakerName)}</span></p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
