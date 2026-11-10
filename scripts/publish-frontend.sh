#!/usr/bin/env bash
# Build and publish the website to an environment's private S3 bucket, then refresh CloudFront.
#
#   scripts/publish-frontend.sh dev
#
# The bucket holds one site: the shop at / and the admin portal under /admin/. Both are
# assembled into .build/site first and synced in one go, so --delete never removes one
# app while publishing the other. A small runtime config.json (Cognito details, which are
# not secret) is written next to each app, so the same build works in dev and prod.
# No CloudFormation is involved; deploy.sh calls this after a successful deploy.
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

ENVIRONMENT="${1:-}"
[[ "$ENVIRONMENT" =~ ^(dev|prod)$ ]] || die "Usage: scripts/publish-frontend.sh <dev|prod>"
require_tools aws jq npm

# The parameter file names the stack and carries the branding (shop and baker names),
# which is baked into the build, so the code itself names no one.
load_params "$ENVIRONMENT"
ROOT_STACK="$(param ProjectName)-$ENVIRONMENT"
VITE_BUSINESS_NAME="$(param BusinessDisplayName)"
VITE_BAKER_NAME="$(param BakerName)"
[ -n "$VITE_BUSINESS_NAME" ] && [ -n "$VITE_BAKER_NAME" ] \
  || die "BusinessDisplayName and BakerName must be set in $PARAMS_FILE."
export VITE_BUSINESS_NAME VITE_BAKER_NAME

BUCKET="$(stack_output "$ROOT_STACK" "$REGION" SiteBucketName)"
DISTRIBUTION="$(stack_output "$ROOT_STACK" "$REGION" DistributionId)"
[ -n "$BUCKET" ] && [ "$BUCKET" != None ] || die "No SiteBucketName output on $ROOT_STACK. Deploy the stack first."

log "Building the shop and admin apps"
(cd "$REPO_ROOT" && [ -d node_modules ] || npm ci --no-audit --no-fund)
(cd "$REPO_ROOT" && npm run build -w frontend/shop && npm run build -w frontend/admin)

SITE="$BUILD_DIR/site"
rm -rf "$SITE"; mkdir -p "$SITE/admin"
cp -R "$REPO_ROOT/frontend/shop/dist/." "$SITE/"
cp -R "$REPO_ROOT/frontend/admin/dist/." "$SITE/admin/"
# Source maps help debugging but are not needed by visitors.
find "$SITE" -name '*.map' -delete

jq -n \
  --arg domain "$(stack_output "$ROOT_STACK" "$REGION" CognitoDomain)" \
  --arg client "$(stack_output "$ROOT_STACK" "$REGION" AdminAppClientId)" \
  --arg env "$ENVIRONMENT" \
  '{environment: $env, cognitoDomain: $domain, clientId: $client}' > "$SITE/admin/config.json"

log "Publishing to s3://$BUCKET/"
# Files in assets/ have a content hash in their name, so they can be cached for a year.
# Everything else (HTML, config.json, favicon) is revalidated on every visit.
aws s3 sync "$SITE/" "s3://$BUCKET/" --region "$REGION" --only-show-errors \
  --exclude "*" --include "assets/*" --include "admin/assets/*" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync "$SITE/" "s3://$BUCKET/" --region "$REGION" --only-show-errors \
  --exclude "assets/*" --exclude "admin/assets/*" --cache-control "no-cache"
# Remove files from older builds last, so visitors mid-page never hit a missing file.
aws s3 sync "$SITE/" "s3://$BUCKET/" --region "$REGION" --only-show-errors --delete --size-only

log "Refreshing CloudFront ($DISTRIBUTION)"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query Invalidation.Id --output text >/dev/null
log "Published. It can take a minute or two to appear everywhere."
