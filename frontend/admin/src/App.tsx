import { useEffect, useState } from "react";
import { currentUserEmail, getAccessToken, handleCallback, LOCAL_DEV, signIn, signOut } from "./auth";
import { link, navigate, useLocation } from "./router";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { OrderDetail } from "./pages/OrderDetail";
import { Products } from "./pages/Products";
import { Settings } from "./pages/Settings";
import { BUSINESS_NAME } from "./brand";

type AuthState = "checking" | "signed-in" | { error: string };

export function App() {
  const [auth, setAuth] = useState<AuthState>("checking");

  useEffect(() => {
    (async () => {
      try {
        if (window.location.pathname.startsWith("/admin/callback")) {
          const back = await handleCallback();
          navigate(back, true);
          setAuth("signed-in");
          return;
        }
        if (await getAccessToken()) setAuth("signed-in");
        else await signIn();
      } catch (e) {
        setAuth({ error: (e as Error).message });
      }
    })();
  }, []);

  if (auth === "checking") return <p className="centre-msg">Signing you in…</p>;
  if (typeof auth === "object") {
    return (
      <div className="centre-msg">
        <h1>Couldn't sign in</h1>
        <p>{auth.error}</p>
        <button className="btn" onClick={() => signIn()}>Sign in again</button>
      </div>
    );
  }
  return <Shell />;
}

const NAV = [
  { to: "/admin/", label: "Dashboard", match: (p: string) => p === "/admin/" || p === "/admin" },
  { to: "/admin/orders", label: "Orders", match: (p: string) => p.startsWith("/admin/orders") },
  { to: "/admin/cakes", label: "Cakes & prices", match: (p: string) => p.startsWith("/admin/cakes") },
  { to: "/admin/settings", label: "Dates & settings", match: (p: string) => p.startsWith("/admin/settings") },
];

function Shell() {
  const { path, search } = useLocation();
  const orderMatch = /^\/admin\/orders\/([^/]+)$/.exec(path);
  let page;
  if (orderMatch) page = <OrderDetail orderRef={decodeURIComponent(orderMatch[1]!)} />;
  else if (path.startsWith("/admin/orders")) page = <Orders search={search} />;
  else if (path.startsWith("/admin/cakes")) page = <Products />;
  else if (path.startsWith("/admin/settings")) page = <Settings />;
  else page = <Dashboard />;

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-row">
          <a className="brand" {...link("/admin/")}>{BUSINESS_NAME} <span>Admin</span></a>
          <div className="who">
            {LOCAL_DEV && <span className="badge warn">Local test mode</span>}
            <span className="hide-sm">{currentUserEmail()}</span>
            <button className="btn-quiet" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
        <nav className="wrap tabs" aria-label="Admin sections">
          {NAV.map((n) => (
            <a key={n.to} {...link(n.to)} className={n.match(path) ? "tab on" : "tab"} aria-current={n.match(path) ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="wrap main">{page}</main>
    </>
  );
}
