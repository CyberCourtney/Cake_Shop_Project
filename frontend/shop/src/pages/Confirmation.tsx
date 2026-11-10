import { formatCollectionDate, formatPence, formatPenceFixed, type CatalogueResponse, type CreateOrderResponse } from "@kvc/shared";
import { linkHandler } from "../router";
import { load } from "../storage";
import { BAKER_NAME } from "../brand";

export function Confirmation({ catalogue }: { catalogue: CatalogueResponse | null }) {
  const order = load<(CreateOrderResponse & { customerName: string }) | null>("kvc.lastOrder", null);
  if (!order) {
    return (
      <section className="container narrow pad-y center">
        <h1 className="display">No recent order</h1>
        <p>If you've placed an order, your reference is in the confirmation{catalogue ? ` or call ${catalogue.business.phone}` : ""}.</p>
        <a className="btn" href="/" onClick={linkHandler("/")}>Back to the cakes</a>
      </section>
    );
  }
  const b = catalogue?.business;
  return (
    <section className="container narrow pad-y">
      <div className="card confirm">
        <p className="eyebrow">Thank you, {order.customerName.split(" ")[0]}</p>
        <h1 className="display">We've received your order</h1>
        <p className="ref-label">Your order reference</p>
        <p className="ref" aria-label={`Order reference ${order.orderRef.split("").join(" ")}`}>{order.orderRef}</p>
        <p className="received-note">
          Your order is <strong>received, not yet confirmed</strong>. {BAKER_NAME} will check it and get in touch to confirm. Please quote your reference if you contact us.
        </p>
        {!order.customerEmailEnabled && (
          <p className="alert soft">Please write down or screenshot your reference. Confirmation emails aren't switched on yet on this preview site.</p>
        )}

        <h2 className="h-sub">Requested collection</h2>
        <p>{formatCollectionDate(order.collectionDate, { year: true })}</p>
        {b && <p className="muted">{b.collectionAddressSummary}</p>}

        <h2 className="h-sub">Your cakes</h2>
        <ul className="summary-lines">
          {order.lines.map((l) => (
            <li key={`${l.productId}/${l.variantId}`} className="sl-top">
              <span>{l.quantity} × {l.productName} ({l.variantLabel})<br /><span className="muted small">{formatPence(l.unitPricePence)} each</span></span>
              <strong>{formatPenceFixed(l.lineTotalPence)}</strong>
            </li>
          ))}
        </ul>
        <p className="summary-total"><span>Total</span><strong>{formatPenceFixed(order.totalPence)}</strong></p>

        <div className="pay-panel">
          <h2>Payment is made in person</h2>
          <p>Nothing has been charged. {b?.paymentInfo}</p>
        </div>
        {b && <p>Questions? Call {b.phone} or email {b.email}.</p>}
        <a className="btn-link" href="/" onClick={linkHandler("/")}>Back to the shop</a>
      </div>
    </section>
  );
}
