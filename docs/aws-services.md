# AWS services: what each one does and why

> Phase 1 proposal. Prices are for **eu-west-2** in USD, excluding VAT. They come from the
> AWS Price List API, using files published between September and October 2026 and read
> on 4 November 2026. See [cost-estimates.md](cost-estimates.md) for monthly totals.

## Services in the design

### Amazon S3: static file storage
**What it does:** Holds the built React apps (HTML, JS, CSS, images) for the shop and the
admin portal. A second, separate bucket holds deployment artifacts: packaged Lambda zip files
and nested CloudFormation templates.

**Why:** Storage is the cheapest place to keep files that rarely change, at US$0.024 per
GB-month. The whole site will be a few megabytes.

**How it is configured:** Block Public Access is on, ownership is set to *BucketOwnerEnforced*,
SSE-S3 encryption is used, and versioning is enabled on the site bucket so a bad deployment
can be rolled back. The bucket policy allows reads **only** from this CloudFront
distribution, via Origin Access Control.

**What the brief said versus what I propose:** The brief mentions "S3 static website hosting".
That feature needs a *public* bucket and serves plain HTTP only. Using the bucket as a
private origin behind CloudFront is the current AWS-recommended pattern. It has the same cost
and better security.

### Amazon CloudFront: HTTPS delivery
**What it does:** Serves the site from edge locations, terminates TLS for the custom domain,
routes `/api/*` to API Gateway, adds security headers, and caches the public catalogue for
60 seconds.

**Why:** It provides HTTPS on a custom domain in front of S3, and it gives a single origin
for the site and the API, so CORS is not needed. Its always-free allowance is 1 TB of
transfer and 10 million requests a month, which is far above this site's needs.

**Configuration notes:** HTTP redirects to HTTPS, and the minimum protocol is TLSv1.2_2021.
A response-headers policy sets HSTS, a strict Content-Security-Policy, X-Content-Type-Options,
a frame-ancestors restriction and Referrer-Policy. A small CloudFront Function rewrites SPA
routes (for example `/admin/orders/KV-…`) to `index.html`. CloudFront Functions have an
always-free allowance of 2 million invocations a month.

### AWS Certificate Manager (ACM): TLS certificate
**What it does:** Issues and automatically renews the public certificate for the domain.

**Why:** Public certificates are free, and renewal is automatic.

**Important dependency:** A certificate used by CloudFront **must be in us-east-1**, even
though everything else is in London. That is why there is a separate small us-east-1 stack.
See [cloudformation-design.md](cloudformation-design.md).

### Amazon Route 53: DNS (needed only if we use a custom domain)
**What it does:** Hosts the DNS zone. It holds alias records pointing the domain at
CloudFront, the DNS validation records for ACM, and the email authentication records for SES
(DKIM, SPF, DMARC, custom MAIL FROM).

**Why:** Because the zone is in Route 53, CloudFormation can create **every** DNS record. A
fresh deployment then needs no manual DNS editing at a third-party registrar.

**Cost:** US$0.50 per hosted zone per month. This is the only fixed monthly charge in the
design. Queries to alias records that point at CloudFront are free.

**Alternative:** If the domain is already registered elsewhere, we can either point its
nameservers at Route 53 (my recommendation, because then everything is automated) or keep
DNS at the registrar and add records by hand. The second option saves US$6 a year but breaks
the "no undocumented manual steps" rule, so I do not recommend it.

### Amazon API Gateway (HTTP API): backend entry point
**What it does:** Receives `/api/*` requests, validates Cognito JWTs on admin routes,
throttles traffic and invokes Lambda.

**Why HTTP API rather than REST API:**

| | HTTP API | REST API |
|---|---|---|
| Price, eu-west-2 | US$1.16 per million | US$3.50 per million |
| Cognito JWT auth | Built-in JWT authorizer | Cognito authorizer |
| Throttling | Stage and route level | Stage, route, usage plans |
| WAF directly on the API | No (put it on CloudFront instead) | Yes |
| Request validation | In Lambda (Zod) | JSON Schema models |

The REST API's extras do not justify three times the price, or the extra configuration,
for this workload. Request validation will happen in code, using the same schema the
frontend uses, which is easier to test anyway.

