#!/usr/bin/env bash
# Create or update the shared DNS stack (Route 53 hosted zone + email forwarding records),
# then report whether the registrar already points at it.
#
#   scripts/deploy-dns.sh example.co.uk             show the change set only
#   scripts/deploy-dns.sh example.co.uk --execute   apply it
#   scripts/deploy-dns.sh example.co.uk --check     only check the nameservers
#
# PROJECT_NAME (default kvc) is the resource prefix, so the stack is <prefix>-dns.
# PROJECT_TAG sets the Project tag; by default the existing stack's tag is kept.
#
# EMAIL_FORWARDING=improvmx adds the ImprovMX inbound records (default: none, so the
# domain receives no mail). The hosted zone costs about US$0.50 a month. See docs/deployment.md#6-the-domain.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

DOMAIN="${1:-}"; shift || true
[[ "$DOMAIN" =~ ^([a-z0-9-]+\.)+[a-z]{2,}$ ]] || die "Usage: scripts/deploy-dns.sh <domain> [--execute|--check]"
MODE=review
for arg in "$@"; do
  case "$arg" in
    --execute) MODE=execute ;;
    --check) MODE=check ;;
    *) die "Unknown option: $arg" ;;
  esac
done

require_tools aws dig
check_aws_identity
PROJECT_NAME="${PROJECT_NAME:-kvc}"
DNS_STACK="$PROJECT_NAME-dns"
if [ -z "${PROJECT_TAG:-}" ]; then
  PROJECT_TAG="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$DNS_STACK" \
    --query "Stacks[0].Tags[?Key=='Project'].Value | [0]" --output text 2>/dev/null || true)"
  [ -n "$PROJECT_TAG" ] && [ "$PROJECT_TAG" != None ] || PROJECT_TAG="CakeShop"
fi
read -r -a DNS_TAGS <<<"$(project_tags shared "$PROJECT_TAG")"

if [ "$MODE" != check ]; then
  require_tools cfn-lint
  (cd "$CFN_DIR" && cfn-lint --regions "$REGION" -- dns.yaml)
  args=(--region "$REGION" --stack-name "$DNS_STACK" --template-file "$CFN_DIR/dns.yaml"
        --parameter-overrides "ProjectName=$PROJECT_NAME" "DomainName=$DOMAIN" "EmailForwarding=${EMAIL_FORWARDING:-none}"
        --tags "${DNS_TAGS[@]}"
        --no-fail-on-empty-changeset)
  if [ "$MODE" = review ]; then
    log "Change set for $DNS_STACK (review only, nothing is applied)"
    aws cloudformation deploy "${args[@]}" --no-execute-changeset
    exit 0
  fi
  log "Deploying $DNS_STACK"
  aws cloudformation deploy "${args[@]}"
fi

stack_exists "$DNS_STACK" "$REGION" || die "$DNS_STACK does not exist yet. Run with --execute first."
[ "$(stack_output "$DNS_STACK" "$REGION" DomainName)" = "$DOMAIN" ] \
  || die "$DNS_STACK manages a different domain ($(stack_output "$DNS_STACK" "$REGION" DomainName))."
ZONE_ID="$(stack_output "$DNS_STACK" "$REGION" HostedZoneId)"
EXPECTED="$(stack_output "$DNS_STACK" "$REGION" NameServers | tr ',' '\n' | sed 's/\.$//' | tr '[:upper:]' '[:lower:]' | sort)"
log "Hosted zone $ZONE_ID. Set these nameservers at the registrar:"
awk '{print "      " $0}' <<<"$EXPECTED"

# Ask the parent zone (co.uk) directly, so a cached answer cannot hide the change.
PARENT="${DOMAIN#*.}"
PARENT_NS="$(dig +short NS "$PARENT" | head -1)"
ACTUAL="$(dig +norecurse NS "$DOMAIN" "@${PARENT_NS}" +noall +authority +answer 2>/dev/null \
  | awk '$4 == "NS" {print $5}' | sed 's/\.$//' | tr '[:upper:]' '[:lower:]' | sort -u || true)"
if [ "$EXPECTED" = "$ACTUAL" ]; then
  log "Delegation OK: $DOMAIN points at the Route 53 zone. The prod deploy can go ahead."
else
  warn "$DOMAIN does not point at the Route 53 zone yet. It currently answers with:"
  awk '{print "      " $0}' <<<"${ACTUAL:-(nothing)}" >&2
  # Only a check fails here: after --execute, waiting for the registrar is expected.
  if [ "$MODE" = check ]; then exit 2; fi
fi
