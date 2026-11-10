// Small shared pieces for the admin pages.
import { useEffect, useState } from "react";
import { FULFILMENT_LABELS, PAYMENT_LABELS, type FulfilmentStatus, type PaymentStatus } from "@kvc/shared";
import { ApiError } from "./api";

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    fn()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : "Couldn't load this page."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, reload: () => setN((x) => x + 1), setData };
}

export function StatusBadge({ status }: { status: FulfilmentStatus }) {
  return <span className={`badge f-${status.toLowerCase()}`}>{FULFILMENT_LABELS[status]}</span>;
}
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge p-${status.toLowerCase()}`}>{PAYMENT_LABELS[status]}</span>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert" role="alert">
      <p>{message}</p>
      {onRetry && <button className="btn-quiet" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Loading() {
  return <div className="skeleton" aria-busy="true" aria-label="Loading" />;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
