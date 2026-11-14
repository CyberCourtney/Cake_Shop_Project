# DynamoDB data model

> Phase 1 proposal. Nothing has been created yet.

## 1. Approach: one table, designed around access patterns

There is **one table**, `kvc-<env>-main`, with a generic partition key `pk` and sort
key `sk`, plus **one global secondary index**. Every entity type lives in this table and is
told apart by its key prefix.

Why one table rather than separate `Orders` and `Products` tables:

- One set of IAM, backup, PITR, alarms and CloudFormation resources to manage.
- An order and its history share a partition key, so **one Query** returns both.
- **Transactions** can atomically write an order, its idempotency key and the
  collection-date capacity counter. Transactions across tables are possible too, but
  everything is simpler when it is all in one place.

One trade-off to mention honestly: single-table design is less intuitive to browse in the
console than a table per entity. To compensate, the item types are documented below, and
every item has an `entityType` attribute.

**Money is always stored as integer pence** (`2500`, not `25.00`) to avoid rounding errors.
**Timestamps** are ISO 8601 in UTC. **Collection dates** are `YYYY-MM-DD` dates, interpreted
in Europe/London time.

## 2. Item types

| Entity | `pk` | `sk` | GSI1 `gsi1pk` / `gsi1sk` | TTL `expiresAt` |
|---|---|---|---|---|
| Product | `CATALOGUE` | `PRODUCT#<productId>` | none | none |
| Shop settings | `CONFIG` | `SETTINGS` | none | none |
| Season | `SEASON#<seasonId>` | `META` | none | none |
| Collection date | `SEASON#<seasonId>` | `DATE#<yyyy-mm-dd>` | none | none |
| Order | `ORDER#<orderRef>` | `META` | `SEASON#<seasonId>` / `<collectionDate>#<orderRef>` | set after the retention period (Q14) |
| Order history event | `ORDER#<orderRef>` | `EVENT#<timestamp>#<id>` | none | same as the order |
| Idempotency key | `IDEMP#<uuid>` | `META` | none | 24 hours |
| Rate-limit counter | `RATE#<sha256(email)>#<yyyy-mm-dd>` | `META` | none | 48 hours |

### Product
```json
{
  "pk": "CATALOGUE", "sk": "PRODUCT#cake-8in", "entityType": "Product",
  "name": "8-inch Jamaican Christmas cake",
  "description": "Rich, rum-soaked fruit cake …",
  "imageKey": "products/cake-8in.webp",
  "enabled": true,
  "sortOrder": 2,
  "maxQuantityPerOrder": 10,
  "variants": [
    { "variantId": "uniced", "label": "Un-iced", "pricePence": 4000, "enabled": true },
    { "variantId": "iced",   "label": "Iced",    "pricePence": 5000, "enabled": true }
  ],
  "allergens": ["eggs", "milk", "gluten", "sulphites"],
  "seasonIds": ["2026"],
  "version": 3, "updatedAt": "2026-11-01T09:00:00Z", "updatedBy": "admin"
}
```
All products share the `CATALOGUE` partition, so one Query returns the whole catalogue.
This is safe because the catalogue will never be more than a handful of items. Variants are
embedded because a product has two at most and they are always read together.
The rose mini cake simply has one variant (`uniced`, 1000).

The `allergens` field is my addition. See Q7, because allergen information is a legal
requirement for food sold at a distance.

### Shop settings
```json
{ "pk": "CONFIG", "sk": "SETTINGS", "entityType": "Settings",
  "activeSeasonId": "2026",
  "businessContact": { "email": "…", "phone": "…" },
  "collectionAddressSummary": "…",
  "maxOrdersPerEmailPerDay": 3,
  "version": 5 }
```

