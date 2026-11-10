import { useState } from "react";
import { FULFILMENT_LABELS, FULFILMENT_STATUSES, PAYMENT_LABELS, PAYMENT_STATUSES, formatCollectionDate, formatPenceFixed, type CollectionDate, type Order } from "@kvc/shared";
import { api, downloadExport } from "../api";
import { link, navigate } from "../router";
import { ErrorBox, Loading, PaymentBadge, StatusBadge, useLoad } from "../ui";

const FILTER_KEYS = ["q", "collectionDate", "status", "payment", "notifyFailed", "upcoming"] as const;

export function Orders({ search }: { search: URLSearchParams }) {
  const query = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = search.get(k);
    if (v) query.set(k, v);
  }
  const qs = query.toString();
  const { data, error, reload } = useLoad(() => api<{ count: number; orders: Order[] }>(`/api/admin/orders?${qs}`), [qs]);
  const dates = useLoad(() => api<{ dates: CollectionDate[] }>("/api/admin/settings"));
  const [q, setQ] = useState(search.get("q") ?? "");
  const [exporting, setExporting] = useState<string | null>(null);

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(query);
    if (v) next.set(k, v);
    else next.delete(k);
    navigate(`/admin/orders${next.toString() ? "?" + next : ""}`, true);
  };

  const doExport = async () => {
    setExporting("Preparing your spreadsheet…");
    try {
      await downloadExport(query);
      setExporting(null);
    } catch (e) {
      setExporting((e as Error).message);
    }
  };

  return (
    <>
      <div className="page-head split">
        <div>
          <h1>Orders</h1>
          <p className="muted">{data ? `${data.count} order${data.count === 1 ? "" : "s"}${qs ? " match these filters" : " this season"}` : " "}</p>
        </div>
        <div className="export">
          <button className="btn" onClick={doExport} disabled={!!exporting && exporting.endsWith("…")}>Download Excel</button>
          <p className="small muted">{exporting ?? "Downloads the orders shown here. The spreadsheet is a copy; changes in it don't come back."}</p>
        </div>
      </div>

      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); setFilter("q", q.trim()); }}>
        <div className="f">
          <label htmlFor="q">Search name, email or reference</label>
          <div className="inline">
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Brown or KV-7K3QXM" />
            <button className="btn-quiet" type="submit">Search</button>
          </div>
        </div>
        <div className="f">
          <label htmlFor="date">Collection date</label>
          <select id="date" value={query.get("collectionDate") ?? ""} onChange={(e) => setFilter("collectionDate", e.target.value)}>
            <option value="">All dates</option>
            {(dates.data?.dates ?? []).map((d) => <option key={d.date} value={d.date}>{formatCollectionDate(d.date, { short: true })}</option>)}
          </select>
        </div>
        <div className="f">
          <label htmlFor="status">Order status</label>
          <select id="status" value={query.get("status") ?? ""} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">Any</option>
            {FULFILMENT_STATUSES.map((s) => <option key={s} value={s}>{FULFILMENT_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="f">
          <label htmlFor="payment">Payment</label>
          <select id="payment" value={query.get("payment") ?? ""} onChange={(e) => setFilter("payment", e.target.value)}>
            <option value="">Any</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_LABELS[s]}</option>)}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={query.get("notifyFailed") === "true"} onChange={(e) => setFilter("notifyFailed", e.target.checked ? "true" : "")} />
          Email problems only
        </label>
        {qs && <button type="button" className="btn-quiet" onClick={() => { setQ(""); navigate("/admin/orders", true); }}>Clear filters</button>}
      </form>

      {error ? <ErrorBox message={error} onRetry={reload} /> : !data ? <Loading /> : data.orders.length === 0 ? (
        <div className="empty">
          <p><strong>No orders {qs ? "match these filters" : "yet"}.</strong></p>
          {qs && <button className="btn-quiet" onClick={() => { setQ(""); navigate("/admin/orders", true); }}>Clear filters</button>}
        </div>
      ) : (
        <ul className="order-list">
          {data.orders.map((o) => (
            <li key={o.orderRef}>
              <a className="order-row" {...link(`/admin/orders/${o.orderRef}`)}>
                <span className="or-main">
                  <span className="or-ref">{o.orderRef}</span>
                  <span className="or-name">{o.customer.name}</span>
                  <span className="or-items muted">{o.lines.map((l) => `${l.quantity} × ${l.productName.replace(/ Jamaican Christmas cake/, "")} (${l.variantLabel})`).join(", ")}</span>
                </span>
                <span className="or-date">{formatCollectionDate(o.collectionDate, { short: true })}</span>
                <span className="or-total">{formatPenceFixed(o.totalPence)}</span>
                <span className="or-badges">
                  <StatusBadge status={o.fulfilmentStatus} />
                  <PaymentBadge status={o.paymentStatus} />
                  {o.notificationProblem && <span className="badge warn">Email problem</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
