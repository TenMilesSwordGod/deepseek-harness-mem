#!/usr/bin/env bash
# Quick deploy for simplemem into a DeepSeek Harness profile.
#
# Usage:
#   ./scripts/quick-deploy.sh [profile-dir]     # default: ~/.dsh/profiles/web
#
# What it does (idempotent — safe to re-run):
#   1. builds the TypeScript sources when lib/ artifacts are missing
#   2. adds both packages to the profile's package.json dependencies (file:)
#   3. registers the `mem` + `ui-mem` rows in the profile's cordis.patch.yml
#   4. runs pnpm install (CUDA binaries skipped; they are unused)
#
# You still need to restart `dsh web` ONCE after the first deploy, then
# refresh the GUI and click 记忆 in the top-right corner. No further
# restarts are ever needed (see README "Developing without restarting").
set -euo pipefail

PROFILE_DIR="${1:-$HOME/.dsh/profiles/web}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$PROFILE_DIR/package.json" ]]; then
  echo "error: $PROFILE_DIR/package.json not found — pass your profile dir, e.g.:" >&2
  echo "  $0 ~/.dsh/profiles/web" >&2
  exit 1
fi

MEM_PKG="file:$REPO_DIR/packages/mem"
UI_PKG="file:$REPO_DIR/packages/client/ui-mem"

echo "==> profile:  $PROFILE_DIR"
echo "==> packages: $MEM_PKG"
echo "==>           $UI_PKG"

# 0. build from TypeScript when artifacts are missing (repo ships sources only)
if [[ ! -f "$REPO_DIR/packages/mem/lib/index.js" || ! -f "$REPO_DIR/packages/client/ui-mem/lib/client.js" ]]; then
  echo "==> building from TypeScript sources (first run downloads dev dependencies)..."
  if [[ ! -d "$REPO_DIR/node_modules" ]]; then
    (cd "$REPO_DIR" && corepack pnpm install)
  fi
  (cd "$REPO_DIR" && ./node_modules/.bin/tsc -p packages/mem/tsconfig.json && node packages/client/ui-mem/scripts/build-client.mjs)
else
  echo "==> lib/ artifacts present, skipping build"
fi

# 1. package.json dependencies (JSON edit via node)
node - "$PROFILE_DIR/package.json" "$MEM_PKG" "$UI_PKG" <<'NODE'
const fs = require('node:fs')
const [file, memPkg, uiPkg] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
pkg.dependencies ??= {}
let changed = false
if (pkg.dependencies['@deepseek-ai/dsh-simplemem'] !== memPkg) {
  pkg.dependencies['@deepseek-ai/dsh-simplemem'] = memPkg
  changed = true
}
if (pkg.dependencies['@deepseek-ai/dsh-client-ui-simplemem'] !== uiPkg) {
  pkg.dependencies['@deepseek-ai/dsh-client-ui-simplemem'] = uiPkg
  changed = true
}
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`    package.json ${changed ? 'updated' : 'unchanged'}`)
NODE

# 2. cordis.patch.yml rows (idempotent marker)
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
BLOCK='# simplemem: SQLite-backed semantic memory (host service + tools)
# and the top-right header widget (client UI plugin).
- insert:
    - id: mem
      name: '"'"'@deepseek-ai/dsh-simplemem'"'"'
      config:
        embeddingModel: Xenova/nomic-embed-text-v1
        embeddingDimensions: 768
        warmupOnBoot: false
    - id: ui-mem
      name: '"'"'@deepseek-ai/dsh-client-ui-simplemem'"'"''

node - "$PATCH_FILE" "$BLOCK" <<'NODE'
const fs = require('node:fs')
const [file, block] = process.argv.slice(2)
let text = fs.readFileSync(file, 'utf8')
const hasBlock = text.includes('simplemem:')
// Always drop a standalone empty-array root line (`[]` ends the YAML
// document; appending after it is invalid). This also self-heals files
// broken by earlier script versions.
const lines = text.split('\n')
const idx = lines.findIndex((line) => /^\[\]\s*$/.test(line))
if (idx !== -1) {
  text = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n')
}
if (hasBlock) {
  fs.writeFileSync(file, text)
  console.log('    cordis.patch.yml unchanged (rows already present; stray [] line removed)')
} else {
  fs.writeFileSync(file, `${text.replace(/\s+$/, '')}\n\n${block}\n`)
  console.log('    cordis.patch.yml updated')
}
NODE

# 3. install (skip unused CUDA binaries of onnxruntime-node)
if command -v pnpm >/dev/null 2>&1; then
  PNPM=pnpm
else
  PNPM="corepack pnpm"
fi
echo "==> installing profile dependencies (first run downloads @huggingface/transformers)..."
(cd "$PROFILE_DIR" && ONNXRUNTIME_NODE_INSTALL_CUDA=skip $PNPM install)

cat <<'DONE'

==> done. Finish the deployment:
  1. restart `dsh web` once (new packages need one restart)
  2. open the web GUI and refresh the page
  3. click 记忆 in the top-right corner

Optional: pre-download models for offline first use, see README.md
("Install into a harness profile", step 5).
DONE
