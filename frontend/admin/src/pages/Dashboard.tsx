import { formatCollectionDate, formatPenceFixed, type BakingSummary } from "@kvc/shared";
import { api, downloadExport } from "../api";
import { link } from "../router";
import { ErrorBox, Loading, useLoad } from "../ui";

interface DashboardData {
  seasonId: string;
  tiles: {
    totalOrders: number; newOrders: number; confirmedOrders: number; upcomingCollections: number;
    awaitingPayment: number; completedOrders: number; cancelledOrders: number;
    totalValuePence: number; outstandingPence: number; notificationProblems: number;
  };
  upcoming: Array<{ date: string; orders: number; items: Array<{ label: string; quantity: number }> }>;
  toBake: BakingSummary;
  internalRecipients: { confirmed: number; pending: number } | null;
}

function CakesToBake({ summary }: { summary: BakingSummary }) {
  const n = summary.totalCakes;
  return (
    <section className="bake-plan" aria-labelledby="bake-h">
      <div className="bake-plan-head">
        <div>
          <p className="eyebrow">Your baking plan at a glance</p>
          <h2 id="bake-h">Cakes to bake</h2>
        </div>
        <p className="bake-total">
          <span className="bake-total-n">{n}</span>
          <span>cake{n === 1 ? "" : "s"} in the baking queue</span>
        </p>
      </div>
      <p className="muted small">
        Every new and confirmed order, paid or not ({summary.orders} order{summary.orders === 1 ? "" : "s"}).
        Orders that are ready for collection, collected or cancelled are left out.
      </p>
      {summary.products.length === 0 ? (
        <p className="muted">Nothing to bake yet.</p>
      ) : (
        <div className="bake-cards">
          {summary.products.map((p) => (
            <article key={p.productId} className="card bake-card">
              <h3>{p.name}</h3>
              <p className="bake-card-n">{p.total}</p>
              <dl className="bake-split">
                {p.variants.map((v) => (
                  <div key={v.variantId}>
                    <dt>{v.label}</dt>
                    <dd>{v.quantity}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function Dashboard() {
  const { data, error, reload } = useLoad(() => api<DashboardData>("/api/admin/dashboard"));
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const t = data.tiles;
  const tiles: Array<[string, string | number, string?]> = [
    ["New orders", t.newOrders, "/admin/orders?status=NEW"],
    ["Confirmed", t.confirmedOrders, "/admin/orders?status=CONFIRMED"],
    ["Upcoming collections", t.upcomingCollections, "/admin/orders?upcoming=true"],
    ["Awaiting payment", t.awaitingPayment, "/admin/orders?payment=AWAITING_PAYMENT"],
    ["Completed (collected and paid)", t.completedOrders],
    ["Total orders", t.totalOrders, "/admin/orders"],
    ["Total order value", formatPenceFixed(t.totalValuePence)],
    ["Outstanding payments", formatPenceFixed(t.outstandingPence), "/admin/orders?payment=AWAITING_PAYMENT"],
  ];
  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">Season {data.seasonId}. Cancelled orders ({t.cancelledOrders}) are not counted.</p>
      </div>

      {t.notificationProblems > 0 && (
        <div className="alert">
          <p><strong>{t.notificationProblems} order(s) had an email problem.</strong> The orders are safe; only the email failed.</p>
          <a className="btn-quiet" {...link("/admin/orders?notifyFailed=true")}>See which orders</a>
        </div>
      )}
      {data.internalRecipients && data.internalRecipients.pending > 0 && (
        <div className="alert soft">
          <p>New-order emails: {data.internalRecipients.confirmed} of {data.internalRecipients.confirmed + data.internalRecipients.pending} people have confirmed. Ask the others to click "Confirm subscription" in the email from AWS.</p>
        </div>
      )}

      <CakesToBake summary={data.toBake} />

      <section className="tiles" aria-label="Summary">
        {tiles.map(([label, value, to]) => {
          const inner = (<><span className="tile-value">{value}</span><span className="tile-label">{label}</span></>);
          return to ? <a key={label} className="tile" {...link(to)}>{inner}</a> : <div key={label} className="tile">{inner}</div>;
        })}
      </section>

      <section aria-labelledby="up-h">
        <h2 id="up-h">Upcoming collections</h2>
        {data.upcoming.length === 0 ? (
          <p className="muted">No upcoming collections yet.</p>
        ) : (
          <div className="up-list">
            {data.upcoming.map((d) => (
              <article key={d.date} className="card up">
                <div className="up-head">
                  <h3>{formatCollectionDate(d.date)}</h3>
                  <span className="muted">{d.orders} order{d.orders === 1 ? "" : "s"}</span>
                </div>
                <ul className="bake">
                  {d.items.map((i) => <li key={i.label}><strong>{i.quantity} ×</strong> {i.label}</li>)}
                </ul>
                <div className="row-actions">
                  <a className="btn-quiet" {...link(`/admin/orders?collectionDate=${d.date}`)}>View orders</a>
                  <button className="btn-quiet" onClick={() => downloadExport(new URLSearchParams({ collectionDate: d.date }))}>Download Excel</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
