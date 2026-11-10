# Deployment, updates and teardown

> **Status:** written in Phase 2. The scripts have been checked with `shellcheck` and
> dry-run against a mocked AWS CLI, which only tests the command flow. **Nothing has been
> deployed to a real AWS account yet.** This guide will be corrected after the first real
> dev deployment, if anything differs.

## Prerequisites

| Tool | Why | Check |
|---|---|---|
| AWS account (Paid plan) with MFA on root | Where everything runs | — |
| AWS CLI v2, signed in as an admin (Identity Center recommended) | Every deploy step | `aws sts get-caller-identity` |
| `jq` | Parameter handling in the scripts | `jq --version` |
| `zip`, `openssl`, `git` | Packaging, secret generation | — |
| `cfn-lint` (`pip install cfn-lint`) | Template validation | `cfn-lint --version` |
| Node.js 22+ and npm | Backend and frontend builds (Phase 3+) | `node --version` |

The region is fixed at **eu-west-2**. The edge stack uses us-east-1, and only when there is
a domain.

## 1. Configure an environment

```bash
cp infrastructure/cloudformation/parameters/dev.example.json \
   infrastructure/cloudformation/parameters/dev.json
# edit dev.json: real email addresses, a unique CognitoDomainPrefix
```

`dev.json` and `prod.json` are **git-ignored**, because they contain family email
addresses. The scripts refuse to run while the file still contains `CHANGE-ME` or
`example.com`.

## 2. Validate (free, no AWS access needed)

```bash
scripts/validate.sh          # cfn-lint on every template
scripts/validate.sh --aws    # also AWS's own validate-template (needs credentials, still free)
```

## 3. Review a deployment (creates a change set, changes nothing)

```bash
scripts/deploy.sh dev
```

This script:

1. Validates the templates.
2. Creates or updates `kvc-bootstrap`: the artifacts bucket and the budget. **This step does
   create resources** (an S3 bucket costing fractions of a penny, and a free budget).
3. Skips the us-east-1 edge stack, because there is no domain or WAF yet.
4. Builds the Lambda zips. Until Phase 3, it builds **placeholders** that answer 503. The
   zips are uploaded under a content hash, so unchanged code is never redeployed.
5. Packages the nested templates into the artifacts bucket.
6. Creates a **change set** for `kvc-dev`, including nested stacks, and prints every change.
   It warns loudly if a DynamoDB table or Cognito user pool would be *replaced*.
7. Stops, so you can review.

## 4. Deploy

```bash
scripts/deploy.sh dev --execute
```

The first create takes about **10–15 minutes**, mostly for CloudFront. Prod asks you to type
`prod` before executing.

### After the first deploy
1. **Confirm SNS subscriptions.** Each internal notification address and the ops address
   receives *"AWS Notification – Subscription Confirmation"*. Click **Confirm
   subscription** within 3 days. Then check with:
   ```bash
   scripts/status.sh dev    # PendingConfirmation = not clicked yet
   ```
   If a link expired: in the SNS console, open the topic, select the pending subscription
   and choose **Request confirmation**. Alternatively, remove the address from the params
   file, deploy, add it back and deploy again.
2. **Admin sign-in.** Cognito emails the admin a temporary password. Open
   `<SiteUrl>/admin/` (Phase 3). At first sign-in, the admin chooses a new password and sets
   up an authenticator app.
3. **Confirm the budget alert email** if AWS Budgets asks. Budget emails do not need
   confirmation, but check your spam folder.
