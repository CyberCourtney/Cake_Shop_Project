import { forceRefresh, getAccessToken, signIn } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) await signIn();
  return { authorization: `Bearer ${token}` };
}

async function send(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(await authHeader()), ...(init.headers ?? {}) } });
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't reach the server. Check the internet connection and try again.");
  }
  if (res.status === 401 && !retried) {
    forceRefresh();
    return send(path, init, true);
  }
  if (res.status === 401) await signIn();
  return res;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "ERROR", body.message ?? "Something went wrong.", body.fields);
  return body as T;
}

/** Downloads the Excel export. The token goes in a header, never in the URL. */
export async function downloadExport(query: URLSearchParams): Promise<void> {
  const res = await send(`/api/admin/exports/orders.xlsx?${query}`, { headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "ERROR", body.message ?? "The export failed.");
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "orders.xlsx";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
