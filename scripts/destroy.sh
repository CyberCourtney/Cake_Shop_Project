#!/usr/bin/env bash
# Tear down one environment's root stack. Guarded and deliberately verbose.
#
#   scripts/destroy.sh dev
#   scripts/destroy.sh prod --i-have-exported-the-orders
#
# What happens:
#   1. (prod) an on-demand DynamoDB backup is taken first
#   2. the site bucket is emptied (all versions) so CloudFormation can delete it
#   3. the root stack and all nested stacks are deleted
#   4. RETAINED resources (DynamoDB table, Cognito user pool) are listed with the exact
#      commands to delete them - this script never deletes customer data itself
# The bootstrap stack and the us-east-1 edge stack are left alone (see docs/deployment.md#teardown).
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

ENVIRONMENT="${1:-}"
[[ "$ENVIRONMENT" =~ ^(dev|prod)$ ]] || die "Usage: scripts/destroy.sh <dev|prod> [--i-have-exported-the-orders]"
if [ "$ENVIRONMENT" = prod ] && [ "${2:-}" != "--i-have-exported-the-orders" ]; then
  die "For prod, export the orders to Excel first (admin portal), then re-run with --i-have-exported-the-orders."
fi

require_tools aws jq
load_params "$ENVIRONMENT"
check_aws_identity
STACK="$(param ProjectName)-$ENVIRONMENT"
stack_exists "$STACK" "$REGION" || die "Stack $STACK does not exist in $REGION."

TABLE="$(stack_output "$STACK" "$REGION" TableName)"
USER_POOL="$(stack_output "$STACK" "$REGION" UserPoolId)"
BUCKET="$(stack_output "$STACK" "$REGION" SiteBucketName)"

warn "This deletes the $ENVIRONMENT website, API, functions, topics and alarms."
warn "The table $TABLE and user pool $USER_POOL are RETAINED and must be deleted separately."
confirm "Type the environment name ($ENVIRONMENT) to continue:" "$ENVIRONMENT"

if [ "$ENVIRONMENT" = prod ]; then
  BACKUP="$TABLE-before-destroy-$(date -u +%Y%m%d-%H%M%S)"
  log "Creating on-demand backup $BACKUP"
  aws dynamodb create-backup --region "$REGION" --table-name "$TABLE" --backup-name "$BACKUP" \
    --query BackupDetails.BackupArn --output text
fi

log "Emptying s3://$BUCKET (all object versions)"
while true; do
  BATCH="$(aws s3api list-object-versions --region "$REGION" --bucket "$BUCKET" --max-items 500 --output json \
    | jq -c '{Objects: ([(.Versions // [])[], (.DeleteMarkers // [])[]] | map({Key, VersionId})), Quiet: true}')"
  [ "$(jq '.Objects | length' <<<"$BATCH")" -eq 0 ] && break
  aws s3api delete-objects --region "$REGION" --bucket "$BUCKET" --delete "$BATCH" >/dev/null
done

log "Deleting stack $STACK (CloudFront deletion can take 10+ minutes)"
aws cloudformation delete-stack --region "$REGION" --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --region "$REGION" --stack-name "$STACK"
log "Stack deleted."

cat <<EOF

Retained on purpose (customer data / identities). Delete ONLY when you are sure:

  # DynamoDB table (prod has deletion protection - turn it off first)
  aws dynamodb update-table --region $REGION --table-name $TABLE --no-deletion-protection-enabled
  aws dynamodb delete-table --region $REGION --table-name $TABLE

  # Cognito user pool (prod has deletion protection - turn it off first)
  aws cognito-idp update-user-pool --region $REGION --user-pool-id $USER_POOL --deletion-protection INACTIVE
  aws cognito-idp delete-user-pool --region $REGION --user-pool-id $USER_POOL

  # (The sign-in domain, app client and admin user were deleted with the stack.)
  # Note: update-user-pool resets settings not passed on the command line; that does not
  # matter when the next step deletes the pool.

Re-deploying this environment while the retained table still exists will fail with
"already exists" - see docs/deployment.md#redeploying-after-a-teardown.
EOF
