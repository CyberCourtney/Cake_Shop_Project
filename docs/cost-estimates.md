# Estimated monthly AWS costs

> **These are estimates for a proposed design that has not been deployed.** Unit prices are
> **eu-west-2, USD, excluding VAT**. I read them from the AWS Price List API
> (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<service>/current/eu-west-2/index.json`)
> on **4 November 2026**, using files published between September and October 2026.
> Free-tier rules came from the AWS pricing pages on the same date. AWS changes prices and
> free tiers, so re-check them before deploying. Once something is deployed, the real bill
> in Cost Explorer is the only true figure.

## 1. Headline

**Decision (4 Nov 2026):** there is no domain yet, so both environments use the default
CloudFront address. That means **no Route 53 hosted zone**, and the fixed US$0.50 a month
goes away until a domain is registered.

| Scenario | Assumed activity per month | No domain (now) | With domain + hosted zone (later) |
|---|---|---|---|
| **1. Very low usage** (off-season) | 500 visits, 10 orders | **about US$0.01** | about US$0.51 |
| **2. Normal seasonal usage** (a busy November or December) | 5,000 visits, 150 orders | **about US$0.07** | about US$0.58 |
| **3. Higher seasonal usage** | 30,000 visits, 1,000 orders | **about US$0.47** | about US$1.00 |
| *Optional: WAF switched on* | any of the above | *add about US$8.00* | *add about US$8.00* |
| **dev environment** (idle most of the time, test traffic only) | a few hundred test calls | **about US$0.01** | US$0.01 (dev keeps the CloudFront domain) |

All figures exclude **20% VAT**.

A **typical year** (two busy months and ten quiet ones, prod plus dev) is **well under
US$1** without a domain. With a domain it is about US$7, plus the domain fee.

Without a domain, the bill is almost entirely usage-based. With one, the Route 53 hosted
zone becomes about 85–98% of it.

## 2. Unavoidable or fixed costs

| Item | Cost | Notes |
|---|---|---|
| Route 53 hosted zone | US$0.50 per month, **only once a domain exists** | Charged for every month the zone exists, whether or not it is used. It is the only fixed AWS charge in the design. It applies to prod only. |
| Domain registration (later) | About £5–15 a year for `.co.uk` or `.uk`, depending on the registrar | Route 53 domain prices vary by TLD and are listed in the Route 53 console. I have **not verified** the current Route 53 `.uk` price, because it is not in the Price List API. Check the Route 53 console or another registrar before buying. |
| VAT | 20% on top | AWS charges UK VAT to UK accounts |
| Exchange rate | USD-billed | AWS bills in USD by default. The card provider's conversion rate applies, unless the account is set to pay in GBP. |

There are no unavoidable third-party subscriptions. The design needs no paid email service,
no paid monitoring and no CAPTCHA service.

## 3. Unit prices used (eu-west-2)

| Service | Price | Free allowance applied in the estimate |
|---|---|---|
| API Gateway HTTP API | US$1.16 per million requests | none (assumed paid) |
| Lambda (arm64) | US$0.20 per million requests, US$0.0000133334 per GB-second | **Always free:** 1M requests and 400,000 GB-seconds a month |
| DynamoDB on-demand | US$0.7423 per million writes, US$0.1487 per million reads | **Always free:** 25 GB of storage |
| DynamoDB PITR | US$0.2377 per GB-month | none (data is about 0.01 GB) |
| DynamoDB Streams (Lambda trigger) | Reads by Lambda triggers are not charged | n/a |
| S3 Standard | US$0.024 per GB-month, US$0.0053 per 1k PUT, US$0.0042 per 10k GET | none |
| CloudFront | US$0.085 per GB (EU), US$0.012 per 10k HTTPS requests | **Always free:** 1 TB of transfer and 10M requests a month |
| SES | US$0.10 per 1,000 emails | none (assumed paid) |
| SNS email | US$2.00 per 100,000 notifications | **Always free:** first 1,000 email deliveries a month |
| SQS standard | US$0.40 per million requests | **Always free:** 1M requests a month |
| CloudWatch Logs | US$0.5985 per GB ingested, US$0.0315 per GB-month stored | **Always free:** 5 GB of logs, 10 alarms, 10 custom metrics |
| CloudWatch alarms | US$0.10 per alarm-month | within the 10 free |
| Cognito (Essentials) | US$0.015 per MAU above the free tier | **Free:** first 10,000 MAU (we have 1) |
| Route 53 | US$0.50 per zone-month, US$0.40 per million queries | Alias queries to CloudFront are free |
| AWS Budgets | Standard budgets are free | n/a |
| *AWS WAF (optional)* | *US$5 per web ACL-month, US$1 per rule-month, US$0.60 per million requests* | *none on pay-as-you-go* |

## 4. Working (so the numbers can be checked)

Assumptions behind the activity figures:

- Each visit makes about **2 API calls** (catalogue and settings). CloudFront serves about
  **80% of catalogue calls from its cache**.
- Each order costs about **20 write units**. That covers the transaction (order,
  idempotency, date counter, rate counter, with transactional writes at double cost), the
  notifier's status update, and later admin status changes.
- The admin dashboard and list load the season's orders, at about 2 KB each, with eventual
  consistency.
- Each order produces one acknowledgement email. In scenarios 2 and 3, it also produces one
  "confirmed" email (if Q9 is approved). Each order produces two SNS emails (the baker and the operator).

| Line | Scenario 1 | Scenario 2 | Scenario 3 |
|---|---|---|---|
| API requests | 1.2k: US$0.001 | 13k: US$0.015 | 71k: US$0.082 |
| Lambda | Free | Free | Free |
| DynamoDB requests | US$0.001 | US$0.016 | US$0.131 |
| DynamoDB storage and PITR | US$0.002 | US$0.002 | US$0.002 |
| CloudFront | Free | Free | Free (about 45 GB if each visit loads about 1.5 MB of photos) |
| S3 | US$0.002 | US$0.005 | US$0.026 |
| SES | US$0.001 | US$0.030 | US$0.200 |
| SNS | Free | Free | US$0.020 (2,000 emails, of which 1,000 are free) |
| CloudWatch | Free | Free | Free |
| Route 53 | US$0.501 | US$0.506 | US$0.536 |
| **Total** | **US$0.51** | **US$0.58** | **US$1.00** |

## 5. About the free tier (not assumed to be permanent)

- AWS changed its free tier for **accounts created on or after 15 July 2025**. New accounts
  choose a **Free plan** (credits, for up to 6 months, after which the account must be
  upgraded) or a **Paid plan**. The old "12 months free" offers, such as 1M API Gateway calls
  a month, do not apply to these accounts. **This estimate does not rely on any 12-month or
  credit-based offer.**
- The allowances marked **Always free** above are AWS's ongoing monthly allowances
  (Lambda, DynamoDB storage, CloudFront, SNS, SQS, CloudWatch, Cognito). They have been
  stable for years, but AWS can change them. **Even if every one of them disappeared**,
  scenario 3 would rise by roughly US$0.05. Lambda would cost a few cents, and the
  CloudFront requests about US$0.03. The design does not depend on the free tier.
- The account type matters for one decision. The **CloudFront flat-rate Free plan** (US$0
  a month, including WAF and DDoS protection) is **not available to Free-plan accounts**.
  See Q12 and Q16.

## 6. What could make it more expensive, and the guardrails

| Risk | Guardrail |
|---|---|
| A bot floods the order API | API throttling, Lambda reserved concurrency, per-email limits. The cost ceiling is low because each blocked request is cheap. |
| Large unoptimised cake photos | Photos are converted to WebP or AVIF at about 150–250 KB with responsive sizes. CloudFront's 1 TB free allowance leaves a large margin anyway. |
| Verbose logging | Structured logs with no request bodies, and 30-day retention |
| Someone switches on WAF, X-Ray, Shield Advanced or a customer-managed KMS key | Each is a documented, deliberate parameter. The budget alert catches surprises. |
| Leaked AWS credentials used for crypto-mining | MFA, no access keys in git, and a budget alert at US$5 with a forecast alert |

**AWS Budget:** I propose a monthly cost budget of **US$5**, with alerts at 50%, 80% and
100% of actual spend and at 100% of forecast spend. Any alert would be far above the expected
spend, so it would mean something is wrong.

## 7. Cheaper or simpler alternatives considered

| Alternative | Saving | Why not (or why maybe) |
|---|---|---|
| Keep DNS at an existing registrar instead of Route 53 | US$6 a year | It adds manual DNS steps (certificate validation, DKIM, SPF, DMARC), which breaks the brief's "no undocumented manual steps". It is worth it only if the cost really matters. |
| Use the default `*.cloudfront.net` address with no domain | US$6 a year plus the domain | Customers would see an unbranded URL, and SES would need a domain for good deliverability. This is fine for dev. |
| A form service (Google Forms) plus a spreadsheet | about £0 | It would meet the business need, but not the portfolio goal or the brief's AWS requirements |
| Provisioned DynamoDB at 25 RCU/WCU (always free) | about US$0.13 a month at most | It brings throttling risk and tuning effort for a few pence |
