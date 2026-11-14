# Decision log

These are decisions made by the operator while reviewing Phase 1. Each one records what was
decided and how it changes the design. Where an earlier document conflicts with this log,
this log wins until that document is updated.

## 4 November 2026: Phase 1 review

**All Phase 1 recommendations accepted**, including the recommended answers in
[open-questions.md](open-questions.md), with the following decisions and changes.

### D1. Business name
- The customer-facing name was confirmed. It lives only in the deployment parameters
  (`BusinessDisplayName`), never in the code.
- Resource prefix: `kvc` (for example `kvc-prod-main`, `kvc-dev-create-order`).
- SNS topics: `<BusinessName>OrderNotifications` (prod), plus a `-dev` suffix in dev, and
  `<BusinessName>OpsAlerts`, where `<BusinessName>` is the display name without spaces.
- Order references use the `KV-` prefix, for example `KV-7K3QXM`.
- The name stays a single `BusinessDisplayName` parameter, so it can still change.

### D2. No domain yet: use the CloudFront default address
- Both environments use `https://<id>.cloudfront.net` until a domain is registered.
- **Consequences:**
  - No Route 53 hosted zone (saves US$0.50 a month) and no ACM certificate. The us-east-1
    `edge` stack is **not deployed** for now. The templates take an optional `DomainName`.
    When it is empty, a `HasCustomDomain` condition leaves out the aliases, the certificate
    and the DNS records.
  - **A dependency to handle in Phase 2:** the Cognito app client needs the site URL for its
    sign-in callback. Without a custom domain, that URL is only known after CloudFront is
    created. The app client is therefore created **after** the distribution, either in the
    frontend nested stack or as a final nested stack, so the dependency is not circular.
  - The admin sign-in page uses Cognito's free prefix domain
    (`kvc-<env>.auth.eu-west-2.amazoncognito.com`).
  - Adding a domain later is a **stack update**. It deploys the edge stack, then passes
    `DomainName`, `HostedZoneId` and `CertificateArn`. The CloudFront distribution and all
    the data stay the same.

### D3. Email: revisit once there is a domain and a working test system
- The operator wants a better approach to email than the current SNS-plus-SES design. That
  decision is **deferred** until a domain exists and a test system is running.
- **What this means for the build:**
  - **Internal notifications through SNS do not need a domain.** They are built as designed
    and will work in dev and prod from the start, using a plain-text email to subscribed
    addresses.
  - **Customer emails through SES do realistically need a domain.** Leaving the SES sandbox
    and getting good deliverability both depend on it. Until then, the notifier will
    have a `CustomerEmailEnabled` switch, which defaults to `false`. Orders will record the
    customer email as `SKIPPED`, not `FAILED`, so the admin portal does not show false alarms.
    In dev, SES sandbox sending to the operator's own verified address can be switched on for
    testing.
  - Until customer emails are on, the **confirmation page carries everything**: the
    reference, the order summary, the total, the collection date and the payment-in-person
    note. It also has a "save or print this page" prompt.
  - The order-first, stream-triggered notifier design stays. Whatever email approach is
    chosen later plugs into the same place.
- **Options to evaluate at that point:**
  1. **SES for both customer and internal emails** (branded HTML, no unsubscribe-link
     problem), with SNS kept only for technical alerts and any future fan-out
  2. Keep SNS for internal emails, as in the brief
  3. SES for internal emails, plus an SNS topic for SMS or a phone app later
- Phase 4 (email) moves to **after a domain is registered**. Phases 2 and 3 do not depend
  on it.

### D4. AWS account: full (Paid plan) account
- The always-free allowances apply. No credit or 12-month offers are assumed.
- CloudFront flat-rate plans are available to this account type. **WAF stays off**
  (recommendation accepted). The flat-rate Free plan will be looked at again once a domain
  exists.

### D5. Environments: dev and prod in one account, costs kept down
- Two environments in one account, with namespaced names.
- Cost controls in dev: 7-day log retention, no deletion protection (so it can be torn down
  easily), test data only, and the SES customer email switched off by default.
- Expected cost is about US$0.01 a month for dev and US$0.01–0.50 a month for prod while there
  is no domain, excluding VAT. See [cost-estimates.md](cost-estimates.md).
- One AWS Budget of **US$5 a month** for the whole account, with alerts to the operator.

### D6. Technical alerts go to the operator
- The operator (the baker's son, who asked for the site) receives the internal order notifications (with the baker) and the
  ops alerts (DLQ, errors, budget) on the separate ops topic.

### D7. Domain example.co.uk, DNS in Route 53, inbound mail forwarded (9 November 2026)
- The domain is registered at the registrar and stays there. Its nameservers point at a Route 53
  hosted zone in the shared `kvc-dns` stack (about US$0.50 a month), because the registrar cannot
  alias the bare domain to CloudFront, and Route 53 keeps every record in CloudFormation.
- Prod serves `example.co.uk` and `www.`. Dev keeps its `*.cloudfront.net` address.
- Outbound order email goes through SES from `orders@example.co.uk` (D3).
- Inbound mail: none for launch (9 November 2026). Customer emails are sent from
  `orders@` with a Reply-To of the business email set in the admin portal, so replies reach
  an existing inbox. ImprovMX forwarding is ready in `dns.yaml` (`EmailForwarding=improvmx`)
  if it is wanted later.
- Customers are also emailed when an admin moves their order to Confirmed, Ready for
  collection or Cancelled (once per status; shown under Emails on the order page).
- Prod can be deployed on its `*.cloudfront.net` address first (Deploy workflow,
  `use_domain=false`), then switched to the domain once the nameservers are live.

## Still needed from the baker (not blocking Phase 2)

The operator accepted the recommended defaults. These items need **facts** from the business
before Phase 3 content or before going live:

| Item | Needed by | Ref |
|---|---|---|
| Ingredients, allergens and alcohol content for each cake | Before go-live | Q7 |
| Collection address and times | Phase 3 | Q3 |
| Payment methods accepted in person | Phase 3 | Q5 |
| Capacity per collection date (how many cakes a day) | Phase 3 | Q6 |
| Whether the flyer's phone number can appear on the website | Phase 3 | Q4 |
| Photos of the actual cakes | Phase 3 (placeholders until then) | Q21 |
| Food business registration with the council | Before go-live | Q23 |
| Retention period confirmed with whoever does the accounts | Before go-live | Q14 |
