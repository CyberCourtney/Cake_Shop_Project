import { useEffect, useRef, useState } from "react";
import {
  customerSchema,
  fieldErrors,
  formatCollectionDate,
  formatPence,
  formatPenceFixed,
  LIMITS,
  orderTotal,
  type CatalogueResponse,
} from "@kvc/shared";
import { ApiError, placeOrder } from "../api";
import { priceBasket, useBasket } from "../basket";
import { linkHandler, navigate } from "../router";
import { load, save } from "../storage";
import { Stepper } from "./Home";
import { BAKER_NAME } from "../brand";

interface Details {
  name: string;
  email: string;
  phone: string;
  collectionDate: string;
  customerNotes: string;
  website: string; // honeypot
}

const EMPTY: Details = { name: "", email: "", phone: "", collectionDate: "", customerNotes: "", website: "" };

export function OrderPage({ catalogue }: { catalogue: CatalogueResponse | null }) {
  const basket = useBasket();
  const lines = priceBasket(basket.lines, catalogue);
  const total = orderTotal(lines);
  const [details, setDetails] = useState<Details>(() => ({ ...EMPTY, ...load<Partial<Details>>("kvc.details", {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"details" | "review">("details");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Details are remembered for this tab only (not the honeypot).
  useEffect(() => save("kvc.details", { ...details, website: "" }), [details]);
  useEffect(() => headingRef.current?.focus(), [step]);

  if (!catalogue) return <section className="container pad-y" aria-busy="true"><div className="card skeleton tall" /></section>;

  const season = catalogue.season;
  if (!season.acceptingOrders) {
    return (
      <section className="container narrow pad-y center">
        <h1 className="display">Online ordering is closed</h1>
        <p>{season.closedReason === "deadline-passed" ? "The ordering deadline for this season has passed." : "Ordering isn't open at the moment."} Please call {catalogue.business.phone} if you have a question.</p>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="container narrow pad-y center">
        <h1 className="display">Your order is empty</h1>
        <p>Choose a cake or two to get started.</p>
        <a className="btn" href="/#cakes" onClick={linkHandler("/")}>See the cakes</a>
      </section>
    );
  }

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDetails((d) => ({ ...d, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" })); // clear as soon as they start fixing it
  };

  const validateField = (k: "name" | "email" | "phone") => {
    const r = customerSchema.shape[k].safeParse(details[k]);
    setErrors((x) => ({ ...x, [k]: r.success ? "" : (r.error.issues[0]?.message ?? "") }));
  };

  const validateAll = (): boolean => {
    const r = customerSchema.safeParse({ name: details.name, email: details.email, phone: details.phone });
    const errs: Record<string, string> = r.success ? {} : Object.fromEntries(Object.entries(fieldErrors(r.error)));
    if (!details.collectionDate || !catalogue.collectionDates.some((d) => d.date === details.collectionDate && !d.full)) {
      errs.collectionDate = "Please choose a collection date.";
    }
    if (details.customerNotes.length > LIMITS.notesMax) errs.customerNotes = `Please keep notes under ${LIMITS.notesMax} characters.`;
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) document.getElementById(`f-${first}`)?.focus();
    return !first;
  };

  const toReview = (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!validateAll()) return;
    // One key per checkout: a double-click or a retry can never create two orders.
    if (!load<string | null>("kvc.idempotencyKey", null)) save("kvc.idempotencyKey", crypto.randomUUID());
    setStep("review");
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    setSubmitting(true);
    setProblem(null);
    let key = load<string | null>("kvc.idempotencyKey", null);
    if (!key) {
      key = crypto.randomUUID();
      save("kvc.idempotencyKey", key);
    }
    try {
      const result = await placeOrder({
        idempotencyKey: key,
        lines: lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
        customer: { name: details.name, email: details.email, phone: details.phone },
        collectionDate: details.collectionDate,
        customerNotes: details.customerNotes,
        website: details.website || undefined,
        clientTotalPence: total,
      });
      save("kvc.lastOrder", { ...result, customerName: details.name.trim() });
      save("kvc.idempotencyKey", null);
      save("kvc.details", null);
      basket.clear();
      navigate("/order/confirmation");
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, "ERROR", "Something went wrong. Please try again.");
      if (e.code === "VALIDATION" && e.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fields)) mapped[k.replace(/^customer\./, "")] = v;
        setErrors(mapped);
        setStep("details");
      } else if (e.code === "DATE_FULL" || e.code === "DATE_UNAVAILABLE") {
        // A new date means a new order attempt.
        save("kvc.idempotencyKey", null);
        setErrors({ collectionDate: e.message });
        setDetails((d) => ({ ...d, collectionDate: "" }));
        setStep("details");
      } else {
        // Network problems keep the same key, so pressing the button again is always safe.
        if (e.code !== "NETWORK" && e.status !== 500) save("kvc.idempotencyKey", null);
        setProblem(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container pad-y order-layout">
      <div className="order-main">
        <ol className="progress" aria-label="Order progress">
          <li className={step === "details" ? "current" : "done"} aria-current={step === "details" ? "step" : undefined}>Your details</li>
          <li className={step === "review" ? "current" : ""} aria-current={step === "review" ? "step" : undefined}>Check and place order</li>
        </ol>

        {step === "details" ? (
          <form onSubmit={toReview} noValidate>
            <h1 ref={headingRef} tabIndex={-1} className="display h-page">Your details</h1>
            <p className="muted">No account needed. We'll only use these details for your order.</p>

            <Field id="name" label="Full name" error={errors.name}>
              <input id="f-name" autoComplete="name" value={details.name} onChange={set("name")} onBlur={() => details.name && validateField("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "e-name" : undefined} maxLength={LIMITS.nameMax} />
            </Field>
            <Field id="email" label="Email address" error={errors.email}>
              <input id="f-email" type="email" inputMode="email" autoComplete="email" value={details.email} onChange={set("email")} onBlur={() => details.email && validateField("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "e-email" : undefined} />
            </Field>
            <Field id="phone" label="Telephone" hint={`A UK number, so ${BAKER_NAME} can call you about your order.`} error={errors.phone}>
              <input id="f-phone" type="tel" inputMode="tel" autoComplete="tel" value={details.phone} onChange={set("phone")} onBlur={() => details.phone && validateField("phone")} aria-invalid={!!errors.phone} aria-describedby={`h-phone${errors.phone ? " e-phone" : ""}`} />
            </Field>

            <fieldset className="field" aria-describedby={errors.collectionDate ? "e-collectionDate" : undefined}>
              <legend className="label">Preferred collection date</legend>
              {catalogue.collectionDates.length === 0 ? (
                <p>There are no collection dates available right now. Please call {catalogue.business.phone}.</p>
              ) : (
                <div className="date-grid" id="f-collectionDate" tabIndex={-1}>
                  {catalogue.collectionDates.map((d) => (
                    <label key={d.date} className={`date-option ${details.collectionDate === d.date ? "on" : ""} ${d.full ? "full" : ""}`}>
                      <input type="radio" name="collectionDate" value={d.date} checked={details.collectionDate === d.date} disabled={d.full} onChange={set("collectionDate")} />
                      <span className="date-main">{formatCollectionDate(d.date)}</span>
                      <span className="date-sub">{d.full ? "Fully booked" : d.collectionWindow}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.collectionDate && <p className="error" id="e-collectionDate">{errors.collectionDate}</p>}
            </fieldset>

            <Field id="customerNotes" label="Notes (optional)" hint={`For example, a message for an iced cake, or anything ${BAKER_NAME} should know.`} error={errors.customerNotes}>
              <textarea id="f-customerNotes" rows={3} value={details.customerNotes} onChange={set("customerNotes")} maxLength={LIMITS.notesMax} aria-describedby="h-customerNotes" />
            </Field>

            {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="f-website">Website</label>
              <input id="f-website" tabIndex={-1} autoComplete="off" value={details.website} onChange={set("website")} />
            </div>

            <button className="btn btn-lg" type="submit">Check my order</button>
          </form>
        ) : (
          <div>
            <h1 ref={headingRef} tabIndex={-1} className="display h-page">Check and place your order</h1>
            <dl className="review">
              <div><dt>Name</dt><dd>{details.name}</dd></div>
              <div><dt>Email</dt><dd>{details.email}</dd></div>
              <div><dt>Telephone</dt><dd>{details.phone}</dd></div>
              <div><dt>Collection</dt><dd>{formatCollectionDate(details.collectionDate, { year: true })}</dd></div>
              {details.customerNotes && <div><dt>Notes</dt><dd className="pre">{details.customerNotes}</dd></div>}
            </dl>
            <button className="btn-link" onClick={() => setStep("details")}>Change these details</button>

            <div className="pay-panel">
              <h2>Payment is made in person</h2>
              <p>You don't pay anything now. {catalogue.business.paymentInfo}</p>
              <p>Placing your order sends it to {BAKER_NAME}. It is <strong>received, not yet confirmed</strong>: {BAKER_NAME} will check it and be in touch.</p>
            </div>

            {problem && <p className="alert" role="alert">{problem}</p>}
            <button className="btn btn-lg" onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? "Placing your order…" : `Place order · ${formatPenceFixed(total)}`}
            </button>
          </div>
        )}
      </div>

      <aside className="card summary" aria-labelledby="sum-h">
        <h2 id="sum-h">Your order</h2>
        <ul className="summary-lines">
          {lines.map((l) => (
            <li key={`${l.productId}/${l.variantId}`}>
              <div className="sl-top">
                <span>{l.productName}<br /><span className="muted small">{l.variantLabel} · {formatPence(l.unitPricePence)} each</span></span>
                <strong>{formatPenceFixed(l.lineTotalPence)}</strong>
              </div>
              {step === "details" && (
                <div className="sl-actions">
                  <Stepper label={`Quantity of ${l.productName}, ${l.variantLabel}`} value={l.quantity} min={1} max={l.maxQuantity} onChange={(n) => basket.setQuantity(l.productId, l.variantId, n)} />
                  <button className="btn-link" onClick={() => basket.setQuantity(l.productId, l.variantId, 0)}>Remove</button>
                </div>
              )}
              {step === "review" && <span className="muted small">Quantity {l.quantity}</span>}
            </li>
          ))}
        </ul>
        <p className="summary-total"><span>Total to pay on collection</span><strong>{formatPenceFixed(total)}</strong></p>
        {step === "details" && <a className="btn-link" href="/#cakes" onClick={linkHandler("/")}>Add more cakes</a>}
      </aside>
    </section>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label className="label" htmlFor={`f-${id}`}>{label}</label>
      {hint && <p className="hint" id={`h-${id}`}>{hint}</p>}
      {children}
      {error && <p className="error" id={`e-${id}`}>{error}</p>}
    </div>
  );
}
