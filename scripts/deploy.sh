#!/usr/bin/env bash
# Deploy (or update) one environment.
#
#   scripts/deploy.sh dev                 build, package, create a change set and SHOW it
#   scripts/deploy.sh dev --execute       ...and execute it after you confirm
#   scripts/deploy.sh prod --execute --rotate-origin-secret
#   scripts/deploy.sh prod --execute --yes   (CI: skip the typed confirmation; GitHub
#                                             environment reviewers approve instead)
#
# Steps (each is explained in docs/deployment.md):
#   1. validate templates (cfn-lint)
#   2. deploy/update the account bootstrap stack (artifacts bucket + budget)
#   3. deploy the us-east-1 edge stack, only if a domain or WAF is configured
#   4. build Lambda zips (placeholders until Phase 3) and upload them by content hash
#   5. package nested templates into the artifacts bucket
#   6. create a change set for the root stack and print it (with replacements highlighted)
#   7. with --execute: confirm, execute, wait
#   8. seed the catalogue (only adds missing items)
#   9. build and publish the shop and admin apps
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

ENVIRONMENT="${1:-}"; shift || true
[[ "$ENVIRONMENT" =~ ^(dev|prod)$ ]] || die "Usage: scripts/deploy.sh <dev|prod> [--execute] [--yes] [--rotate-origin-secret]"
EXECUTE=false; ROTATE_SECRET=false; ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE=true ;;
    --rotate-origin-secret) ROTATE_SECRET=true ;;
    --yes) ASSUME_YES=true ;;
    *) die "Unknown option: $arg" ;;
  esac
done

require_tools aws jq zip cfn-lint openssl git node npm
load_params "$ENVIRONMENT"
check_aws_identity

PROJECT="$(param ProjectName)"
BUSINESS_NAME="$(param BusinessDisplayName)"
# The shop's name and the baker's name come only from the parameters (the GitHub secret in
# CI), never from the code. Stop rather than publish a site with placeholder branding.
for key in ProjectName BusinessDisplayName BakerName; do
  [ -n "$(param "$key")" ] || die "$key is missing from $PARAMS_FILE (see parameters/$ENVIRONMENT.example.json)."
done
PROJECT_TAG="${BUSINESS_NAME// /}"
ROOT_STACK="$PROJECT-$ENVIRONMENT"
BOOTSTRAP_STACK="$PROJECT-bootstrap"
EDGE_STACK="$PROJECT-$ENVIRONMENT-edge"
DOMAIN="$(param DomainName)"
ENABLE_WAF="$(param EnableWaf)"
# Stack tags. CloudFormation copies them onto every resource in the stack (and its nested
# stacks) that supports tags. Project and Environment are the cost allocation tags.
# Never put an email address or other personal data in a tag: tags are not secret.
read -r -a TAGS <<<"$(project_tags "$ENVIRONMENT" "$PROJECT_TAG")"
read -r -a SHARED_TAGS <<<"$(project_tags shared "$PROJECT_TAG")"
mkdir -p "$BUILD_DIR"

# --- 1. Validate --------------------------------------------------------------
"$REPO_ROOT/scripts/validate.sh"

# --- 2. Bootstrap (idempotent) --------------------------------------------------
log "Bootstrap stack $BOOTSTRAP_STACK"
aws cloudformation deploy --region "$REGION" \
  --stack-name "$BOOTSTRAP_STACK" \
  --template-file "$CFN_DIR/bootstrap.yaml" \
  --parameter-overrides "ProjectName=$PROJECT" "MonthlyBudgetUsd=$(param MonthlyBudgetUsd)" "BudgetAlertEmail=$(param OpsAlertEmail)" \
  --tags "${SHARED_TAGS[@]}" \
  --no-fail-on-empty-changeset
ARTIFACTS_BUCKET="$(stack_output "$BOOTSTRAP_STACK" "$REGION" ArtifactsBucketName)"

