import { useState } from "react";
import {
  allowedFulfilmentTransitions,
  allowedPaymentTransitions,
  formatCollectionDate,
  formatPenceFixed,
  FULFILMENT_LABELS,
  PAYMENT_LABELS,
  type FulfilmentStatus,
  type Order,
  type OrderEvent,
  type PaymentStatus,
} from "@kvc/shared";
import { api, ApiError } from "../api";
import { link } from "../router";
import { ErrorBox, formatDateTime, Loading, PaymentBadge, StatusBadge, useLoad } from "../ui";

type Detail = { order: Order; history: OrderEvent[] };

const ACTION_LABELS: Partial<Record<FulfilmentStatus | PaymentStatus, string>> = {
  CONFIRMED: "Confirm order",
  READY_FOR_COLLECTION: "Mark ready for collection",
  COLLECTED: "Mark collected",
  CANCELLED: "Cancel order",
  PAID: "Mark paid",
  REFUNDED: "Mark refunded",
};

type Pending = { field: "fulfilmentStatus" | "paymentStatus"; to: string } | null;

export function OrderDetail({ orderRef }: { orderRef: string }) {
  const { data, error, reload, setData } = useLoad(() => api<Detail>(`/api/admin/orders/${encodeURIComponent(orderRef)}`), [orderRef]);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [eraseText, setEraseText] = useState("");

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const o = data.order;

  const patch = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api<Detail>(`/api/admin/orders/${o.orderRef}`, { method: "PATCH", body: JSON.stringify({ version: o.version, ...body }) });
      setData(updated);
      setMessage({ kind: "ok", text: okText });
      return true;
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof ApiError ? e.message : "That didn't save. Please try again." });
      if (e instanceof ApiError && e.code === "CONFLICT") reload();
      return false;
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const post = async (path: string, body: unknown, okText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/orders/${o.orderRef}/${path}`, { method: "POST", body: JSON.stringify(body) });
      setMessage({ kind: "ok", text: okText });
      reload();
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof ApiError ? e.message : "That didn't work. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const fulfilmentNext = allowedFulfilmentTransitions(o.fulfilmentStatus);
  const paymentNext = allowedPaymentTransitions(o.paymentStatus);
  const actions = [
    ...fulfilmentNext.filter((s) => s !== "CANCELLED").map((to) => ({ field: "fulfilmentStatus" as const, to })),
    ...paymentNext.map((to) => ({ field: "paymentStatus" as const, to })),
  ];
  const canCancel = fulfilmentNext.includes("CANCELLED");
  const erased = o.customer.name === "[erased]";
  const questions: Record<string, string> = {
    CONFIRMED: `Confirm order ${o.orderRef}?`,
    READY_FOR_COLLECTION: `Mark ${o.orderRef} as ready for collection?`,
    COLLECTED: `Mark ${o.orderRef} as collected?`,
    CANCELLED: `Cancel order ${o.orderRef}? This can't be undone, and it frees the place on the collection date.`,
    PAID: `Mark ${o.orderRef} as paid?`,
    REFUNDED: `Mark ${o.orderRef} as refunded?`,
  };
  const confirmText = pending ? questions[pending.to] : "";

  return (
    <>
      <a className="back" {...link("/admin/orders")}>← All orders</a>
      <div className="page-head split">
        <div>
          <h1 className="mono">{o.orderRef}</h1>
          <p className="badges-row"><StatusBadge status={o.fulfilmentStatus} /> <PaymentBadge status={o.paymentStatus} /></p>
        </div>
        <p className="muted">Received {formatDateTime(o.submittedAt)}</p>
      </div>

      {message && <p className={message.kind === "ok" ? "notice" : "alert"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</p>}

      <section className="card pad actions" aria-label="Actions">
        {pending ? (
          <div className="confirm-row">
            <p><strong>{confirmText}</strong></p>
            <button className={`btn ${pending.to === "CANCELLED" ? "danger" : ""}`} disabled={busy} onClick={() => patch({ [pending.field]: pending.to }, `Done: ${pending.field === "paymentStatus" ? PAYMENT_LABELS[pending.to as PaymentStatus] : FULFILMENT_LABELS[pending.to as FulfilmentStatus]}.`)}>
              Yes, {ACTION_LABELS[pending.to as FulfilmentStatus]?.toLowerCase()}
            </button>
            <button className="btn-quiet" onClick={() => setPending(null)}>Go back</button>
          </div>
        ) : actions.length === 0 && !canCancel ? (
          <p className="muted">This order is finished. There is nothing more to do.</p>
        ) : (
          <div className="action-buttons">
            {actions.map((a) => (
              <button key={a.field + a.to} className={a.to === "REFUNDED" ? "btn-quiet" : "btn big"} onClick={() => setPending(a)}>{ACTION_LABELS[a.to]}</button>
            ))}
            {canCancel && <button className="btn-quiet danger-text" onClick={() => setPending({ field: "fulfilmentStatus", to: "CANCELLED" })}>Cancel order</button>}
          </div>
        )}
      </section>

      <div className="detail-grid">
        <section className="card pad">
          <h2>Customer</h2>
          <p className="big-text">{o.customer.name}</p>
          {!erased && (
            <p>
              <a href={`tel:${o.customer.phone.replace(/\s/g, "")}`}>{o.customer.phone}</a><br />
              <a href={`mailto:${o.customer.email}?subject=${encodeURIComponent(`Your cake order ${o.orderRef}`)}`}>{o.customer.email}</a>
            </p>
          )}
          <h2>Collection</h2>
          <p className="big-text">{formatCollectionDate(o.collectionDate, { year: true })}</p>
          <h2>Customer's notes</h2>
          <p className="pre">{o.customerNotes || <span className="muted">None</span>}</p>
        </section>

        <section className="card pad">
          <h2>Cakes</h2>
          <table className="lines">
            <thead><tr><th scope="col">Cake</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Each</th><th scope="col" className="num">Total</th></tr></thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.productId + l.variantId}><td>{l.productName}<br /><span className="muted small">{l.variantLabel}</span></td><td className="num">{l.quantity}</td><td className="num">{formatPenceFixed(l.unitPricePence)}</td><td className="num">{formatPenceFixed(l.lineTotalPence)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row" colSpan={3}>Order total</th><td className="num"><strong>{formatPenceFixed(o.totalPence)}</strong></td></tr></tfoot>
          </table>
        </section>
      </div>

      <div className="detail-grid">
        <section className="card pad">
          <h2>Internal notes</h2>
          <p className="small muted">Only you can see these. Customers never do.</p>
          {(o.internalNotes ?? []).length === 0 ? <p className="muted">No notes yet.</p> : (
            <ul className="notes">{o.internalNotes.map((n, i) => <li key={i}><span className="muted small">{formatDateTime(n.at)}</span><p className="pre">{n.text}</p></li>)}</ul>
          )}
          <form onSubmit={async (e) => { e.preventDefault(); if (note.trim() && (await patch({ note: note.trim() }, "Note added."))) setNote(""); }}>
            <label htmlFor="note" className="label">Add a note</label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            <button className="btn-quiet" disabled={busy || !note.trim()}>Save note</button>
          </form>
        </section>

        <section className="card pad">
          <h2>Emails</h2>
          <NotificationLine label="New-order email to the family" state={o.notifications?.internalAlert} />
          <NotificationLine label="Acknowledgement to the customer" state={o.notifications?.customerAck} />
          {Object.entries(o.notifications?.statusEmails ?? {}).map(([status, state]) => (
            <NotificationLine key={status} label={`"${FULFILMENT_LABELS[status as keyof typeof FULFILMENT_LABELS] ?? status}" email to the customer`} state={state} />
          ))}
          {o.notificationProblem && <button className="btn-quiet" disabled={busy} onClick={() => post("resend", {}, "Sending again. Check back in a minute.")}>Send failed emails again</button>}

          <h2>History</h2>
          <ul className="history">
            {data.history.map((h, i) => (
              <li key={i}><span className="muted small">{formatDateTime(h.at)}</span> {describe(h)}</li>
            ))}
          </ul>
        </section>
      </div>

      {!erased && (
        <details className="card pad privacy">
          <summary>Erase this customer's details (data protection request)</summary>
          <p>This replaces the name, email, phone and notes with "[erased]". The reference, cakes and totals are kept for the accounts. It can't be undone.</p>
          <label htmlFor="erase" className="label">Type {o.orderRef} to confirm</label>
          <div className="inline">
            <input id="erase" value={eraseText} onChange={(e) => setEraseText(e.target.value.toUpperCase())} autoComplete="off" />
            <button className="btn danger" disabled={busy || eraseText !== o.orderRef} onClick={() => post("erase", { confirm: o.orderRef }, "Customer details erased.")}>Erase details</button>
          </div>
        </details>
      )}
    </>
  );
}

