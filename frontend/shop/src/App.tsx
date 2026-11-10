import { useEffect, useState } from "react";
import type { CatalogueResponse } from "@kvc/shared";
import { getCatalogue, ApiError } from "./api";
import { BasketProvider, useBasket } from "./basket";
import { linkHandler, usePath } from "./router";
import { Home } from "./pages/Home";
import { OrderPage } from "./pages/Order";
import { Confirmation } from "./pages/Confirmation";
import { BAKER_NAME, BUSINESS_NAME } from "./brand";

// The logo sets the first word of the name in script and the rest small.
const [BRAND_FIRST, ...BRAND_WORDS] = BUSINESS_NAME.split(" ");
const BRAND_REST = BRAND_WORDS.join(" ");

export function App() {
  return (
    <BasketProvider>
      <Shell />
    </BasketProvider>
  );
}

function Shell() {
  const path = usePath();
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    getCatalogue()
      .then(setCatalogue)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "We couldn't load the cakes."));
  };
  useEffect(load, []);

  let page;
  if (error) {
    page = (
      <section className="container narrow center pad-y">
        <h1 className="display">Sorry, the shop didn't load</h1>
        <p>{error}</p>
        <button className="btn" onClick={load}>Try again</button>
      </section>
    );
  } else if (path.startsWith("/order/confirmation")) page = <Confirmation catalogue={catalogue} />;
  else if (path.startsWith("/order")) page = <OrderPage catalogue={catalogue} />;
  else page = <Home catalogue={catalogue} />;

  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Header />
      <main id="main" tabIndex={-1}>{page}</main>
      <Footer catalogue={catalogue} />
    </>
  );
}

function Header() {
  const { count } = useBasket();
  return (
    <header className="site-header">
      <div className="container header-row">
        <a href="/" onClick={linkHandler("/")} className="brand" aria-label={`${BUSINESS_NAME}, home`}>
          <span className="brand-script">{BRAND_FIRST}</span> <span className="brand-small">{BRAND_REST}</span>
        </a>
        <nav aria-label="Main">
          <a href="/#cakes" className="nav-link hide-sm">Cakes</a>
          <a href="/#how" className="nav-link hide-sm">How it works</a>
          <a href="/order" onClick={linkHandler("/order")} className="basket-link">
            Your order <span className="count" aria-label={`${count} items`}>{count}</span>
          </a>
        </nav>
      </div>
      <div className="wave" aria-hidden="true" />
    </header>
  );
}

function Footer({ catalogue }: { catalogue: CatalogueResponse | null }) {
  const b = catalogue?.business;
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="brand-script footer-brand">{BUSINESS_NAME}</p>
          <p>Traditional Jamaican Christmas and New Year cakes, home made by {BAKER_NAME}.</p>
        </div>
        {b && (
          <div>
            <h2 className="footer-h">Get in touch</h2>
            <p>Phone: {b.phone}<br />Email: {b.email}</p>
          </div>
        )}
        <div>
          <h2 className="footer-h">Good to know</h2>
          <p>Payment is made in person when you collect. We never ask for card details online.</p>
        </div>
      </div>
      <p className="container preview-note">Preview site: details marked PLACEHOLDER are still being confirmed.</p>
    </footer>
  );
}
