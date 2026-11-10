# Security and privacy assessment

> Phase 1 assessment of the *proposed* design. No controls have been implemented or tested
> yet. Legal points are a starting checklist for a small business, **not legal advice**.

## 1. What we are protecting

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Customer name, email, phone, order notes | **Personal data (UK GDPR)** | DynamoDB, SES/SNS emails, Excel exports |
| Order history and totals | Business records | DynamoDB, exports |
| Admin account | High: full access to customer data | Cognito |
| Product prices and availability | Integrity matters (fraudulent price changes) | DynamoDB |
| Family email addresses | Private | SNS subscriptions, a git-ignored parameter file |
| AWS account | Critical | The operator's IAM Identity Center or IAM user |

**Not collected, by design:** payment card data, home addresses (orders are collected, not
delivered), dates of birth, accounts or passwords for customers, and IP addresses on order
records.

## 2. Threats and controls

| Threat | Likelihood | Control |
|---|---|---|
| Someone accesses the admin API without logging in | Medium (bots probe every API) | API Gateway JWT authorizer on every `/api/admin/*` route, checked *before* Lambda runs. The Lambda also checks the `admins` group. A test asserts that every admin route returns 401 without a token. |
| The admin password is guessed or phished | Medium | Cognito strong password policy, **MFA required** (TOTP or passkey), self sign-up disabled, and Cognito's built-in lockout after failed attempts |
| The admin token is stolen through XSS | Low | React escapes output by default, there is no `dangerouslySetInnerHTML`, a strict Content-Security-Policy (`script-src 'self'`), tokens are held in memory and not in localStorage, and access tokens are short-lived (60 minutes) |
| Spam or fake orders flood the baker's inbox | **High once the site is public** | See §3 |
| The order form is used to email-bomb a third party | Medium | Per-email limit (for example 3 orders a day). SES bounce and complaint monitoring with an alarm, because SES suspends accounts with high complaint rates. |
| Price tampering (submitting £1 for a cake) | Medium | The server ignores the client's prices and recalculates from DynamoDB |
| Injection (NoSQL, formula, header) | Low | Zod schemas with strict types, lengths and character sets. DynamoDB SDK parameters are never string-built. Excel formula escaping. Email headers are built by the SDK, and the customer name is sanitised of CR/LF. |
| Direct calls to the API, bypassing CloudFront | Low | A secret origin-verify header from CloudFront, rejected if missing. Throttling at API Gateway applies regardless. |
| Clickjacking or MIME sniffing | Low | `frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` through a CloudFront response headers policy, plus HSTS |
| Data loss (accidental delete or a bad deploy) | Medium | PITR (35 days), deletion protection, `DeletionPolicy: Retain`, change-set review, and S3 versioning for the site |
| Leaked AWS credentials | Low, but severe | No access keys in the repo, `.gitignore` for parameter files, GitHub secret scanning and push protection on the repo, MFA on the AWS root and on the operator's user, and a budget alert as an early signal of abuse |
| Personal data in logs | Medium (an easy mistake) | A structured logger with a **redaction allow-list**: only `orderRef`, status codes and error names are logged. Request bodies are never logged. API access logs exclude query strings. |
| Vulnerable npm dependencies | Medium | Dependabot alerts, `npm audit` in CI, and a minimal dependency list |

## 3. Rate limiting and spam protection without WAF

These are cheap layers that together handle the realistic threat, which is bots and casual
abuse rather than a determined attacker:

1. **API Gateway route throttling:** `POST /api/orders` at about 1 request a second with a
   burst of 5, and the catalogue at 20 requests a second. Requests above the limit get HTTP
   429 before any Lambda runs. One trade-off to be honest about: HTTP API limits apply to
   the route as a whole, not per visitor. A sustained flood would therefore also slow down
   genuine customers, which is the point where WAF's per-IP rules would earn their cost.
2. **Lambda reserved concurrency** on `public-create-order` (for example 2). This sets a
   hard ceiling on cost and on the write rate, whatever happens. (One caveat to check in
   Phase 2: new accounts can have a low total concurrency quota, and reserved concurrency
   must leave at least 10 unreserved.)
3. A **per-email daily limit** through a DynamoDB counter with TTL.
4. A **honeypot field** (hidden from humans, filled in by naive bots) and a
   **minimum fill time** (a submission less than 3 seconds after the page loaded is
   rejected).
5. **Server-side business validation:** the date must be open and under capacity, the
   deadline must not have passed, quantities must be 1 to 10, there can be at most 10 lines,
   and the total must be at most £500 (configurable).
6. **Human review:** an order is only *received*, not accepted, until the baker confirms it. A
   fake order costs her a click to cancel.

**What WAF would add:** per-IP rate-based rules, the AWS IP reputation list, and a CAPTCHA
option. That is worth adding if spam actually appears. The template will include it behind
`EnableWaf=true`, so it is a single parameter change. See [open-questions.md](open-questions.md), Q12.

## 4. Encryption

| Where | How |
|---|---|
| Browser to CloudFront | TLS 1.2+ (`TLSv1.2_2021` policy), HSTS |
| CloudFront to API Gateway | HTTPS only |
| CloudFront to S3 | HTTPS with OAC (SigV4) |
| DynamoDB at rest | AWS-owned key (default) |
| S3 at rest | SSE-S3 |
| SNS topic | `alias/aws/sns` (AWS-managed, free) |
| SQS DLQ | SSE-SQS |
| CloudWatch Logs | Service-managed encryption |
| Email in transit | SES uses opportunistic TLS by default. A configuration set with `TlsPolicy: REQUIRE` would refuse delivery to servers without TLS. I recommend **Optional**, so that customers on small providers still get the email. |