# --- 3. Edge stack (us-east-1), only when needed --------------------------------
CERTIFICATE_ARN=""; WEB_ACL_ARN=""
HOSTED_ZONE_ID="$(param HostedZoneId)"
if [ -n "$DOMAIN" ]; then
  # The hosted zone comes from the shared DNS stack (scripts/deploy-dns.sh) unless the
  # parameter file names one. The certificate and SES checks only pass once the registrar
  # points at that zone, and an undelegated domain would leave the edge stack waiting for
  # hours, so check the delegation first.
  if [ -z "$HOSTED_ZONE_ID" ]; then
    stack_exists "$PROJECT-dns" "$REGION" || die "DomainName is set but there is no $PROJECT-dns stack. Run scripts/deploy-dns.sh $DOMAIN --execute first."
    HOSTED_ZONE_ID="$(stack_output "$PROJECT-dns" "$REGION" HostedZoneId)"
  fi
  "$REPO_ROOT/scripts/deploy-dns.sh" "$DOMAIN" --check \
    || die "$DOMAIN is not delegated to Route 53 yet. Set the nameservers at the registrar and try again later."
fi
if [ -n "$DOMAIN" ] || [ "$ENABLE_WAF" = "true" ]; then
  log "Edge stack $EDGE_STACK in $EDGE_REGION (domain='${DOMAIN}', WAF=$ENABLE_WAF)"
  aws cloudformation deploy --region "$EDGE_REGION" \
    --stack-name "$EDGE_STACK" \
    --template-file "$CFN_DIR/edge.yaml" \
    --parameter-overrides "ProjectName=$PROJECT" "Environment=$ENVIRONMENT" \
      "DomainName=$DOMAIN" "HostedZoneId=$HOSTED_ZONE_ID" "EnableWaf=$ENABLE_WAF" \
    --tags "${TAGS[@]}" \
    --no-fail-on-empty-changeset
  [ -n "$DOMAIN" ] && CERTIFICATE_ARN="$(stack_output "$EDGE_STACK" "$EDGE_REGION" CertificateArn)"
  [ "$ENABLE_WAF" = "true" ] && WEB_ACL_ARN="$(stack_output "$EDGE_STACK" "$EDGE_REGION" WebAclArn)"
else
  log "No custom domain or WAF configured: skipping the us-east-1 edge stack (decision D2)."
fi

# --- 4. Lambda code -------------------------------------------------------------
FUNCTIONS=(public-catalogue public-create-order admin-api admin-export notifier)
LAMBDA_BUILD="$BUILD_DIR/lambda"
rm -rf "$LAMBDA_BUILD"; mkdir -p "$LAMBDA_BUILD"

if [ -f "$REPO_ROOT/backend/package.json" ]; then
  log "Installing dependencies and building the backend (npm workspaces)"
  (cd "$REPO_ROOT" && npm ci --no-audit --no-fund && npm test && npm run build -w backend)
  for fn in "${FUNCTIONS[@]}"; do
    [ -d "$REPO_ROOT/backend/dist/$fn" ] || die "backend/dist/$fn missing after build."
    (cd "$REPO_ROOT/backend/dist/$fn" && zip -qrX "$LAMBDA_BUILD/$fn.zip" .)
  done
else
  warn "backend/ not built yet (Phase 3). Deploying PLACEHOLDER functions that return 503."
  "$REPO_ROOT/scripts/lib/placeholder-lambdas.sh" "$LAMBDA_BUILD" "${FUNCTIONS[@]}"
fi

# Content-addressed version: unchanged code => same key => no Lambda update.
CODE_VERSION="$(cat "$LAMBDA_BUILD"/*.zip | openssl dgst -sha256 | awk '{print substr($NF,1,16)}')"
log "Uploading Lambda zips to s3://$ARTIFACTS_BUCKET/lambda/$CODE_VERSION/"
for fn in "${FUNCTIONS[@]}"; do
  aws s3 cp --region "$REGION" --only-show-errors "$LAMBDA_BUILD/$fn.zip" "s3://$ARTIFACTS_BUCKET/lambda/$CODE_VERSION/$fn.zip"
done

