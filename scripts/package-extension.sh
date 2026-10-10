#!/bin/sh
# Builds the zip to upload to the Chrome Web Store: dist/mylingo-extension-<version>.zip.
# Packs a copy of extension/ with lib/version.js written for the current commit,
# so the settings page shows which commit the published version was built from.
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root"

version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' extension/manifest.json)
hash=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain -- extension)" ]; then
  echo "warning: extension/ has uncommitted changes; the commit hash ($hash) will not match the packed files" >&2
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
cp -R extension "$stage/extension"
find "$stage/extension" \( -name '.DS_Store' -o -name '*~' \) -delete
printf "globalThis.MYLINGO_COMMIT = '%s';\n" "$hash" > "$stage/extension/lib/version.js"

mkdir -p dist
out="$root/dist/mylingo-extension-$version.zip"
rm -f "$out"
(cd "$stage/extension" && zip -qrX "$out" .)
echo "$out ($version, $hash)"
