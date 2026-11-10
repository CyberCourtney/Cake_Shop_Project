import { useState } from "react";
import { formatLondonDateTime, formatPence, type CatalogueResponse } from "@kvc/shared";
import { useBasket } from "../basket";
import { CakeIllustration } from "../illustrations";
import { linkHandler, navigate } from "../router";
import { BAKER_NAME } from "../brand";

type Product = CatalogueResponse["products"][number];

export function Home({ catalogue }: { catalogue: CatalogueResponse | null }) {
  const season = catalogue?.season;
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Home made by {BAKER_NAME}</p>
            <h1 className="display hero-title">Traditional Jamaican Christmas &amp; New Year cakes</h1>
            <p className="lede">Rich, dark fruit cakes made the way they've always been made. Order online, then collect and pay in person.</p>
            <div className="hero-actions">
              <a className="btn btn-lg" href="#cakes">Choose your cakes</a>
              <SeasonNote season={season} />
            </div>
          </div>
          <div className="arch arch-hero">
            <div className="snow" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
            <CakeIllustration kind="round-cake" iced />
          </div>
        </div>
      </section>

      <section id="cakes" className="container pad-y" aria-labelledby="cakes-h">
        <div className="section-head">
          <h2 id="cakes-h" className="display">This season's cakes</h2>
          {season?.label && <p className="muted">{season.label}</p>}
        </div>
        {!catalogue ? (
          <div className="product-grid" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}
          </div>
        ) : catalogue.products.length === 0 ? (
          <p>There are no cakes available to order right now. Please check back soon.</p>
        ) : (
          <div className="product-grid">
            {catalogue.products.map((p) => (
              <ProductCard key={p.productId} product={p} canOrder={catalogue.season.acceptingOrders} allergenNotice={catalogue.business.allergenNotice} />
            ))}
          </div>
        )}
      </section>

      <section id="how" className="band">
        <div className="container pad-y">
          <h2 className="display center">How ordering works</h2>
          <ol className="steps">
            <li><span className="step-n">1</span><h3>Choose your cakes</h3><p>Pick a size, iced or un-iced, and how many.</p></li>
            <li><span className="step-n">2</span><h3>Pick a collection date</h3><p>Tell us when you'd like to collect, and add any notes.</p></li>
            <li><span className="step-n">3</span><h3>{BAKER_NAME} confirms</h3><p>Your order is received straight away. {BAKER_NAME} checks it and gets in touch to confirm.</p></li>
            <li><span className="step-n">4</span><h3>Collect and pay</h3><p>Payment is made in person when you collect. No card details online.</p></li>
          </ol>
        </div>
      </section>
    </>
  );
}

function SeasonNote({ season }: { season: CatalogueResponse["season"] | undefined }) {
  if (!season) return null;
  if (season.acceptingOrders) {
    return <p className="season-note">Order by <strong>{formatLondonDateTime(season.orderingDeadline)}</strong></p>;
  }
  const text =
    season.closedReason === "not-open-yet"
      ? `Ordering opens ${formatLondonDateTime(season.orderingOpensAt)}`
      : season.closedReason === "deadline-passed"
        ? "Ordering for this season has closed. Thank you!"
        : "Online ordering is closed at the moment.";
  return <p className="season-note closed">{text}</p>;
}

function ProductCard({ product, canOrder, allergenNotice }: { product: Product; canOrder: boolean; allergenNotice: string }) {
  const { add } = useBasket();
  const [variantId, setVariantId] = useState(product.variants[product.variants.length - 1]!.variantId);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((v) => v.variantId === variantId) ?? product.variants[0]!;
  const groupName = `variant-${product.productId}`;

  return (
    <article className="card product" aria-labelledby={`p-${product.productId}`}>
      <div className="arch arch-card">
        <CakeIllustration kind={product.illustration ?? "round-cake"} iced={variant.variantId === "iced"} />
      </div>
      <div className="product-body">
        <h3 id={`p-${product.productId}`} className="product-name">{product.name}</h3>
        {product.tagline && <p className="tagline">{product.tagline}</p>}

        {product.variants.length > 1 ? (
          <fieldset className="variants">
            <legend className="sr-only">Choose iced or un-iced</legend>
            {product.variants.map((v) => (
              <label key={v.variantId} className={`chip ${v.variantId === variantId ? "on" : ""}`}>
                <input type="radio" name={groupName} value={v.variantId} checked={v.variantId === variantId} onChange={() => setVariantId(v.variantId)} />
                <span>{v.label}</span> <span className="chip-price">{formatPence(v.pricePence)}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="single-price"><span>{variant.label}</span> <strong>{formatPence(variant.pricePence)}</strong></p>
        )}

        <details className="accordion">
          <summary>Description</summary>
          <p>{product.description}</p>
        </details>
        <details className="accordion">
          <summary>Allergens</summary>
          <p>{product.allergens.join(", ")}</p>
          <p className="small muted">{allergenNotice}</p>
        </details>

        {canOrder && (
          <div className="add-row">
            <Stepper label={`Quantity of ${product.name}`} value={qty} min={1} max={product.maxQuantityPerOrder} onChange={setQty} />
            <button
              className="btn"
              onClick={() => {
                add(product.productId, variant.variantId, qty);
                setAdded(true);
                setQty(1);
              }}
            >
              Add to order
            </button>
          </div>
        )}
        <p className="added" role="status">
          {added && (
            <>
              Added. <a href="/order" onClick={linkHandler("/order")}>Review your order</a>
            </>
          )}
        </p>
      </div>
    </article>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="One fewer" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="One more" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </div>
  );
}

export { navigate };
