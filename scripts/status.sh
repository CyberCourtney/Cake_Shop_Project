#!/usr/bin/env bash
# Read-only health check for one environment: stack status, SNS subscription
# confirmations, DLQ depth and alarms in ALARM state. Changes nothing.
#   scripts/status.sh <dev|prod>
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

ENVIRONMENT="${1:-}"
[[ "$ENVIRONMENT" =~ ^(dev|prod)$ ]] || die "Usage: scripts/status.sh <dev|prod>"
require_tools aws jq
load_params "$ENVIRONMENT"
check_aws_identity
STACK="$(param ProjectName)-$ENVIRONMENT"

stack_exists "$STACK" "$REGION" || die "Stack $STACK does not exist."
log "Stack status: $(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)"
log "Site: $(stack_output "$STACK" "$REGION" SiteUrl)"

TOPIC="$(stack_output "$STACK" "$REGION" OrderTopicArn)"
log "Internal notification subscriptions (PendingConfirmation = email link not clicked yet):"
aws sns list-subscriptions-by-topic --region "$REGION" --topic-arn "$TOPIC" \
  --query 'Subscriptions[].[Endpoint,SubscriptionArn]' --output table

QUEUE_URL="$(aws sqs get-queue-url --region "$REGION" --queue-name "$(stack_output "$STACK" "$REGION" NotifierDlqName)" --query QueueUrl --output text)"
log "Notifier DLQ messages: $(aws sqs get-queue-attributes --region "$REGION" --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages --query Attributes.ApproximateNumberOfMessages --output text)"

log "Alarms currently in ALARM:"
aws cloudwatch describe-alarms --region "$REGION" --state-value ALARM \
  --alarm-name-prefix "$(param ProjectName)-$ENVIRONMENT-" --query 'MetricAlarms[].AlarmName' --output table
