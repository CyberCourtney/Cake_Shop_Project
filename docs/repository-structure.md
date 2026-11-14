# Proposed repository structure

> Phase 1 proposal. Only `docs/` exists so far. Everything else is created in later phases.

The brief's suggested layout is good. The changes below are small, and each one has a stated
reason. The repository root *is* the project, so there is no extra project folder.

```text
cake-shop/
├── README.md                         # What it is, architecture summary, quick start, links to docs
├── LICENSE                           # See Q20 (MIT suggested for a portfolio project)
├── .gitignore                        # node_modules, build output, *.local.json, parameters/*.json (not *.example.json)
├── .editorconfig
├── .nvmrc                            # Pins the Node version to match the Lambda runtime
├── package.json                      # npm workspaces root: shared scripts (lint, test, build)
├── tsconfig.base.json
│
├── frontend/
│   ├── shop/                         # Customer site (React + TypeScript + Vite)
│   │   ├── src/
│   │   ├── public/                   # Static images (optimised WebP/AVIF), favicon
│   │   ├── index.html
│   │   └── package.json
│   └── admin/                        # Admin portal (React + TypeScript + Vite), built to /admin/
│       ├── src/
│       └── package.json
│
├── shared/                           # CHANGED: one shared package used by frontend AND backend
│   ├── src/
│   │   ├── schemas.ts                # Zod schemas: order request, product, settings
│   │   ├── pricing.ts                # Pence arithmetic, order total calculation
│   │   ├── statuses.ts               # Status enums and allowed transitions
│   │   └── orderRef.ts
│   └── package.json
│
├── backend/
│   ├── functions/
│   │   ├── public-catalogue/
│   │   ├── public-create-order/
│   │   ├── admin-api/
│   │   ├── admin-export/
│   │   └── notifier/
│   │       ├── handler.ts
│   │       └── templates/            # Customer email HTML + text templates
│   ├── lib/                          # Backend-only helpers: DynamoDB client, logger with redaction, HTTP responses
│   ├── build.mjs                     # esbuild bundling: one zip per function
│   └── package.json
│
├── infrastructure/
│   └── cloudformation/
│       ├── README.md                 # Stack map, dependencies, parameters, commands
│       ├── bootstrap.yaml            # Artifacts bucket (eu-west-2, once per account)
│       ├── edge.yaml                 # ACM certificate (+ optional WAF), us-east-1
│       ├── main.yaml                 # Root stack (eu-west-2)
│       ├── nested/
│       │   ├── data.yaml
│       │   ├── auth.yaml
│       │   ├── messaging.yaml
│       │   ├── api.yaml
│       │   ├── frontend.yaml
│       │   └── monitoring.yaml
│       ├── parameters/
│       │   ├── dev.example.json      # Committed, with placeholder values
│       │   └── prod.example.json     # Real dev.json / prod.json are git-ignored
│       └── guard-rules/              # Optional cfn-guard policy rules
│
├── scripts/                          # ADDED: the deployment glue, so nothing is done by hand
│   ├── deploy.sh                     # validate → package → change set → deploy → upload site
│   ├── destroy.sh                    # Guarded teardown with backup prompt
│   ├── seed-catalogue.sh             # Loads the initial products and settings through the admin API
│   └── lib/
│
├── tests/
│   ├── unit/                         # Vitest: pricing, schemas, statuses, export workbook
│   ├── integration/                  # Lambda handlers against DynamoDB Local
│   ├── e2e/                          # Playwright: customer journey, admin journey, mobile viewports
│   └── TEST-LOG.md                   # Record of what was actually run, when, and the result
│
├── docs/
│   ├── README.md                     # Index of the docs
│   ├── architecture.md
│   ├── aws-services.md
│   ├── cloudformation-design.md
│   ├── data-model.md
│   ├── excel-export.md
│   ├── security.md                   # Including privacy and retention
│   ├── cost-estimates.md
│   ├── repository-structure.md
│   ├── delivery-plan.md
│   ├── open-questions.md
│   ├── brand-reference.md
│   ├── deployment.md                 # Phase 2
│   ├── operations-guide.md           # Phase 6: written for the baker, with screenshots
│   ├── disaster-recovery.md          # Phase 2, with the restore rehearsal in Phase 5
│   └── privacy-notice.md             # Source text for the website page (Phase 3)
│
└── .github/
    ├── workflows/
    │   └── ci.yml                    # lint, type-check, unit tests, cfn-lint (no AWS credentials needed)
    ├── dependabot.yml
    └── pull_request_template.md
```

## Changes from the brief's layout, and why

| Change | Reason |
|---|---|
| `frontend/` split into `shop/` and `admin/` | These are two separate bundles. The customer site never downloads admin code, and each can be built and tested on its own. |
| A top-level `shared/` package instead of `backend/shared/` | The validation schemas and price calculation are used by **both** the frontend and the backend. Keeping one copy means the browser and server can never disagree. |
| CloudFormation `templates/` + `nested-stacks/` became root templates + `nested/` | Same idea, flatter. The three top-level templates map one-to-one to the three deployed stacks. |
| An added `scripts/` folder | Deployment has a few steps CloudFormation cannot do itself: packaging, passing the ARN across regions, uploading the site, invalidating the cache. Scripting them makes "no undocumented manual steps" true. |
| An added `tests/TEST-LOG.md` | The brief says never to claim something was tested unless it was. A dated log of what was actually run makes that verifiable. |
| `.github/workflows/ci.yml` | CI that needs **no AWS credentials** (lint, unit tests, cfn-lint) runs on every PR. Deployment from GitHub Actions through OIDC is an optional later step, not part of the core plan. |
| npm workspaces | One `npm install` and one `npm test` for the whole repository |

## Branching and commits

- `main` is protected. It always holds a deployable state.
- Each phase is developed on a feature branch and merged with a PR that the operator reviews.
- Releases are tagged (for example `v0.2.0-infra`), so infrastructure can be rolled back to a
  known tag.
- No secrets, real email addresses, phone numbers or customer data are ever committed. The
  `.gitignore` and GitHub push protection enforce this.