4. **Activate cost allocation tags (once per account):** Billing console → Cost allocation
   tags → activate `Project` and `Environment`. The tags appear there up to 24 hours after
   the first deploy. The full tag set is in
   [cloudformation-design.md](cloudformation-design.md#4-naming-and-tagging).

## GitHub Actions

You can deploy from GitHub's runners instead of a laptop. The workflow uses **OIDC**: GitHub
gets short-lived AWS credentials for each run, so no AWS keys are stored anywhere.

### One-off setup (about 10 minutes)
1. **Create the deploy role (AWS console, eu-west-2).**
   - First check IAM → Identity providers. If `token.actions.githubusercontent.com` is
     already listed, you will set `CreateOidcProvider` to `false` below.
   - Go to CloudFormation → Create stack → *With new resources* → Upload a template file,
     and choose `infrastructure/cloudformation/github-deploy-role.yaml`.
   - Stack name: `kvc-github-deploy`. Fill in `GitHubOwner`, `GitHubRepo`, and their
     numeric IDs `GitHubOwnerId` and `GitHubRepoId` (from
     `curl -s https://api.github.com/repos/<owner>/<repo> | jq '.owner.id, .id'`). Keep the
     other defaults, except `CreateOidcProvider` if needed.
   - Tick *"I acknowledge that AWS CloudFormation might create IAM resources with custom
     names"*, then Submit.
   - When it shows `CREATE_COMPLETE`, copy the **DeployRoleArn** output.
2. **GitHub repository variable:** Settings → Secrets and variables → Actions → *Variables*
   → New repository variable `AWS_DEPLOY_ROLE_ARN` = the ARN from step 1.
3. **GitHub environment and secret:** Settings → Environments → New environment `dev` → Add
   environment secret `KVC_PARAMETERS_JSON`. The value is the full contents of a filled-in
   `dev.example.json`, including `BusinessDisplayName` and `BakerName`: the shop, the
   emails and the SNS topic names take the business's real names only from here, and
   `deploy.sh` stops if either is missing. Later, create a `prod` environment the same way and add **Required
   reviewers**, so every prod deploy needs your approval.
4. The workflow must be on the default branch before GitHub will let it be run, so
   **merge the PR** that adds `.github/workflows/deploy.yml`.

### Running it
Actions → **Deploy** → Run workflow:
- `execute` **off**: builds and prints the change set only. This is the review run.
- `execute` **on**: applies it.

From the command line, the equivalent is:
`gh workflow run deploy.yml -f environment=dev -f execute=true`.

### What the deploy role can do
`github-deploy-role.yaml` allows full access **only to the services this project uses**.
In IAM, it can only create, change, pass (to Lambda only) and delete roles named `kvc-*`,
and it cannot modify itself. Only workflow jobs from `<owner>/<repo>` that run in
the `dev` or `prod` GitHub environment can assume it. If the repository is public, the
Actions logs are public too. The workflow never prints the parameter file, and it masks
email addresses in the status output.

## 5. Updating

| Change | Command | Notes |
|---|---|---|
| Templates or parameters | `scripts/deploy.sh <env>`, review, then `--execute` | Always read the change set |
| Lambda code only (Phase 3+) | the same | The content hash changes, so only the functions update |
| Frontend only | `scripts/publish-frontend.sh <env>` | No CloudFormation involved. Until Phase 3 it publishes the holding page in `frontend/holding/`. `deploy.sh` runs it after every successful deploy. |
| Add a notification recipient | Edit `InternalNotificationEmails`, then deploy | The new person must confirm |
| Rotate the origin secret | `scripts/deploy.sh <env> --execute --rotate-origin-secret` | Updates CloudFront (slow) and the Lambdas |

### Replacements
If the change set shows **Replacement: True** on `MainTable` or `UserPool`, **do not
execute**. A replacement would create a new, empty resource, and the old one would be kept
because of the Retain policy. Usually this means a property that cannot change in place was
edited, such as the table name or the key schema. Revert that change, or plan a migration.

## 6. The domain and going live (decision D7)

The domain is **example.co.uk**, registered at another registrar. It stays registered there,
but its DNS moves to a Route 53 hosted zone (about US$0.50 a month). The registrar cannot point the
bare domain at CloudFront, and in Route 53 every record lives in CloudFormation. Dev keeps
its `*.cloudfront.net` address; only prod uses the domain.

### 6.1 DNS stack and nameservers
1. Actions → **DNS** → Run workflow, `action=review`, then `action=execute`. This creates
   the `kvc-dns` stack (`infrastructure/cloudformation/dns.yaml`): the hosted zone, plus
   the MX and SPF records for email forwarding through ImprovMX. The log prints **four
   nameservers**. (Locally: `scripts/deploy-dns.sh example.co.uk --execute`.)
2. **At the registrar:** sign in → *Manage* the domain → *Manage DNS* (or *Nameservers*) →
   choose custom nameservers → enter the four from step 1 (without the trailing dot) →
   save. If the registrar shows an email package or existing MX records on the domain, stop and
   copy them into `dns.yaml` first.
3. Wait. It usually takes under an hour, and can take up to 48. Run the DNS workflow with
   `action=check`. It asks the `.uk` registry directly and passes once the change is live.

### 6.2 Email
- **Inbound.** Not set up for launch: the domain receives no mail, and customer emails
  carry a Reply-To of the business email from the admin portal (Settings). To add
  forwarding later, create a free ImprovMX account for example.co.uk and add
  aliases (for example `hello@` and `orders@`, or a catch-all `*`) that forward to the baker's
  existing inbox. Her personal address is entered only in ImprovMX, never in this repository.
  Then run the DNS workflow with `email_forwarding=improvmx`. The baker's replies come from her personal
  address.
- **Outbound (order emails).** The prod deploy creates the SES identity for the domain,
  with DKIM, the `mail.` MAIL FROM domain and a monitoring-only DMARC record. SES starts
  in the **sandbox**, where it can only send to verified addresses. In the SES console
  (eu-west-2), choose *Request production access*, mail type *Transactional*, website
  `https://example.co.uk`, and describe the use: order confirmations and status updates
  for a small home bakery. Customers enter their own email when they order, bounces and
  complaints are recorded through the configuration set, and no marketing is sent. AWS
  usually answers within a day.

### 6.3 Prod rollout
1. **GitHub:** Settings → Environments → New environment `prod`. Add yourself under
   **Required reviewers**, then add the secret `KVC_PARAMETERS_JSON` with the full contents
   of a filled-in `prod.example.json` (real addresses, a unique `CognitoDomainPrefix`,
   and `HostedZoneId` left empty).
2. Wait until the DNS check passes (6.1). `deploy.sh` refuses to start until it does.
   To deploy earlier, run the Deploy workflow with `use_domain` **off**: prod comes up on
   its `*.cloudfront.net` address, and a later run with `use_domain` on adds the domain.
3. Actions → **Deploy**, `environment=prod`, `execute` **off**. Read the change set.
4. Run it again with `execute` **on**. The first create takes about 20 minutes: the
   certificate (us-east-1, validated through DNS), CloudFront with `example.co.uk` and
   `www.`, the alias records, SES, and the rest of the app. The smoke test then runs on
   `https://example.co.uk`.
5. After the first deploy: confirm the SNS subscription emails, then sign in to `/admin/`
   with the temporary password and set up MFA. Place a test order and check the internal
   email and the Excel export. Cancel the test order.
6. Once SES production access is granted, set `CustomerEmailEnabled` to `"true"` in the
   prod secret and deploy again. Test it with your own address, then raise DMARC to
   `p=quarantine` after a few weeks of clean reports.

Before taking real orders, the site needs each cake's ingredients, allergens and alcohol
(Q7), and the food business registration with the council (Q23). See decisions.md.

## 7. Teardown

```bash
scripts/destroy.sh dev
scripts/destroy.sh prod --i-have-exported-the-orders
```

The script empties the site bucket, takes a DynamoDB backup (prod only), and deletes the root
stack. It **does not delete** the DynamoDB table or the Cognito user pool, because they are
retained by design. It prints the exact commands to delete them yourself.

To remove everything from the account, delete the following, in this order:

1. Each environment, with `destroy.sh` plus the printed commands
2. The edge stacks, if any (`aws cloudformation delete-stack --region us-east-1 --stack-name kvc-<env>-edge`)
3. The bootstrap stack: empty the artifacts bucket (all versions) first, then
   `aws cloudformation delete-stack --region eu-west-2 --stack-name kvc-bootstrap`
4. The `kvc-dns` stack and its hosted zone (retained by design: delete the zone in the Route 53 console after removing its records). Point the domain's nameservers back at the registrar first if it should keep working.
5. On-demand DynamoDB backups (`aws dynamodb list-backups`)

### Redeploying after a teardown
The table and user pool names are fixed (`kvc-<env>-main`). If the retained table still
exists, a new create fails with "already exists". You have two options:

- **To keep the data,** import the retained table into the new stack using a CloudFormation
  resource import. The procedure is in [disaster-recovery.md](disaster-recovery.md).
- **To start fresh,** delete the retained table and user pool first.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ROLLBACK_COMPLETE` on first create | One resource failed, and the others were rolled back | `deploy.sh` prints every failed event (including nested stacks, emails masked), oldest first. The **first** one is the cause. In dev, the next `--execute` run deletes the empty rolled-back stack and tries again. In prod, delete it yourself (`aws cloudformation delete-stack --stack-name kvc-prod --region eu-west-2`) after fixing the cause. |
| `Domain already exists` (Cognito) | `CognitoDomainPrefix` is taken globally | Choose another prefix |
| `Specified ReservedConcurrentExecutions ... decreases account's UnreservedConcurrentExecution below its minimum value` | The account's concurrency quota is low (common on new accounts) | Set `CreateOrderReservedConcurrency` to `0`, or request a quota increase |
| `Bucket not empty` on delete | The site bucket still holds files | Use `destroy.sh`, which empties it first |
| Change set "didn't contain changes" | Nothing changed | Nothing to do. The script reports it and cleans up. |
| SNS subscription stuck in `PendingConfirmation` | The email was not clicked, or it went to spam | See "After the first deploy" above |
| Alarm emails never arrive | The ops subscription is not confirmed | `scripts/status.sh <env>` |
| 403 from `/api/*` | A request bypassed CloudFront (missing `X-Origin-Verify`), or the stage is not deployed | Call through the CloudFront URL. Check the stage in the API Gateway console. |
| 401 from `/api/admin/*` | The token is missing or expired, or is for the wrong client | Sign in again. Check that `AdminAppClientId` matches the frontend config. |
| GitHub Actions: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The token's `sub` claim does not match the deploy role's trust policy. GitHub tokens for this repo use the ID-based format `repo:Owner@<id>/Repo@<id>:environment:<env>`. | Check the "Show OIDC identity claims" step output against IAM → Roles → `kvc-github-deploy` → Trust relationships. Update the `kvc-github-deploy` stack with the current template (the `GitHubOwnerId` and `GitHubRepoId` parameters). |
| `Stack [kvc-dev] does not exist` when executing | An older `deploy.sh` treated a stack left in `REVIEW_IN_PROGRESS` by a review run as existing, and asked for an UPDATE | Fixed: `deploy.sh` now creates a CREATE change set for `REVIEW_IN_PROGRESS` stacks |
| `AWS::EarlyValidation::ResourceExistenceCheck` on create | A failed earlier create left the retained table (`kvc-<env>-main`) or user pool behind | In **dev**, `deploy.sh --execute` removes them automatically, but only if the table is empty. In **prod**, nothing is deleted. Import the table instead (disaster-recovery.md). |
| Drift suspected (console edits) | Someone changed a resource by hand | `aws cloudformation detect-stack-drift --stack-name kvc-dev --region eu-west-2` |