**Protecting the origin:** To stop people calling the `execute-api` URL directly and getting
around CloudFront, CloudFront adds a secret header (`X-Origin-Verify`). The Lambdas reject
requests without it. The deploy script generates a new random value on each deployment and passes it as a
CloudFormation `NoEcho` parameter, so it rotates on every deploy and never goes into git.
This is a defence-in-depth measure, not authentication. Admin routes still require a
Cognito token.

### AWS Lambda: application logic
**What it does:** Runs five small functions, split by **permission boundary** so each IAM
role can only do its own job:

| Function | Trigger | Can access |
|---|---|---|
| `public-catalogue` | `GET /api/catalogue` | Read the `CATALOGUE`, `CONFIG` and `SEASON#…` partitions only |
| `public-create-order` | `POST /api/orders` | Read config and products. Conditionally write `ORDER#`, `IDEMP#`, `RATE#` and update date counters. |
| `admin-api` | `/api/admin/*` except export | Read and write orders, products and settings. List subscriptions on the SNS topic (read-only). |
| `admin-export` | `GET /api/admin/exports/…` | Read orders only |
| `notifier` | DynamoDB Stream (INSERT and specific MODIFY events) | Send email with SES from the verified identity only, publish to the one SNS topic, update notification fields, send to the DLQ |

**Runtime:** Node.js, using the current Lambda LTS runtime (to be confirmed in Phase 2), in
TypeScript, built with esbuild, running on **arm64 (Graviton)**. That is about 20 percent
cheaper per GB-second than x86 (US$0.0000133334 against US$0.0000166667 in eu-west-2), and
the code is identical.

**Why Node/TypeScript rather than Python:** The validation schema, the types and the price
calculation can be shared between the React frontend and the backend. One language is easier
to maintain. `exceljs` also produces well-formatted `.xlsx` files.

**Cost:** The always-free allowance of 1 million requests and 400,000 GB-seconds a month
covers this workload many times over.

**Why not one "monolith" Lambda:** It would mean fewer files, but then one IAM role would
need every permission. Five functions keep the blast radius small, and that also makes a
better portfolio example.

### Amazon DynamoDB: source of truth
**What it does:** One table holds products, settings, collection dates, orders, order
history, idempotency keys and rate-limit counters. See [data-model.md](data-model.md).

**Why:** It is serverless and charges per request. Its always-free 25 GB of storage is
roughly 10,000 times what this business will use. Conditional writes and transactions give
duplicate protection and capacity limits without needing a relational database.

**Configuration:**
- **On-demand capacity.** US$0.7423 per million writes and US$0.1487 per million reads. At
  this volume that is pennies, with no capacity planning and no throttling surprises.
  (Provisioned capacity at 25 WCU/RCU would be free, but it adds tuning and the risk of
  throttling on a busy evening. The saving would be a few pence a month.)
- **Point-in-time recovery** keeps 35 days of history at US$0.2377 per GB-month, which
  costs effectively nothing for a few MB.
- **Encryption at rest** with the AWS-owned key, which is free. A customer-managed KMS key
  would cost US$1 a month and add nothing for this threat model.
- **Deletion protection** on in prod, and `DeletionPolicy: Retain` in the template.
- **TTL** on the `expiresAt` attribute removes idempotency keys, rate counters and
  (after the agreed retention period) old orders, all at no cost.
- **Streams** set to `NEW_AND_OLD_IMAGES`. These feed the notifier.

### Amazon Cognito: admin authentication
**What it does:** A user pool with **self sign-up disabled**, one admin user in an `admins`
group, managed login (the hosted sign-in page), required MFA and a strong password policy.

**Why:** It is managed authentication that the HTTP API's JWT authorizer understands
natively. We never store passwords or write login code. It costs nothing for one user.

**Feature plan:** I propose **Essentials**, which is the default for new pools. It gives
the modern managed login page and passkey support, which are easier for the baker than typing
codes. The first 10,000 monthly active users are free. Lite would also work. "Plus"
(threat protection, at US$0.02 per MAU) is unnecessary for one known user.

**Creating the user:** CloudFormation `AWS::Cognito::UserPoolUser` creates the admin from a
parameter. Cognito emails a temporary password, and the baker sets her own password and MFA at
first sign-in. Nothing secret goes into the repository.

