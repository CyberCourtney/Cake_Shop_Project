import { useState } from "react";
import { formatPenceFixed, parsePoundsToPence, type Product } from "@kvc/shared";
import { api, ApiError } from "../api";
import { ErrorBox, Loading, useLoad } from "../ui";

export function Products() {
  const { data, error, reload } = useLoad(() => api<{ products: Product[] }>("/api/admin/products"));
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="page-head">
        <h1>Cakes &amp; prices</h1>
        <p className="muted">Changes show on the shop within about a minute. Orders already placed keep the price they were placed at.</p>
      </div>
      {data.products.map((p) => <ProductForm key={p.productId + p.version} product={p} />)}
    </>
  );
}

function ProductForm({ product }: { product: Product }) {
  const [p, setP] = useState(product);
  const [prices, setPrices] = useState(product.variants.map((v) => formatPenceFixed(v.pricePence).replace("£", "")));
  const [allergens, setAllergens] = useState(product.allergens.join(", "));
  const [state, setState] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const id = product.productId;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const pence = prices.map((x) => parsePoundsToPence(x));
    if (pence.some((x) => x === null)) {
      setState({ kind: "err", text: "Please enter prices in pounds, for example 35 or 35.50." });
      return;
    }
    setSaving(true);
    setState(null);
    try {
      const res = await api<{ product: Product }>(`/api/admin/products/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          version: p.version,
          name: p.name,
          description: p.description,
          tagline: p.tagline ?? "",
          enabled: p.enabled,
          sortOrder: p.sortOrder,
          maxQuantityPerOrder: p.maxQuantityPerOrder,
          variants: p.variants.map((v, i) => ({ ...v, pricePence: pence[i] })),
          allergens: allergens.split(",").map((a) => a.trim()).filter(Boolean),
        }),
      });
      setP(res.product);
      setState({ kind: "ok", text: "Saved." });
    } catch (err) {
      setState({ kind: "err", text: err instanceof ApiError ? err.message : "That didn't save." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card pad product-form" onSubmit={save} aria-labelledby={`h-${id}`}>
      <div className="split">
        <h2 id={`h-${id}`}>{p.name}</h2>
        <label className="switch">
          <input type="checkbox" checked={p.enabled} onChange={(e) => setP({ ...p, enabled: e.target.checked })} />
          <span>{p.enabled ? "On sale" : "Hidden from the shop"}</span>
        </label>
      </div>
      <div className="grid2">
        <div className="f"><label htmlFor={`n-${id}`}>Name</label><input id={`n-${id}`} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
        <div className="f"><label htmlFor={`t-${id}`}>Short line under the name</label><input id={`t-${id}`} value={p.tagline ?? ""} onChange={(e) => setP({ ...p, tagline: e.target.value })} /></div>
      </div>
      <div className="f"><label htmlFor={`d-${id}`}>Description</label><textarea id={`d-${id}`} rows={3} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></div>

      <fieldset className="prices">
        <legend>Prices</legend>
        {p.variants.map((v, i) => (
          <div key={v.variantId} className="price-row">
            <label htmlFor={`pr-${id}-${v.variantId}`} className="price-label">{v.label}</label>
            <span className="pound">£</span>
            <input id={`pr-${id}-${v.variantId}`} inputMode="decimal" className="price-input" value={prices[i]} onChange={(e) => setPrices(prices.map((x, j) => (j === i ? e.target.value : x)))} />
            <label className="check">
              <input type="checkbox" checked={v.enabled} onChange={(e) => setP({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) })} />
              Available
            </label>
          </div>
        ))}
      </fieldset>

      <div className="grid2">
        <div className="f"><label htmlFor={`a-${id}`}>Allergens (separate with commas)</label><input id={`a-${id}`} value={allergens} onChange={(e) => setAllergens(e.target.value)} /></div>
        <div className="f"><label htmlFor={`m-${id}`}>Most one customer can order online</label><input id={`m-${id}`} type="number" min={1} max={20} value={p.maxQuantityPerOrder} onChange={(e) => setP({ ...p, maxQuantityPerOrder: Number(e.target.value) })} /></div>
      </div>
      <div className="save-row">
        <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        {state && <span className={state.kind === "ok" ? "ok-text" : "danger-text"} role="status">{state.text}</span>}
      </div>
    </form>
  );
}
