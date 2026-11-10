import type { CatalogueResponse, CreateOrderRequest, CreateOrderResponse } from "@kvc/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(0, "NETWORK", "We couldn't reach the shop. Please check your internet connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "ERROR", body.message ?? "Something went wrong. Please try again.", body.fields);
  }
  return body as T;
}

export const getCatalogue = () => request<CatalogueResponse>("/api/catalogue");

export const placeOrder = (order: CreateOrderRequest) =>
  request<CreateOrderResponse>("/api/orders", { method: "POST", body: JSON.stringify(order) });