### Amazon SES: customer emails
**What it does:** Sends the branded acknowledgement (and, if approved, the "confirmed",
"ready" and "cancelled" updates) to customers.

**Why:** At US$0.10 per 1,000 emails it is the cheapest transactional email option. It also
stays inside AWS, so there are no third-party subscriptions and no extra API keys.

**Configuration (all CloudFormation):** A domain identity with Easy DKIM, a custom MAIL FROM
subdomain, SPF and DMARC records in Route 53, and a configuration set that sends bounce and
complaint events to CloudWatch.

**The one manual step:** Requesting **production access**, to leave the sandbox. AWS does
not expose this to CloudFormation. It is a short form, or the
`aws sesv2 put-account-details` command, and AWS reviews it. It will be documented.

### Amazon SNS: internal notifications
**What it does:** The topic `<BusinessName>OrderNotifications` fans out each new-order alert to
The baker and her son by email. A second topic, `<BusinessName>OpsAlerts`, carries technical alarms
(DLQ messages, Lambda errors, budget) to the operator.

**Why a separate ops topic:** the baker should not receive "Lambda throttled" emails. The operator
should not have customer phone numbers in technical alerts.

**Cost:** The first 1,000 email deliveries a month are free, then US$2.00 per 100,000.

### Amazon SQS: dead-letter queue (an addition, justified)
**What it does:** Holds the details of any order notification that still failed after
retries.

**Why it was added:** The brief asks to "consider retries and dead-letter queues where
justified". Without a DLQ, a failed stream record is dropped after its retries and the only
trace is a log line. With a DLQ there is a durable, alarmed record. SQS standard costs
US$0.40 per million requests, and the always-free allowance is 1 million requests a month,
so it is effectively free.

### Amazon CloudWatch: logs, metrics and alarms
**What it does:** Holds the Lambda and API access logs (30-day retention in prod, 7 days in
dev) and runs alarms on the DLQ depth, Lambda errors, API 5xx responses, SES bounce rate and
SNS subscriber count.

**Cost:** Always-free covers 5 GB of log ingestion, 10 custom metrics and 10 alarms. Above
that, ingestion is US$0.5985 per GB, storage US$0.0315 per GB-month and alarms US$0.10 each.
We will stay within the free alarm count.

**What we avoid:** Paid monitoring tools, Container Insights, X-Ray tracing by default
(it can be switched on temporarily for debugging), and logging request bodies.

### AWS Budgets: cost alerts
**What it does:** A monthly cost budget (for example US$5) alerts at 50%, 80% and 100% of
actual spend, and at 100% of forecast spend, by email via the ops topic.

**Cost:** Standard budgets are free. It is created by CloudFormation (`AWS::Budgets::Budget`).

## Services considered and not used

| Service | Why not |
|---|---|
| AWS WAF | About US$8 a month on pay-as-you-go (US$5 for the web ACL, US$1 per rule, US$0.60 per million requests), which is more than 10 times the rest of the bill. It is offered as an optional parameter, and the CloudFront flat-rate Free plan is a possible US$0 route. See Q12. |
| AWS Secrets Manager | US$0.40 per secret per month, and there are no secrets to store. Cognito holds credentials and IAM roles authorise services. The origin-verify header is a NoEcho parameter. |
| Customer-managed KMS keys | US$1 per key per month, with no added protection over AWS-managed or AWS-owned keys for this threat model |
| AWS Backup | PITR plus on-demand table backups before risky changes are enough. Backup vaults add cost and complexity. |
| OpenSearch | Search across hundreds of orders does not need a search engine, which would cost at least tens of dollars a month. |
| EventBridge Scheduler | Not needed if retention uses DynamoDB TTL. It would be added only if Q14 needs scheduled anonymisation, in which case it is free at this volume. |
| AWS Amplify Hosting | It would simplify hosting, but it hides the CloudFront and S3 resources this project is meant to teach. It is also configured outside plain CloudFormation in practice. |
| AWS SAM | SAM is a CloudFormation transform, so it would technically be allowed. Plain CloudFormation shows every resource explicitly, which is what the brief asks to learn. `aws cloudformation package` covers SAM's packaging convenience. |
| EC2, RDS, containers | Excluded by the brief, and not needed |
