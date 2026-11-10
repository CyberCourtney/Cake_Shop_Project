#!/usr/bin/env bash
# Validate all CloudFormation templates. Creates nothing and costs nothing.
#   scripts/validate.sh            cfn-lint only (no AWS credentials needed)
#   scripts/validate.sh --aws      also run `aws cloudformation validate-template`
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

require_tools cfn-lint

log "cfn-lint (eu-west-2 templates, config: infrastructure/cloudformation/.cfnlintrc.yaml)"
(cd "$CFN_DIR" && cfn-lint)
log "cfn-lint (us-east-1 edge template)"
(cd "$CFN_DIR" && cfn-lint --regions "$EDGE_REGION" -- edge.yaml)

if [ "${1:-}" = "--aws" ]; then
  require_tools aws
  check_aws_identity
  for t in bootstrap.yaml main.yaml nested/*.yaml; do
    log "validate-template $t"
    aws cloudformation validate-template --region "$REGION" \
      --template-body "file://$CFN_DIR/$t" --query Description --output text >/dev/null
  done
  log "validate-template edge.yaml"
  aws cloudformation validate-template --region "$EDGE_REGION" \
    --template-body "file://$CFN_DIR/edge.yaml" --query Description --output text >/dev/null
fi

log "All templates valid."