# --- 5. Package nested templates ------------------------------------------------
log "Packaging templates"
aws cloudformation package --region "$REGION" \
  --template-file "$CFN_DIR/main.yaml" \
  --s3-bucket "$ARTIFACTS_BUCKET" --s3-prefix "templates/$ENVIRONMENT" \
  --output-template-file "$BUILD_DIR/main.packaged.yaml" >/dev/null

# --- 6. Change set --------------------------------------------------------------
# A review-only run of a brand-new stack leaves it in REVIEW_IN_PROGRESS (it exists, but
# has no resources). That still needs a CREATE change set, not an UPDATE.
ROOT_STATUS="$(stack_status "$ROOT_STACK" "$REGION")"
case "$ROOT_STATUS" in
  ""|REVIEW_IN_PROGRESS) CHANGE_SET_TYPE=CREATE ;;
  ROLLBACK_COMPLETE)
    # The first create failed and was rolled back, so the stack holds no resources and
    # can only be deleted. Show why it failed. In dev, with --execute, clear it and retry.
    warn "$ROOT_STACK is in ROLLBACK_COMPLETE (its first create failed). Failure events, oldest first:"
    print_stack_failures "$ROOT_STACK" "$REGION" >&2
    if [ "$ENVIRONMENT" = dev ] && [ "$EXECUTE" = true ]; then
      log "Deleting the empty rolled-back $ROOT_STACK so it can be created again"
      aws cloudformation delete-stack --region "$REGION" --stack-name "$ROOT_STACK"
      aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$ROOT_STACK"
      CHANGE_SET_TYPE=CREATE
    else
      die "Fix the cause above, delete $ROOT_STACK (docs/deployment.md#8-troubleshooting), then deploy again."
    fi ;;
  *_IN_PROGRESS) die "$ROOT_STACK is busy ($ROOT_STATUS). Wait for it to finish, then deploy again." ;;
  *) CHANGE_SET_TYPE=UPDATE ;;
esac

PARAMS="$(cfn_params_json Environment ProjectName BusinessDisplayName BakerName AdminEmail SecondAdminEmail InternalNotificationEmails \
  OpsAlertEmail CognitoDomainPrefix LogRetentionDays CreateOrderReservedConcurrency DomainName HostedZoneId \
  CustomerEmailEnabled SesFromAddress)"
# HostedZoneId may have come from the DNS stack rather than the parameter file.
PARAMS="$(jq -c --arg z "$HOSTED_ZONE_ID" 'map(select(.ParameterKey != "HostedZoneId")) + [{ParameterKey:"HostedZoneId",ParameterValue:$z}]' <<<"$PARAMS")"
PARAMS="$(jq -c --arg b "$ARTIFACTS_BUCKET" --arg v "$CODE_VERSION" --arg c "$CERTIFICATE_ARN" --arg w "$WEB_ACL_ARN" \
  '. + [{ParameterKey:"ArtifactsBucketName",ParameterValue:$b},{ParameterKey:"CodeVersion",ParameterValue:$v},
        {ParameterKey:"CertificateArn",ParameterValue:$c},{ParameterKey:"WebAclArn",ParameterValue:$w}]' <<<"$PARAMS")"

# The origin-verify secret is generated once and kept on updates (UsePreviousValue),
# so a deploy does not force a slow CloudFront update. It never touches disk or git.
if [ "$CHANGE_SET_TYPE" = CREATE ] || [ "$ROTATE_SECRET" = true ]; then
  [ "$ROTATE_SECRET" = true ] && log "Rotating the origin-verify secret"
  SECRET="$(openssl rand -hex 32)"
  PARAMS="$(jq -c --arg s "$SECRET" '. + [{ParameterKey:"OriginVerifySecret",ParameterValue:$s}]' <<<"$PARAMS")"
  unset SECRET
else
  PARAMS="$(jq -c '. + [{ParameterKey:"OriginVerifySecret",UsePreviousValue:true}]' <<<"$PARAMS")"
fi

