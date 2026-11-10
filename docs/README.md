# Cake shop ordering system: Phase 1 discovery and architecture

**Status:** Phase 1 approved (see the decisions below). Phase 2 CloudFormation templates are written and pass cfn-lint, but are **not deployed**. Nothing here has been built, deployed or tested.
No AWS resources exist yet, and none will be created until Phase 2 is approved.

This folder holds the Phase 1 deliverables from the project brief. Each document can be
read on its own, but the order below is the suggested reading order.

| # | Deliverable | Document |
|---|-------------|----------|
| 1 | Proposed AWS architecture diagram | [architecture.md](architecture.md#1-architecture-diagram) |
| 2 | Each AWS service and why it is needed | [aws-services.md](aws-services.md) |
| 3 | Proposed CloudFormation stack structure | [cloudformation-design.md](cloudformation-design.md) |
| 4 | Proposed DynamoDB data model | [data-model.md](data-model.md) |
| 5 | Customer ordering workflow | [architecture.md](architecture.md#5-customer-ordering-workflow) |
| 6 | Administrator workflow | [architecture.md](architecture.md#6-administrator-workflow) |
| 7 | Customer email notification workflow | [architecture.md](architecture.md#7-customer-email-workflow-ses) |
| 8 | Internal SNS notification workflow | [architecture.md](architecture.md#8-internal-notification-workflow-sns) |
| 9 | Excel export implementation | [excel-export.md](excel-export.md) |
| 10 | Security and privacy assessment | [security.md](security.md) |
| 11 | Estimated monthly AWS costs | [cost-estimates.md](cost-estimates.md) |
| 12 | Proposed GitHub repository structure | [repository-structure.md](repository-structure.md) |
| 13 | Phased development and deployment plan | [delivery-plan.md](delivery-plan.md) |
| 14 | Outstanding questions and business decisions | [open-questions.md](open-questions.md) |
| (extra) | Branding notes from the promotional flyer | [brand-reference.md](brand-reference.md) |
| (extra) | Decision log | [decisions.md](decisions.md) |
| Phase 2 | Deployment, updates, teardown, troubleshooting | [deployment.md](deployment.md) |
| Phase 2 | Backup and disaster recovery | [disaster-recovery.md](disaster-recovery.md) |
| Phase 2 | Template map, parameters, IAM review | [infrastructure/cloudformation/README.md](../infrastructure/cloudformation/README.md) |

## Summary of the recommendation

A fully serverless design in **eu-west-2 (London)**, with nothing running when nobody is
using it:

- **CloudFront + private S3** serve two React/TypeScript single-page apps from one domain:
  the customer shop at `/` and the admin portal at `/admin/`.
- **API Gateway HTTP API** sits behind the same CloudFront distribution at `/api/*`. Public
  routes are open. Admin routes need a **Cognito** JWT from the single admin user.
- **Five small Lambda functions** (Node.js, TypeScript, arm64). They are split by permission
  boundary, so each IAM role only reaches what it needs.
- **One DynamoDB table** (on-demand, point-in-time recovery) holds products, season settings,
  collection dates and orders. It is the only source of truth.
- **Notifications are asynchronous.** The order is written first, and the customer gets their
  reference straight away. A **DynamoDB Stream** then triggers a notifier Lambda. That Lambda
  sends the **SES** acknowledgement and publishes to the **SNS** topic
  `<BusinessName>OrderNotifications`. Failures are retried, then land in an **SQS dead-letter
  queue**. They are also flagged on the order so the admin portal can show them.
- **Excel export** builds a real `.xlsx` in a Lambda with the `exceljs` library and streams it
  back to the browser.
- **CloudFormation only.** That means a nested-stack root in eu-west-2, plus a small
  us-east-1 stack for the ACM certificate CloudFront needs. The us-east-1 stack is only
  deployed once a custom domain exists. Everything is deployed with the AWS
  CLI. Templates are validated with `cfn-lint` and reviewed through change sets.

**Estimated running cost:** about **US$0.01–0.50 a month per environment** plus VAT,
while the default CloudFront domain is used. Once a domain is registered, add US$0.50 a
month for the Route 53 hosted zone (prod only), plus the yearly domain fee. See [cost-estimates.md](cost-estimates.md). The one choice that would change that
figure a lot is **AWS WAF**, at about US$8 a month on pay-as-you-go. That is discussed below.

## Where I am challenging the brief

| Brief says | Recommendation | Why |
|------------|----------------|-----|
| "S3 static website hosting" | Private S3 bucket with CloudFront **Origin Access Control**, *not* the S3 website endpoint | The website endpoint needs a public bucket and only supports HTTP. With OAC, only CloudFront can read the bucket. It costs the same and is more secure. |
| API Gateway (type unspecified) | **HTTP API**, not REST API | US$1.16 vs US$3.50 per million requests in eu-west-2. It has a built-in Cognito JWT authorizer and simpler configuration. The REST API's extra features (usage plans, request models, direct WAF) are not needed when the API sits behind CloudFront. |
| WAF implied by "rate limiting and spam protection" | **No WAF at launch.** Use API Gateway throttling, per-email limits, a honeypot and strict validation. Keep WAF as a one-parameter switch. | Pay-as-you-go WAF costs about US$8 a month, which is more than 10 times the rest of the system. The CloudFront flat-rate **Free plan** includes WAF at US$0, but it is not available to AWS Free-plan accounts. It is also not clearly manageable with CloudFormation yet. See [open-questions.md](open-questions.md). |
| SNS for internal email | **Keep SNS**, as required, but be aware of its limits | SNS email is plain text only. It comes from `no-reply@sns.amazonaws.com` and carries an unsubscribe link that one accidental click would trigger. SES to a configured list would look better. I have kept SNS because the brief asks for it, and the topic means extra subscribers (SMS, a phone app, a Lambda) can be added later. |
| "Search by customer name" | Do the search in Lambda over the season's orders, with no search index | A busy season means hundreds of orders, not millions. A DynamoDB Query plus in-memory filtering costs fractions of a penny and avoids OpenSearch, which would cost tens of pounds a month. |
| Separate admin site | One distribution and two app bundles (`/` and `/admin/`) | Security is enforced at the **API**, not by hiding static files. One distribution means one certificate, one domain and fewer moving parts. |
| Brief is silent | **Snapshot unit prices onto each order** | If the price of an existing order changed when the baker edits a price, that would be a bug. |
| Brief is silent | **Confirmation email when the baker confirms an order** | The acknowledgement deliberately says "received, not yet accepted". Customers then need to hear that the order was accepted. I recommend that this be part of the design. |
| Brief is silent | **Capacity per collection date** | The baker can only bake so many cakes per day. Without a limit, the form will keep taking orders she cannot fulfil. See question Q6. |

## Decisions (4 November 2026)

The operator accepted all the recommendations, with the changes below. The full log is in
[decisions.md](decisions.md).

- **Business name confirmed** (kept in the deployment parameters, not the code).
- **No domain yet.** Both environments use the CloudFront default `*.cloudfront.net`
  address until a domain is registered.
- **Email delivery will be revisited** once there is a domain and a working test system.
- **Full (Paid plan) AWS account.**
- **dev and prod environments in one account,** with costs kept to a minimum.
- **Technical alerts go to the operator.**
