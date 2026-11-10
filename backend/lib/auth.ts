import { HttpError, type Event } from "./http";

/**
 * API Gateway's JWT authorizer has already checked the token's signature, expiry, issuer
 * and audience before this code runs. This adds the second check: the user must be in the
 * Cognito "admins" group. HTTP APIs pass array claims as a string like "[admins other]".
 */
export function requireAdmin(event: Event): { username: string } {
  const ctx = event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
  const claims = ctx.authorizer?.jwt?.claims ?? {};
  const raw = claims["cognito:groups"];
  const groups = Array.isArray(raw)
    ? raw.map(String)
    : String(raw ?? "")
        .replace(/^\[|\]$/g, "")
        .split(/[\s,]+/)
        .filter(Boolean);
  const required = process.env.ADMIN_GROUP || "admins";
  if (!groups.includes(required)) throw new HttpError(403, "FORBIDDEN", "Your account is not an administrator.");
  return { username: String(claims.username ?? claims.sub ?? "admin") };
}