### Season and collection dates
```json
{ "pk": "SEASON#2026", "sk": "META", "entityType": "Season",
  "label": "Christmas & New Year 2026",
  "orderingOpensAt": "2026-11-10T00:00:00Z",
  "orderingDeadline": "2026-12-05T23:59:59Z",
  "isOpen": true }

{ "pk": "SEASON#2026", "sk": "DATE#2026-12-23", "entityType": "CollectionDate",
  "enabled": true, "label": "Tuesday 23 December",
  "collectionWindow": "10:00–16:00",
  "capacityUnits": 30, "bookedUnits": 12,
  "cutoffOverride": null }
```
- The ordering deadline is **data**, not code. Nothing about the flyer's "05.12.25" is
  hardcoded.
- `capacityUnits` and `bookedUnits` are optional. If `capacityUnits` is absent, the date is
  unlimited. Whether a "unit" is an order or a cake is a business decision (Q6).
- One season can span Christmas and New Year collection dates.

### Order
```json
{
  "pk": "ORDER#KV-7K3QXM", "sk": "META", "entityType": "Order",
  "gsi1pk": "SEASON#2026", "gsi1sk": "2026-12-23#KV-7K3QXM",
  "orderRef": "KV-7K3QXM",
  "submittedAt": "2026-11-20T18:42:10Z",
  "seasonId": "2026",
  "customer": { "name": "Jane Brown", "email": "jane@example.com", "phone": "+447700900123" },
  "customerNameLower": "jane brown",
  "lines": [
    { "productId": "cake-8in", "productName": "8-inch Jamaican Christmas cake",
      "variantId": "iced", "variantLabel": "Iced",
      "quantity": 1, "unitPricePence": 5000, "lineTotalPence": 5000 },
    { "productId": "rose-mini", "productName": "Rose-shaped mini cake",
      "variantId": "uniced", "variantLabel": "Un-iced",
      "quantity": 3, "unitPricePence": 1000, "lineTotalPence": 3000 }
  ],
  "totalPence": 8000,
  "collectionDate": "2026-12-23",
  "customerNotes": "Happy Christmas message on the iced one please",
  "fulfilmentStatus": "NEW",
  "paymentStatus": "AWAITING_PAYMENT",
  "internalNotes": [ { "at": "2026-11-21T09:00:00Z", "text": "Called to confirm" } ],
  "notifications": {
    "customerAck":   { "status": "SENT",    "at": "…", "sesMessageId": "…" },
    "internalAlert": { "status": "FAILED",  "at": "…", "error": "Throttling", "attempts": 3 }
  },
  "notificationProblem": true,
  "idempotencyKey": "6f1c…",
  "version": 4,
  "updatedAt": "2026-11-21T09:00:00Z",
  "expiresAt": null
}
```
- **Product name, variant label and unit price are copied** onto each line. That way, later
  catalogue edits never change a historical order or an export.
- The fulfilment statuses are `NEW`, `CONFIRMED`, `READY_FOR_COLLECTION`, `COLLECTED` and
  `CANCELLED`. The payment statuses are `AWAITING_PAYMENT`, `PAID` and `REFUNDED`. These are
  two independent attributes.
- `version` is incremented on every update. Admin writes use
  `ConditionExpression: version = :expected`. If the baker has the same order open in two tabs, the
  second save gets a friendly "this order changed, please reload" message, rather than
  silently overwriting the first.
- `notificationProblem` is a simple flag that the admin portal filters and the dashboard
  counts.
- **The customer's IP address is not stored on the order** (data minimisation). It appears
  only briefly in API access logs, which have short retention.

### Order history event
```json
{ "pk": "ORDER#KV-7K3QXM", "sk": "EVENT#2026-11-21T09:00:00Z#01JD…",
  "entityType": "OrderEvent",
  "type": "STATUS_CHANGED", "field": "paymentStatus",
  "from": "AWAITING_PAYMENT", "to": "PAID", "by": "admin" }
```
History entries are written in the same transaction as the status change. A Query on
`pk = ORDER#KV-7K3QXM` returns the order plus its full history in one request.