function NotificationLine({ label, state }: { label: string; state?: Order["notifications"] extends infer N ? N extends { internalAlert?: infer S } ? S : never : never }) {
  let text = "Waiting to be sent";
  let cls = "muted";
  if (state?.status === "SENT") { text = `Sent ${formatDateTime(state.at)}`; cls = "ok-text"; }
  else if (state?.status === "FAILED") { text = `Failed (${state.error}, ${state.attempts} attempt${state.attempts === 1 ? "" : "s"})`; cls = "danger-text"; }
  else if (state?.status === "SKIPPED") { text = `Not sent: ${state.reason}`; }
  return <p><strong>{label}:</strong> <span className={cls}>{text}</span></p>;
}

function describe(h: OrderEvent): string {
  switch (h.type) {
    case "CREATED": return "Order placed by the customer";
    case "NOTE_ADDED": return "Note added";
    case "RESEND_REQUESTED": return "Emails sent again";
    case "ERASED": return "Customer details erased";
    case "STATUS_CHANGED": {
      const labels = h.field === "paymentStatus" ? PAYMENT_LABELS : FULFILMENT_LABELS;
      return `${h.field === "paymentStatus" ? "Payment" : "Status"} changed from ${labels[h.from as never] ?? h.from} to ${labels[h.to as never] ?? h.to}`;
    }
  }
}
