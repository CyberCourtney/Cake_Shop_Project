# The application (Phase 3)

This explains how the code is organised and why, so the decisions can be followed and
changed later. The architecture it implements is in [architecture.md](architecture.md) and
[data-model.md](data-model.md).

## 1. Layout

| Folder | What it is |
|---|---|
| `shared/` | TypeScript used by the browser **and** the Lambdas: validation (Zod), pence arithmetic, statuses and allowed transitions, order references, date helpers, and the shared types. |
| `backend/functions/<name>/handler.ts` | One folder per Lambda. `build.mjs` bundles each into `backend/dist/<name>/index.mjs` with esbuild. |
| `backend/lib/` | Helpers: the DynamoDB client and key layout, HTTP responses and the origin check, the admin group check, order queries, and a logger that masks personal data. |
| `frontend/shop/` | The customer site (React + Vite), served at `/`. |
| `frontend/admin/` | The admin portal (React + Vite), served at `/admin/`. |
| `scripts/seed-catalogue.mjs` | Loads the starting cakes, prices, season and dates. Only adds what is missing. |
| `scripts/local/` | DynamoDB Local and a local API server, for trying everything without AWS. |

It is one npm workspace, so one `npm ci` installs everything and one lockfile pins it.

## 2. Key decisions

**One validation schema for browser and server.** `shared/src/schemas.ts` is used by the
order form (to show friendly messages as you type) and by `public-create-order` (as the
authority). The server never trusts the browser's copy: it re-validates and re-prices.

**The server sets the price.** The browser sends product, variant and quantity only. The
Lambda reads current prices, recalculates, and stores a copy of each unit price on the order,
so later price changes never alter an existing order or an export.

**One transaction per order.** `public-create-order` writes the order, its idempotency key,
the collection-date counter, the per-email daily counter and a history entry in a single
`TransactWriteItems`. Either all of it happens or none of it does. Each condition maps to a
plain-English message: a repeated submit returns the first order, a full date returns
"that date has just filled up", and so on.

**Capacity counts orders, not cakes.** A collection date can have a "most orders" limit. It
counts orders because that can be checked atomically in DynamoDB without arithmetic in the
condition. Cancelling an order gives its place back. If the baker prefers to limit by number of
cakes, that is a small change (open question Q6).

**Write first, notify second.** No API function sends email. The notifier Lambda reads new
orders from the table's stream, publishes the internal alert to SNS, sends the customer email
(once enabled), and records each result on the order. It always re-reads the order before
sending, so a retry never sends a notification that already went out.

**Customer email is off for now.** Until there is a domain, the notifier records the customer
acknowledgement as "not sent", and the confirmation page tells the customer to note their
reference. The SES code path exists but **has not been tested**; that is Phase 4.

**Admin sign-in uses Cognito's own page (Authorization Code + PKCE).** The portal never sees
the password or MFA code. Tokens are held in memory only. API Gateway checks the token before
any Lambda runs, and the Lambda also checks the `admins` group.

**Two checks against direct API calls.** CloudFront adds a secret `X-Origin-Verify` header,
and every Lambda refuses requests without it. That keeps CloudFront's caching and headers in
front of the API.

**Optimistic locking for admin edits.** Every order, product and settings item has a
`version`. A save includes the version it started from; if someone else saved in between,
the second save gets "this was changed somewhere else, please reload" instead of silently
overwriting.

**No routing or state libraries.** Each app has a handful of pages, so a 20-line router and
React state are enough. Fewer dependencies means fewer updates and a smaller attack surface.

**Illustrations, not photos.** The placeholder photos supplied are of unknown licence, so the
shop uses drawn illustrations until the baker's own photos exist (Q21).

**AWS SDK left out of the Lambda bundles.** The `nodejs24.x` runtime already includes AWS SDK
v3, so bundling it would only make the zips bigger. The same SDK version is used in tests.

## 3. What is placeholder

Everything marked `PLACEHOLDER` in the seed data: the business phone and email, collection
address wording, payment wording, allergen information, product descriptions, collection
times, and the 2026 ordering deadline. All of them are edited in the admin portal (Dates &
settings, and Cakes & prices). The seed never overwrites an edit.

## 4. Running it locally

Needs Node 22+ and Java (for DynamoDB Local). Download DynamoDB Local from AWS and unpack it.

```bash
npm ci
DYNAMODB_LOCAL_DIR=~/dynamodb-local npm run dev:db   # terminal 1: database, seeded
npm run dev:api                                      # terminal 2: the Lambda handlers
npm run dev:shop                                     # http://localhost:5173
npm run dev:admin                                    # http://localhost:5174/admin/ (sign-in skipped)
```

Tests:

```bash
npm test                                             # unit tests
DYNAMODB_ENDPOINT=http://localhost:8000 npm test     # plus integration tests on DynamoDB Local
```

CI runs both on every pull request, with DynamoDB Local as a service container.

## 5. Tested so far

Recorded honestly; see the PR for dates.

| What | How | Result |
|---|---|---|
| Unit tests: pricing, references, statuses, validation, Excel workbook | Vitest | Pass |
| Integration: server pricing, line merging, idempotent resubmit, per-email limit, date capacity and release on cancel, unknown products, closed dates, version conflicts, invalid transitions, admin group check | Vitest against DynamoDB Local | Pass |
| Shop journey: browse, add cakes, validation messages, details, review, place order, confirmation | Playwright, desktop and iPhone 13 sizes, local | Pass, no console errors |
| Admin journey: dashboard, filters, Excel download, confirm, mark paid, add a note, change a price, settings | Playwright, local test mode (no Cognito) | Pass |
| Cognito sign-in, SNS alert, everything on AWS | Not yet | Needs the dev deploy |
| Opening the export in real Excel | Not yet | Manual check |