## 3. Access patterns

| # | Access pattern | How |
|---|---|---|
| 1 | Show the catalogue | Query `pk = CATALOGUE`. All the products are in one small partition, so one request returns the whole catalogue. CloudFront caches the result for 60 s. |
| 2 | Season settings and open dates | Query `pk = SEASON#<active>` (returns META and every DATE item) |
| 3 | Place an order | TransactWriteItems: Put ORDER (`attribute_not_exists(pk)`), Put IDEMP (`attribute_not_exists`), Update DATE (`bookedUnits + :n <= capacityUnits`), Update RATE (`count < :max`) |
| 4 | Detect a duplicate submission | GetItem `IDEMP#<key>`, then return the stored `orderRef` |
| 5 | Admin dashboard | Query GSI1 `gsi1pk = SEASON#<active>`. All the season's orders, typically under 1,000, are aggregated in Lambda. |
| 6 | Filter by collection date | Query GSI1 with `begins_with(gsi1sk, "2026-12-23")`, or `BETWEEN` for a range |
| 7 | Filter by status, payment or notification problem | Pattern 5 or 6, then filter in Lambda |
| 8 | Search by name or reference | A reference that looks like `KV-…` uses GetItem directly. A name does a substring match on `customerNameLower` over pattern 5. |
| 9 | Order detail and history | Query `pk = ORDER#<ref>` |
| 10 | Update status, payment or notes | TransactWriteItems: Update ORDER (version check) and Put EVENT |
| 11 | Excel export | Pattern 5 or 6, then filter, then build the workbook |
| 12 | Find a customer's data (UK GDPR request) | Patterns 5 and 8 across all seasons. This is rare and manual, so a full Query or Scan is acceptable. A GSI on a hashed email could be added if it becomes common. |
| 13 | Notifier processes a new order (and explicit resends) | A DynamoDB Stream event, filtered on `entityType = Order` and `eventName = INSERT`. A `MODIFY` is only delivered when the order carries a `pendingNotify` attribute, which admin-api sets to request a resend or a status email. The notifier removes it once done, so its own result writes never re-trigger it. |

**Why filtering in Lambda is acceptable here:** DynamoDB charges for the items *read*, not
the items returned. Reading 1,000 orders of about 2 KB each is about 250 read units with
eventual consistency, which costs about US$0.00004. Even if the baker refreshes the dashboard 500
times in December, that is about two pence. A secondary index per filter would add write
cost and complexity for no practical benefit. This should be revisited only if a single
season goes past roughly 10,000 orders.

## 4. Indexes, capacity and protection

- **GSI1** (`gsi1pk`, `gsi1sk`), with projection `ALL`. Only order items have these
  attributes, so the index is sparse and contains orders only.
- **On-demand** capacity mode.
- **Streams:** `NEW_AND_OLD_IMAGES`.
- **TTL attribute:** `expiresAt`, in epoch seconds.
- **PITR** is on, with 35-day restore. Deletion protection is on in prod.
- **Encryption:** the AWS-owned key.

## 5. Data retention in the model

- Idempotency keys and rate counters expire automatically (24 and 48 hours).
- When an order reaches `COLLECTED` or `CANCELLED`, `admin-api` sets
  `expiresAt = collectionDate + retention period`. I propose **18 months**, so last season
  is still visible when planning the next one. This is subject to Q14. DynamoDB TTL then
  deletes the order and its history at no cost, usually within a few days of expiry.
- Stream `REMOVE` events from TTL are ignored by the notifier.
- **Backups still hold deleted data for up to 35 days** (PITR). The privacy notice will say
  so.
- **Erasure on request:** `POST /admin/orders/{ref}/erase` replaces the name, email, phone
  and customer notes with `"[erased]"`. It keeps the reference, the lines and the totals,
  which are needed for the business's accounts. It also writes an `ERASED` history event.
