import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { timingSafeEqual } from "node:crypto";
import { log, errorInfo } from "./log";

export type Event = APIGatewayProxyEventV2;
export type Result = APIGatewayProxyStructuredResultV2;

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(statusCode: number, body: unknown, cacheSeconds = 0): Result {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
    },
    body: JSON.stringify(body),
  };
}

export function parseJsonBody(event: Event): unknown {
  if (!event.body) throw new HttpError(400, "BAD_REQUEST", "The request had no body.");
  if (event.body.length > 20_000) throw new HttpError(413, "TOO_LARGE", "The request was too large.");
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "The request was not valid JSON.");
  }
}

/**
 * CloudFront adds a secret X-Origin-Verify header to every request it forwards to the API.
 * Requests that go straight to the execute-api URL (skipping CloudFront's caching and
 * headers) do not have it, so they are refused. The comparison is constant-time.
 */
export function verifyOrigin(event: Event): void {
  const expected = process.env.ORIGIN_VERIFY_SECRET ?? "";
  const given = event.headers?.["x-origin-verify"] ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (expected.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(403, "FORBIDDEN", "Forbidden.");
  }
}

/** Wraps a handler: origin check, error mapping, and no stack traces in responses. */
export function httpHandler(fn: (event: Event) => Promise<Result>) {
  return async (event: Event): Promise<Result> => {
    try {
      verifyOrigin(event);
      return await fn(event);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.statusCode >= 500) log.error("request failed", { code: err.code, ...errorInfo(err) });
        return json(err.statusCode, { error: err.code, message: err.message, ...(err.details ?? {}) });
      }
      log.error("unhandled error", { route: event.routeKey, ...errorInfo(err) });
      return json(500, { error: "INTERNAL", message: "Something went wrong on our side. Please try again in a minute." });
    }
  };
}