Customer-managed KMS keys (US$1 a month each) are not used. They add key-policy control and
CloudTrail visibility of key use, but neither is needed here.

## 5. UK GDPR and the Data Protection Act 2018

### Roles
- **Controller:** the business (the baker, trading under the business name). It decides why
  and how customer data is used.
- **Processor:** AWS, under the AWS GDPR Data Processing Addendum, which is part of the AWS
  Service Terms and applies automatically.
- The operator, who runs the technical side, acts on the business's behalf.

### Lawful basis
- **Contract (Article 6(1)(b)):** taking and fulfilling the order the customer asked for.
  This covers the name, email, phone and collection date.
- **Legal obligation (Article 6(1)(c)):** keeping sales records for tax purposes.
- **Marketing is out of scope.** Using customer emails for "next Christmas" mailings would
  need separate, opt-in consent under PECR. The form will not include this unless Q19 says
  otherwise.

### Data minimisation
Only the fields listed in the brief are collected. The phone number is justified, because it
is needed to arrange collection. No address, date of birth or account is collected.

### Retention (proposal, needs a business decision: Q14)
| Data | Proposed retention | Mechanism |
|---|---|---|
| Orders (with personal data) | 18 months after the collection date | DynamoDB TTL |
| Idempotency and rate data | 24–48 hours | DynamoDB TTL |
| Lambda and API logs | 30 days (prod), 7 days (dev) | Log group retention |
| PITR backups | 35 days rolling | DynamoDB |
| SNS/SES emails in inboxes | Outside AWS. The baker and her son are asked to delete them after the season. | Documented process |
| Excel exports | Outside AWS. Keep the annual accounts copy only. | Documented process |

**Tax records:** HMRC generally expects sole-trader business records to be kept for **at
least 5 years after the 31 January Self Assessment deadline** for that tax year. The cleanest
way to meet this is for the *financial* record to be the annual Excel export or the
accounts, while the online system keeps personal data for a shorter time. Erasure keeps the
reference, the lines and the totals, but removes the name and contact details. This needs to
be confirmed with whoever does the business's accounts.

### Individual rights process
| Right | Process |
|---|---|
| Access | The baker searches by name or email in the portal and exports that customer's orders to Excel, within one month |
| Rectification | The baker edits the contact details on the order (to be added to the admin UI) |
| Erasure | The "Erase personal data" action on an order (after a named confirmation). It also needs the matching emails deleted from inboxes. |
| Objection or restriction | Handled manually, and rare for transactional data |

### Privacy notice (outline, to be drafted in full in Phase 3)
It will be a short page linked from the order form footer and the confirmation email:

1. Who we are, and how to contact us
2. What we collect: name, email, phone, order details and notes
3. Why: to process and arrange collection of your order, and to keep business records
4. Lawful basis: contract and legal obligation
5. Who processes it: our hosting provider, Amazon Web Services, in the UK (London region)
6. How long we keep it (the retention table above, in plain English)
7. Your rights, and how to exercise them
8. Your right to complain to the ICO (ico.org.uk)
9. That we do not take payment online, and do not store card details

### ICO registration
Most organisations that process personal data electronically must pay the **ICO data
protection fee**, but some small businesses are exempt, depending on what they use the data
for. The business should complete the ICO's online self-assessment. The lowest tier has been
about £52 a year since early 2025, but **that figure should be checked on ico.org.uk**.

## 6. Backup and recovery (summary; full `disaster-recovery.md` in Phase 2)

| Scenario | Recovery | RPO / RTO target |
|---|---|---|
| An order or product deleted or corrupted by mistake | PITR restore to a new table at a time just before the change, then copy the item back | about 5 min / under 1 h |
| The table deleted | `DeletionPolicy: Retain` and deletion protection make this hard. Otherwise restore from PITR, or from the last on-demand backup. | about 5 min / under 1 h |
| A bad frontend deploy | Redeploy the previous git tag, or restore S3 object versions | none lost / 10 min |
| A bad infrastructure deploy | CloudFormation automatic rollback, or redeploy the previous tag | none lost / 15–30 min |
| Loss of the AWS account or region | Re-create from git into a new account or region, restore from an exported backup. This is documented but accepted as unlikely. | up to the last export / about 1 day |

A PITR restore creates a **new** table, so the templates will accept an optional table-name
override to swap the application onto a restored table. That procedure will be rehearsed in
dev during Phase 5, and only then documented as tested.

## 7. Items outside AWS that affect security

- **Turn on MFA on the AWS root account,** use a non-root user or Identity Center for daily
  work, and enable billing alerts (covered by AWS Budgets).
- **GitHub:** turn on secret scanning push protection, protect `main` with required checks,
  and decide whether the repository should be public (Q20). A public repository is fine,
  because no secrets or personal data will be committed, but parameter files and the flyer
  (which shows a phone number) stay out of git.
- **Family devices:** the baker's admin access and her inbox are now part of the security
  boundary. A short "staying safe" section in the operations guide will cover phishing,
  MFA recovery and device locks.
