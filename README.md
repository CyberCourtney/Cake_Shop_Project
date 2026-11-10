# Cake Shop

A friend's mum bakes traditional Jamaican Christmas and New Year cakes from home. Every
December the orders arrived by phone and text, and ended up in a spreadsheet that she had to
keep straight by hand. He asked if I could build her a proper website: somewhere customers
can choose their cakes and a collection date, and somewhere she can see what to bake each
day without fighting Excel.

This is that website. It takes real orders, costs a few pounds a month to run, and every
piece of it is defined in AWS CloudFormation.

## What it does

**For customers:** browse the cakes, choose a size and iced or un-iced, pick a collection
date and place the order. They get an email straight away saying it has been *received*,
and another when it is confirmed, ready to collect or cancelled. Payment is made in person
on collection, so the site never asks for card details.

**For the baker:** a private admin portal with MFA sign-in. It shows a dashboard of which
cakes to bake on which day, lets her confirm orders and record payments, change products,
prices, collection dates and the ordering deadline, and export orders to a tidy Excel file.

## How it's built

| Layer | Choice |
|---|---|
| Front end | Two React + Vite single-page apps (shop and admin) in a private S3 bucket behind CloudFront |
| API | API Gateway HTTP API and five small Lambda functions in TypeScript |
| Data | One DynamoDB table, with point-in-time recovery |
| Sign-in | Cognito, with MFA required and self sign-up switched off |
| Email | SES for customer emails, SNS for the baker's new-order alerts |
| Operations | CloudWatch alarms, a dead-letter queue, and an AWS Budget alert |
| Deploys | GitHub Actions with short-lived OIDC credentials, never stored keys. Each deploy shows a change set first |

The [architecture overview](docs/architecture.md) explains the design, and the
[decision log](docs/decisions.md) explains why it was built this way.

## No personal details in the code

The shop's name, the baker's name, email addresses and the domain are all deployment
parameters. They live in a GitHub environment secret, so this repository only holds
placeholders such as `Example Cake Co`, `Sam` and `example.co.uk`. The deploy refuses to run
if the names are missing, so the real site can never go out with placeholder branding.

## Run it yourself

```bash
npm ci && npm test                       # shared logic and backend tests
npm run dev:db                           # terminal 1: DynamoDB Local, seeded (see docs/application.md)
npm run dev:api                          # terminal 2: the Lambda handlers
npm run dev:shop                         # terminal 3: http://localhost:5173

pip install cfn-lint && scripts/validate.sh    # lint every template (no AWS needed)
cp infrastructure/cloudformation/parameters/dev.example.json \
   infrastructure/cloudformation/parameters/dev.json   # git-ignored: fill in your values
scripts/deploy.sh dev                    # build and show the change set
scripts/deploy.sh dev --execute          # apply it
```

Deploying creates AWS resources that cost money. Read
[docs/deployment.md](docs/deployment.md) and [docs/cost-estimates.md](docs/cost-estimates.md)
first.

## Repository layout

| Path | Contents |
|---|---|
| `frontend/shop`, `frontend/admin` | The customer shop and the admin portal |
| `backend/` | Lambda handlers and their tests |
| `shared/` | Pricing, validation and types used by both sides |
| `infrastructure/cloudformation/` | Every AWS resource, as plain CloudFormation |
| `scripts/` | Validate, deploy, status, seed and teardown scripts |
| `docs/` | Architecture, data model, security, costs and disaster recovery |
