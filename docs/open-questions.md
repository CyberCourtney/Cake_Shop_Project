# Outstanding questions and business decisions

> **Update, 4 November 2026:** the operator accepted all the recommendations below. Q1, Q2, Q11,
> Q16 and Q17 are answered, and email (Q9) is partly deferred. See
> [decisions.md](decisions.md). The facts still needed from the business are listed at the
> end of that log.

> **B** = blocks Phase 2 (infrastructure). **P3** = needed before Phase 3 (application).
> **L** = needed before going live. Each question has my recommendation, so "go with your
> recommendations" is a valid answer.

## Naming, domain and accounts

| # | Question | Needed by | My recommendation |
|---|---|---|---|
| Q1 | **What is the business called?** The brief, the flyer and the repository used different names. This affects the domain, the email sender, the SNS topic name, page titles and the CloudFormation prefix. | B | Confirm with the baker. Everything takes the name from a single setting until it is confirmed. |
| Q2 | Is a **domain** already registered? If so, which, and with which registrar? | B | Use Route 53 for DNS (registered there, or delegated to it) so every record is in CloudFormation |
| Q16 | Is the AWS account on the **Free plan (credits)** or the **Paid plan**? When was it created? | B | Paid plan. It is needed for the CloudFront flat-rate plans, and the always-free allowances still apply. |
| Q17 | Should **dev and prod** live in one AWS account or two? | B | One account, with separate stacks and namespaced names. It is simpler, and that is enough at this scale. |
| Q11 | Is "her son" the operator? Who should receive **technical alerts** (DLQ, errors, budget)? | B | Technical alerts go to the operator only, through a separate ops topic |
| Q12 | **AWS WAF:** launch without it (about US$0) or with it (about US$8 a month)? | B | Launch without it, using throttling, limits and the honeypot. Switch it on with one parameter if spam appears. Later, investigate the CloudFront flat-rate **Free plan**, which includes WAF at US$0 if the account is eligible. It is not yet clear that it can be managed with CloudFormation, so that would need checking. |
| Q20 | Should the GitHub repository be **public** (portfolio)? Which **licence**? | P3 | Public, with the MIT licence. No secrets or personal data will ever be committed either way. |

## Ordering rules

| # | Question | Needed by | My recommendation |
|---|---|---|---|
| Q3 | Where and when are cakes **collected**? Are there time slots or just dates? Can the address be shown publicly, or only in the confirmation email? | P3 | Dates with a stated time window. The address goes only in the "order confirmed" email, not on the public site. |
| Q4 | What **public contact email and phone** should customers see? (The flyer shows a mobile number. Is that OK to publish on the website?) | P3 | A business-only email address on the domain, such as `orders@`. The phone number is shown only if the baker is happy with it. |
| Q5 | Which **payment methods** are accepted in person (cash, card, bank transfer)? Are deposits ever required? | P3 | List the methods in the confirmation email. There are no deposits, and no online payment, per the brief. |
| Q6 | Is there a **capacity limit** per collection date? Should it count orders or individual cakes? | P3 | Yes, count cakes, with a separate count for minis if needed. The date then closes automatically when it is full. |
| Q8 | What should the **maximum quantity** be per product per order, and is there a maximum order value? | P3 | 10 per line and £500 per order, both configurable. Larger orders by phone. |
| Q13 | Is the ordering **deadline** one date per season, or does each collection date have its own cut-off? | P3 | One season deadline, with an optional per-date override (the model supports both) |
| Q10 | Can customers **cancel or change** an order themselves, or do they contact the baker? Is there a cancellation policy? | P3 | Contact the baker. There is no self-service, because that would need customer authentication. State the policy on the site. Perishable, made-to-order food is generally exempt from the 14-day cancellation right, but the policy should still be clear. |
| Q18 | Are there **options beyond iced or un-iced**, such as a message on the cake, gift boxes or alcohol-free versions? | P3 | Only the order notes for now. New variants can be added through the admin portal without code changes. |
| Q22 | Is this **Christmas and New Year only**, or might other seasons (Easter, birthdays) follow? | P3 | The model already supports multiple seasons. The design stays seasonal. |

## Emails and communication

| # | Question | Needed by | My recommendation |
|---|---|---|---|
| Q9 | Should customers get an email when the baker **confirms** an order (and when it is ready or cancelled)? | P3 | **Yes**, at least for "Confirmed" and "Cancelled". Otherwise "received, not yet accepted" leaves customers waiting with no update. It costs about US$0.0001 per email. |
| Q19 | Do you want an **opt-in** for "tell me about next year's cakes"? | L | Not for launch. If it is added later, it needs explicit consent (PECR) and a separate list. |

## Legal and food

| # | Question | Needed by | My recommendation |
|---|---|---|---|
| Q7 | **Allergen and ingredient information.** Food sold at a distance must have its allergen information available before purchase and on delivery, under the Food Information Regulations 2014. Jamaican Christmas cake usually contains rum or wine, so alcohol should be mentioned too. What are the ingredients and allergens for each cake? | L | Add an allergens field and an ingredients summary per product, shown on the product card, plus a "contact us about allergies" line. Check what applies with the local council's food safety team. |
| Q23 | Is the business **registered as a food business** with the local council? (This is required for home bakers selling to the public. It is free.) | L | Confirm. It is not a technical blocker, but worth checking before taking orders online. |
| Q14 | How long should orders be **kept**? Who does the business's tax records? | L | 18 months in the system, then automatic deletion. The annual Excel export is the tax record (HMRC generally expects 5+ years). Confirm with whoever does the accounts. |
| Q24 | Has the business done the **ICO data protection fee** self-assessment? | L | Do the ICO's online self-assessment. The business may be exempt, or the fee is about £52 a year (to be checked). |

## Content and admin

| # | Question | Needed by | My recommendation |
|---|---|---|---|
| Q21 | Are there **photos of the actual cakes**? The flyer has none. | P3 | Take 4–6 well-lit phone photos (iced, un-iced, a slice, the rose minis). I will optimise them. Placeholders will be used during development. |
| Q15 | How comfortable is the baker with **MFA**? Would she prefer an authenticator app, or a passkey on her phone or laptop? | P3 | A passkey if her devices support it (it is the easiest), with an authenticator app as backup. A recovery process will be documented. |
| Q25 | Which **devices and browsers** will the baker use the admin portal on? | P3 | It will be designed to work well on a tablet or laptop, and to be usable on a phone |
