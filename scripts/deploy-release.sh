#!/usr/bin/env bash
# Deploy a simplemem GitHub Release into a DeepSeek Harness profile —
# downloads the prebuilt .tgz artifacts, installs them, and registers the
# plugin rows. No Node toolchain or build needed on this machine (only pnpm
# for the profile install, and network access to github.com).
#
# Usage:
#   ./scripts/deploy-release.sh [version] [profile-dir]
#     version      release tag to deploy; default = latest GitHub release
#     profile-dir  profile to install into; default ~/.dsh/profiles/web
#
# After the first deploy, restart `dsh web` ONCE, refresh the GUI, and click
# 记忆 in the top-right corner.
set -euo pipefail

REPO="TenMilesSwordGod/simplemem"
VERSION="${1:-}"
PROFILE_DIR="${2:-$HOME/.dsh/profiles/web}"
DIST_DIR="$HOME/.dsh/storages/simplemem-dist"
MEM_TGZ="$DIST_DIR/dsh-simplemem.tgz"
UI_TGZ="$DIST_DIR/dsh-client-ui-simplemem.tgz"

if [[ ! -f "$PROFILE_DIR/package.json" ]]; then
  echo "error: $PROFILE_DIR/package.json not found — pass your profile dir, e.g.:" >&2
  echo "  $0 latest ~/.dsh/profiles/web" >&2
  exit 1
fi

if [[ -z "$VERSION" || "$VERSION" == "latest" ]]; then
  echo "==> resolving latest release tag..."
  VERSION=$(curl -sL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')
  if [[ -z "$VERSION" ]]; then
    echo "error: could not resolve the latest release tag (network or repo issue)" >&2
    exit 1
  fi
fi

echo "==> release:  $VERSION"
echo "==> profile:  $PROFILE_DIR"
mkdir -p "$DIST_DIR"

echo "==> downloading artifacts..."
curl -sL -o "$MEM_TGZ" "https://github.com/$REPO/releases/download/$VERSION/dsh-simplemem.tgz"
curl -sL -o "$UI_TGZ" "https://github.com/$REPO/releases/download/$VERSION/dsh-client-ui-simplemem.tgz"
if ! tar -tzf "$MEM_TGZ" >/dev/null 2>&1 || ! tar -tzf "$UI_TGZ" >/dev/null 2>&1; then
  echo "error: downloaded artifacts are not valid tarballs (release may not contain them)" >&2
  exit 1
fi
echo "    mem:  $(du -h "$MEM_TGZ" | cut -f1)"
echo "    ui:   $(du -h "$UI_TGZ" | cut -f1)"

# Register the plugin rows in cordis.patch.yml (idempotent).
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

# Install the tarballs into the profile (skip unused CUDA binaries).
if command -v pnpm >/dev/null 2>&1; then
  PNPM=pnpm
else
  PNPM="corepack pnpm"
fi
echo "==> installing into profile..."
(cd "$PROFILE_DIR" && ONNXRUNTIME_NODE_INSTALL_CUDA=skip $PNPM add "$MEM_TGZ" "$UI_TGZ")

cat <<'DONE'

==> done. Finish the deployment:
  1. restart `dsh web` once (new packages need one restart)
  2. open the web GUI and refresh the page
  3. click 记忆 in the top-right corner

Updating later: re-run this script (it re-downloads and re-adds the new release).
DONE
