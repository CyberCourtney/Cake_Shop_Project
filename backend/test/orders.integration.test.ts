// Runs the real handlers against DynamoDB Local. Skipped unless DYNAMODB_ENDPOINT is set:
//   npm run dev:db    (in another terminal)
//   DYNAMODB_ENDPOINT=http://localhost:8000 npm test -w backend
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const endpoint = process.env.DYNAMODB_ENDPOINT;
const run = endpoint ? describe : describe.skip;
const table = `kvc-test-${Date.now()}`;
const SECRET = "test-origin-secret-test-origin-secret";

function event(method: string, path: string, body?: unknown, admin = false) {
  return {
    rawPath: path, routeKey: `${method} ${path}`, body: body === undefined ? undefined : JSON.stringify(body), isBase64Encoded: false,
    headers: { "x-origin-verify": SECRET }, queryStringParameters: {},
    requestContext: { http: { method, path }, ...(admin ? { authorizer: { jwt: { claims: { "cognito:groups": "[admins]", username: "tester" } } } } : {}) },
  } as never;
}

run("orders against DynamoDB Local", () => {
  let createOrder: typeof import("../functions/public-create-order/handler").handler;
  let adminApi: typeof import("../functions/admin-api/handler").handler;
  let catalogue: typeof import("../functions/public-catalogue/handler").handler;

  beforeAll(async () => {
    Object.assign(process.env, { TABLE_NAME: table, ORIGIN_VERIFY_SECRET: SECRET, AWS_ACCESS_KEY_ID: "local", AWS_SECRET_ACCESS_KEY: "local", AWS_REGION: "eu-west-2" });
    const { createTable } = await import("../../scripts/local/table.mjs");
    await createTable(endpoint!, table);
    execFileSync("node", ["../scripts/seed-catalogue.mjs", "--table", table, "--endpoint", endpoint!], { env: process.env });
    ({ handler: createOrder } = await import("../functions/public-create-order/handler"));
    ({ handler: adminApi } = await import("../functions/admin-api/handler"));
    ({ handler: catalogue } = await import("../functions/public-catalogue/handler"));
  });

  const body = (key: string, email = "jane@example.com") => ({
    idempotencyKey: key, collectionDate: "2026-12-23", customer: { name: "Jane Brown", email, phone: "07700 900123" },
    lines: [{ productId: "cake-8in", variantId: "iced", quantity: 1 }, { productId: "cake-8in", variantId: "iced", quantity: 1 }],
  });

  it("refuses requests that did not come through CloudFront", async () => {
    const e = event("GET", "/api/catalogue") as { headers: Record<string, string> };
    e.headers = {};
    expect((await catalogue(e as never)).statusCode).toBe(403);
  });

  it("prices on the server, merges lines and returns the same order for a repeated submit", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const first = await createOrder(event("POST", "/api/orders", { ...body(key), clientTotalPence: 1 }));
    expect(first.statusCode).toBe(201);
    const a = JSON.parse(first.body!);
    expect(a.totalPence).toBe(10000);
    expect(a.lines).toHaveLength(1);
    const again = await createOrder(event("POST", "/api/orders", body(key)));
    expect(again.statusCode).toBe(200);
    expect(JSON.parse(again.body!).orderRef).toBe(a.orderRef);
  });

  it("limits orders per email per day", async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) {
      const r = await createOrder(event("POST", "/api/orders", body(`22222222-2222-4222-8222-22222222222${i}`, "limit@example.com")));
      codes.push(r.statusCode);
    }
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it("enforces collection-date capacity and frees a place on cancel", async () => {
    await adminApi(event("PUT", "/api/admin/dates/2026-12-30", { enabled: true, collectionWindow: "10-4", capacityUnits: 1 }, true));
    const one = await createOrder(event("POST", "/api/orders", { ...body("33333333-3333-4333-8333-333333333331", "c1@example.com"), collectionDate: "2026-12-30" }));
    expect(one.statusCode).toBe(201);
    const two = await createOrder(event("POST", "/api/orders", { ...body("33333333-3333-4333-8333-333333333332", "c2@example.com"), collectionDate: "2026-12-30" }));
    expect(two.statusCode).toBe(409);
    const ref = JSON.parse(one.body!).orderRef;
    const cancelled = await adminApi(event("PATCH", `/api/admin/orders/${ref}`, { version: 1, fulfilmentStatus: "CANCELLED" }, true));
    expect(cancelled.statusCode).toBe(200);
    const three = await createOrder(event("POST", "/api/orders", { ...body("33333333-3333-4333-8333-333333333333", "c3@example.com"), collectionDate: "2026-12-30" }));
    expect(three.statusCode).toBe(201);
  });

  it("rejects unknown products and closed dates", async () => {
    const bad = await createOrder(event("POST", "/api/orders", { ...body("44444444-4444-4444-8444-444444444441", "d@example.com"), lines: [{ productId: "nope", variantId: "iced", quantity: 1 }] }));
    expect(bad.statusCode).toBe(409);
    const date = await createOrder(event("POST", "/api/orders", { ...body("44444444-4444-4444-8444-444444444442", "d@example.com"), collectionDate: "2026-12-25" }));
    expect(date.statusCode).toBe(409);
  });

  it("checks versions and transitions on admin updates, and requires the admins group", async () => {
    const r = await createOrder(event("POST", "/api/orders", body("55555555-5555-4555-8555-555555555555", "e@example.com")));
    const ref = JSON.parse(r.body!).orderRef;
    expect((await adminApi(event("PATCH", `/api/admin/orders/${ref}`, { version: 1, fulfilmentStatus: "COLLECTED" }, true))).statusCode).toBe(400);
    expect((await adminApi(event("PATCH", `/api/admin/orders/${ref}`, { version: 1, paymentStatus: "PAID" }, true))).statusCode).toBe(200);
    expect((await adminApi(event("PATCH", `/api/admin/orders/${ref}`, { version: 1, fulfilmentStatus: "CONFIRMED" }, true))).statusCode).toBe(409);
    expect((await adminApi(event("GET", "/api/admin/dashboard"))).statusCode).toBe(403);
    const detail = JSON.parse((await adminApi(event("GET", `/api/admin/orders/${ref.toLowerCase()}`, undefined, true))).body!);
    expect(detail.order.paymentStatus).toBe("PAID");
    expect(detail.history.map((h: { type: string }) => h.type)).toEqual(["CREATED", "STATUS_CHANGED"]);
  });

  it("totals the cakes still to bake on the dashboard", async () => {
    type Row = { productId: string; total: number; variants: Array<{ variantId: string; quantity: number }> };
    const toBake = async () => JSON.parse((await adminApi(event("GET", "/api/admin/dashboard", undefined, true))).body!).toBake as { totalCakes: number; products: Row[] };
    const qty = (s: { products: Row[] }, p: string, v: string) => s.products.find((r) => r.productId === p)?.variants.find((x) => x.variantId === v)?.quantity ?? 0;
    const before = await toBake();
    const r = await createOrder(event("POST", "/api/orders", {
      ...body("66666666-6666-4666-8666-666666666666", "bake@example.com"),
      lines: [{ productId: "rose-mini", variantId: "uniced", quantity: 3 }, { productId: "cake-6in", variantId: "iced", quantity: 1 }],
    }));
    expect(r.statusCode).toBe(201);
    const after = await toBake();
    expect(after.totalCakes - before.totalCakes).toBe(4);
    expect(qty(after, "rose-mini", "uniced") - qty(before, "rose-mini", "uniced")).toBe(3);
    expect(qty(after, "cake-6in", "iced") - qty(before, "cake-6in", "iced")).toBe(1);
    expect(after.products.map((p) => p.productId)).toEqual(["cake-6in", "cake-8in", "rose-mini"]);

    const ref = JSON.parse(r.body!).orderRef;
    await adminApi(event("PATCH", `/api/admin/orders/${ref}`, { version: 1, fulfilmentStatus: "CANCELLED" }, true));
    expect((await toBake()).totalCakes).toBe(before.totalCakes);
  });
});
