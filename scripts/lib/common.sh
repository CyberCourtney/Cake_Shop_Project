#!/usr/bin/env bash
# Shared helpers for deploy.sh / destroy.sh / validate.sh. Sourced, not executed.
set -euo pipefail

# Variables below are used by the scripts that source this file.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CFN_DIR="$REPO_ROOT/infrastructure/cloudformation"
# shellcheck disable=SC2034
BUILD_DIR="$REPO_ROOT/.build"
REGION="eu-west-2"
# shellcheck disable=SC2034
EDGE_REGION="us-east-1"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARNING:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require_tools() {
  local missing=()
  for tool in "$@"; do command -v "$tool" >/dev/null 2>&1 || missing+=("$tool"); done
  [ ${#missing[@]} -eq 0 ] || die "Missing tools: ${missing[*]} (see docs/deployment.md#prerequisites)"
}

# Reads infrastructure/cloudformation/parameters/<env>.json (git-ignored).
load_params() {
  local env="$1"
  PARAMS_FILE="$CFN_DIR/parameters/$env.json"
  [ -f "$PARAMS_FILE" ] || die "No $PARAMS_FILE. Copy $env.example.json to $env.json and fill it in."
  jq -e . "$PARAMS_FILE" >/dev/null || die "$PARAMS_FILE is not valid JSON."
  [ "$(param Environment)" = "$env" ] || die "Environment in $PARAMS_FILE must be \"$env\"."
  if grep -q 'CHANGE-ME\|example\.com\|example\.co\.uk' "$PARAMS_FILE"; then
    die "$PARAMS_FILE still contains placeholder values (CHANGE-ME / example.com / example.co.uk)."
  fi
}

# The repository ("owner/name") this checkout belongs to. Used for the Owner and
# Repository tags, so no account or person is named in the code. GitHub Actions sets
# GITHUB_REPOSITORY; locally it is read from the origin remote.
repo_slug() {
  if [ -n "${GITHUB_REPOSITORY:-}" ]; then printf '%s\n' "$GITHUB_REPOSITORY"; return; fi
  git -C "$REPO_ROOT" config --get remote.origin.url 2>/dev/null \
    | sed -E 's#^.*github\.com[:/]##; s#\.git$##' | grep -E '^[^/]+/[^/]+$' || echo "unknown/unknown"
}

# project_tags <Environment tag> <Project tag> -> the standard stack tags, space-separated
# (read them with `read -r -a`; no value contains a space).
# Never put an email address or other personal data in a tag: tags are not secret.
project_tags() {
  local slug; slug="$(repo_slug)"
  echo "Project=${2// /} Environment=$1 Owner=${slug%%/*} ManagedBy=CloudFormation Repository=$slug"
}

# param <Key> -> value from the params file ("" if absent)
param() { jq -r --arg k "$1" '.[$k] // ""' "$PARAMS_FILE"; }

# cfn_params_json <Key>... -> [{"ParameterKey":..,"ParameterValue":..}] for the given keys
cfn_params_json() {
  jq -c --args '[ . as $p | $ARGS.positional[] | select($p[.] != null) | {ParameterKey: ., ParameterValue: ($p[.] | tostring)} ]' "$@" < "$PARAMS_FILE"
}

stack_exists() { # stack_exists <name> <region>
  aws cloudformation describe-stacks --stack-name "$1" --region "$2" >/dev/null 2>&1
}

stack_status() { # stack_status <name> <region>  -> status, or empty if the stack does not exist
  aws cloudformation describe-stacks --stack-name "$1" --region "$2" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true
}

# Print every *_FAILED event of a stack and of its nested stacks, oldest first, so the
# real cause (the first failure) is visible in the log. Email addresses are masked,
# because CI logs are readable by anyone with access to the repository.
print_stack_failures() { # print_stack_failures <stack name or id> <region>
  local stack="$1" region="$2" nested
  aws cloudformation describe-stack-events --stack-name "$stack" --region "$region" \
    --query "StackEvents[?ends_with(ResourceStatus, '_FAILED')].[Timestamp, StackName, LogicalResourceId, ResourceType, ResourceStatus, ResourceStatusReason]" \
    --output text 2>/dev/null | sort | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g' || true
  for nested in $(aws cloudformation describe-stack-events --stack-name "$stack" --region "$region" \
      --query "StackEvents[?ResourceType=='AWS::CloudFormation::Stack' && PhysicalResourceId!=StackId && PhysicalResourceId!=''].PhysicalResourceId" \
      --output text 2>/dev/null | tr '\t' '\n' | sort -u); do
    print_stack_failures "$nested" "$region"
  done
}

stack_output() { # stack_output <name> <region> <OutputKey>
  aws cloudformation describe-stacks --stack-name "$1" --region "$2" \
    --query "Stacks[0].Outputs[?OutputKey=='$3'].OutputValue | [0]" --output text
}

check_aws_identity() {
  local account
  account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" \
    || die "AWS credentials not configured (run: aws configure sso / aws sso login)."
  log "AWS account: $account   region: $REGION"
  # shellcheck disable=SC2034
  ACCOUNT_ID="$account"
}

confirm() { # confirm "<prompt>" <expected answer>
  local answer
  read -r -p "$1 " answer
  [ "$answer" = "$2" ] || die "Cancelled."
}