# The table and user pool are retained by design, so a failed first create (which rolls
# back) leaves them behind, and the next create fails CloudFormation's early validation
# ("ResourceExistenceCheck"). In dev only, with --execute, remove leftovers that no stack
# owns. The table is removed only if it is empty. Prod never does this: see
# docs/disaster-recovery.md for importing a retained table instead.
if [ "$CHANGE_SET_TYPE" = CREATE ] && [ "$ENVIRONMENT" = dev ] && [ "$EXECUTE" = true ]; then
  TABLE="$PROJECT-$ENVIRONMENT-main"
  if aws dynamodb describe-table --region "$REGION" --table-name "$TABLE" >/dev/null 2>&1; then
    ITEMS="$(aws dynamodb scan --region "$REGION" --table-name "$TABLE" --select COUNT --max-items 1 --query Count --output text)"
    [ "$ITEMS" = 0 ] || die "Leftover table $TABLE is not empty. Not deleting it. See docs/disaster-recovery.md."
    log "Removing the empty leftover table $TABLE from an earlier failed create"
    aws dynamodb delete-table --region "$REGION" --table-name "$TABLE" >/dev/null
    aws dynamodb wait table-not-exists --region "$REGION" --table-name "$TABLE"
  fi
  for POOL in $(aws cognito-idp list-user-pools --region "$REGION" --max-results 60 \
      --query "UserPools[?Name=='$PROJECT-$ENVIRONMENT-admins'].Id" --output text); do
    log "Removing the leftover dev user pool $POOL from an earlier failed create"
    POOL_DOMAIN="$(aws cognito-idp describe-user-pool --region "$REGION" --user-pool-id "$POOL" \
      --query UserPool.Domain --output text)"
    if [ -n "$POOL_DOMAIN" ] && [ "$POOL_DOMAIN" != None ]; then
      aws cognito-idp delete-user-pool-domain --region "$REGION" --user-pool-id "$POOL" --domain "$POOL_DOMAIN"
    fi
    aws cognito-idp delete-user-pool --region "$REGION" --user-pool-id "$POOL"
  done
fi

CHANGE_SET="deploy-$(date -u +%Y%m%d-%H%M%S)"
CHANGE_SET_TAGS=()
for t in "${TAGS[@]}"; do CHANGE_SET_TAGS+=("Key=${t%%=*},Value=${t#*=}"); done
log "Creating $CHANGE_SET_TYPE change set $CHANGE_SET for $ROOT_STACK"
aws cloudformation create-change-set --region "$REGION" \
  --stack-name "$ROOT_STACK" --change-set-name "$CHANGE_SET" --change-set-type "$CHANGE_SET_TYPE" \
  --template-body "file://$BUILD_DIR/main.packaged.yaml" \
  --parameters "$PARAMS" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --include-nested-stacks \
  --tags "${CHANGE_SET_TAGS[@]}" >/dev/null
unset PARAMS

if ! aws cloudformation wait change-set-create-complete --region "$REGION" \
      --stack-name "$ROOT_STACK" --change-set-name "$CHANGE_SET" 2>/dev/null; then
  REASON="$(aws cloudformation describe-change-set --region "$REGION" --stack-name "$ROOT_STACK" \
    --change-set-name "$CHANGE_SET" --query StatusReason --output text)"
  if [[ "$REASON" == *"didn't contain changes"* || "$REASON" == *"No updates"* ]]; then
    log "No infrastructure changes."
    aws cloudformation delete-change-set --region "$REGION" --stack-name "$ROOT_STACK" --change-set-name "$CHANGE_SET"
    NO_CHANGES=true
  else
    # A nested change set's reason only names the nested change set. Follow the chain
    # down to the reason that names the actual problem.
    DETAIL="$REASON"
    for _ in 1 2 3; do
      NESTED_CS="$(grep -o 'arn:aws:cloudformation:[^ ]*:changeSet/[^ ]*' <<<"$DETAIL" | head -1 || true)"
      [ -n "$NESTED_CS" ] || break
      DETAIL="$(aws cloudformation describe-change-set --region "$REGION" --change-set-name "$NESTED_CS" \
        --query StatusReason --output text 2>/dev/null || true)"
      warn "Nested change set ${NESTED_CS##*/}: $DETAIL"
    done
    die "Change set failed: $REASON"
  fi
