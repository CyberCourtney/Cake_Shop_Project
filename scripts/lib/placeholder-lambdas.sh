#!/usr/bin/env bash
# Writes placeholder Lambda zips so the infrastructure can be deployed and tested before
# the real backend exists (Phase 3 replaces these). API functions answer 503; the
# notifier acknowledges every record without doing anything.
#   placeholder-lambdas.sh <output-dir> <function-name>...
set -euo pipefail
OUT="$1"; shift
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

for fn in "$@"; do
  mkdir -p "$WORK/$fn"
  if [ "$fn" = notifier ]; then
    cat > "$WORK/$fn/index.mjs" <<'EOF'
// PLACEHOLDER (Phase 2). Replaced by the real notifier in Phase 3/4.
export const handler = async (event) => {
  console.log(JSON.stringify({ msg: "placeholder notifier", records: event.Records?.length ?? 0 }));
  return { batchItemFailures: [] };
};
EOF
  else
    cat > "$WORK/$fn/index.mjs" <<'EOF'
// PLACEHOLDER (Phase 2). Replaced by the real handler in Phase 3.
export const handler = async () => ({
  statusCode: 503,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify({ message: "Not implemented yet." }),
});
EOF
  fi
  (cd "$WORK/$fn" && touch -t 202601010000 index.mjs && zip -qX "$OUT/$fn.zip" index.mjs)
done
