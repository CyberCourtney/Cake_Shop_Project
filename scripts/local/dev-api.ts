// A local stand-in for API Gateway, for trying the apps without AWS:
//   npm run dev:db     (terminal 1: DynamoDB Local, seeded)
//   npm run dev:api    (terminal 2: this server on http://localhost:3001)
//   npm run dev:shop   (terminal 3: the shop on http://localhost:5173, proxies /api here)
//   npm run dev:admin  (the admin portal on http://localhost:5174/admin/)
// It calls the real Lambda handlers. Admin routes are treated as signed in, because there
// is no Cognito locally. Never expose this server to a network.
import { createServer } from "node:http";

process.env.TABLE_NAME ??= "kvc-local-main";
process.env.DYNAMODB_ENDPOINT ??= "http://localhost:8000";
process.env.AWS_ACCESS_KEY_ID = "local"; // never real credentials locally
process.env.AWS_SECRET_ACCESS_KEY = "local";
delete process.env.AWS_SESSION_TOKEN;
process.env.AWS_REGION ??= "eu-west-2";
process.env.ORIGIN_VERIFY_SECRET = "local-origin-secret-local-origin-secret";
process.env.BUSINESS_NAME ??= "Example Cake Co";
process.env.BAKER_NAME ??= "Sam";

const [catalogue, createOrder, adminApi, adminExport] = await Promise.all([
  import("../../backend/functions/public-catalogue/handler"),
  import("../../backend/functions/public-create-order/handler"),
  import("../../backend/functions/admin-api/handler"),
  import("../../backend/functions/admin-export/handler"),
]);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
  const method = req.method ?? "GET";
  const path = url.pathname;

  let fn: (e: never) => Promise<{ statusCode?: number; headers?: Record<string, unknown>; body?: string; isBase64Encoded?: boolean }>;
  if (method === "GET" && path === "/api/catalogue") fn = catalogue.handler as never;
  else if (method === "POST" && path === "/api/orders") fn = createOrder.handler as never;
  else if (path.startsWith("/api/admin/exports/")) fn = adminExport.handler as never;
  else if (path.startsWith("/api/admin/")) fn = adminApi.handler as never;
  else {
    res.writeHead(404).end();
    return;
  }

  const event = {
    rawPath: path,
    routeKey: `${method} ${path}`,
    body,
    isBase64Encoded: false,
    headers: { ...Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])), "x-origin-verify": process.env.ORIGIN_VERIFY_SECRET },
    queryStringParameters: Object.fromEntries(url.searchParams),
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { "cognito:groups": "[admins]", username: "local-admin" } } } },
  };
  const out = await fn(event as never);
  res.writeHead(out.statusCode ?? 200, out.headers as Record<string, string>);
  res.end(out.body ? (out.isBase64Encoded ? Buffer.from(out.body, "base64") : out.body) : undefined);
}).listen(3001, () => console.log("Local API on http://localhost:3001"));