fi

if [ "${NO_CHANGES:-false}" != true ]; then
  log "Proposed changes (root stack; nested stacks are listed by the console/CLI separately):"
  aws cloudformation describe-change-set --region "$REGION" --stack-name "$ROOT_STACK" --change-set-name "$CHANGE_SET" \
    --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table
  for nested in $(aws cloudformation describe-change-set --region "$REGION" --stack-name "$ROOT_STACK" \
        --change-set-name "$CHANGE_SET" --query 'Changes[].ResourceChange.ChangeSetId' --output text | tr '\t' '\n' | grep -v None); do
    aws cloudformation describe-change-set --region "$REGION" --change-set-name "$nested" \
      --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table
    if aws cloudformation describe-change-set --region "$REGION" --change-set-name "$nested" \
         --query "Changes[?ResourceChange.Replacement=='True'].ResourceChange.ResourceType" --output text \
         | grep -Eq 'DynamoDB::Table|Cognito::UserPool\b|SNS::Topic'; then
      warn "This change set REPLACES a DynamoDB table, Cognito user pool or SNS topic. Stop and read docs/deployment.md#replacements."
    fi
  done

  if [ "$EXECUTE" != true ]; then
    log "Change set left for review. Run again with --execute, or execute it in the console."
    exit 0
  fi
  if [ "$ENVIRONMENT" = prod ] && [ "$ASSUME_YES" != true ]; then
    confirm "Type 'prod' to deploy these changes to PRODUCTION:" prod
  fi
  log "Executing $CHANGE_SET (this can take 5-15 minutes on first create - CloudFront is slow)"
  aws cloudformation execute-change-set --region "$REGION" --stack-name "$ROOT_STACK" --change-set-name "$CHANGE_SET"
  if [ "$CHANGE_SET_TYPE" = CREATE ]; then
    WAIT="stack-create-complete"
  else
    WAIT="stack-update-complete"
  fi
  if ! aws cloudformation wait "$WAIT" --region "$REGION" --stack-name "$ROOT_STACK"; then
    warn "Deploy of $ROOT_STACK failed. Failure events, oldest first (the first one is usually the cause):"
    print_stack_failures "$ROOT_STACK" "$REGION" >&2
    die "Stack status: $(stack_status "$ROOT_STACK" "$REGION"). See docs/deployment.md#8-troubleshooting."
  fi
  log "Stack $ROOT_STACK is up to date."
fi

# --- 8. Seed data ---------------------------------------------------------------
# Adds the starting catalogue, settings, season and dates if they are missing. Every write
# is conditional, so nothing the baker has changed in the admin portal is ever overwritten.
if [ -f "$REPO_ROOT/scripts/seed-catalogue.mjs" ] && [ -d "$REPO_ROOT/node_modules" ]; then
  log "Seeding anything missing from the catalogue"
  (cd "$REPO_ROOT" && node scripts/seed-catalogue.mjs --table "$(stack_output "$ROOT_STACK" "$REGION" TableName)")
fi

# --- 9. Frontend -----------------------------------------------------------------
if [ -x "$REPO_ROOT/scripts/publish-frontend.sh" ]; then
  "$REPO_ROOT/scripts/publish-frontend.sh" "$ENVIRONMENT"
else
  log "No publish script - skipping the website."
fi

log "Site: $(stack_output "$ROOT_STACK" "$REGION" SiteUrl)"
if [ "$CHANGE_SET_TYPE" = CREATE ]; then
  cat <<EOF

Next steps after a first deploy (docs/deployment.md#after-the-first-deploy):
  1. Every internal notification address and the ops address get an
     "AWS Notification - Subscription Confirmation" email. Click Confirm in each.
  2. The admin receives a Cognito email with a temporary password.
  3. Check subscriptions:  scripts/status.sh $ENVIRONMENT
EOF
fi
