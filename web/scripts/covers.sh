#!/usr/bin/env bash
# Add agent covers to the site and deploy them.
#
#   bash web/scripts/covers.sh <folder>
#
# Name each image after the agent's ticker (abacus.png, $KETTLE.jpg, Herald.webp …; any case,
# png/jpg/webp/avif/heic). Each one is cropped to the 3:2 card frame, saved as
# web/public/agents/<ticker>.webp at 768x512, committed, pushed and deployed to the server.
# Conversion runs on the server (ImageMagick), so nothing needs installing here.
# DRY=1 writes the files but skips the commit and deploy.
set -euo pipefail

src="${1:?usage: covers.sh <folder with images>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/web/public/agents"
known="$(grep -ohE 'ticker: "[A-Za-z0-9]+"' "$root/web/src/lib/house.ts" "$root/web/src/lib/roster.ts" | cut -d'"' -f2 | tr 'A-Z' 'a-z')"
tmp="/tmp/bureau-covers-$$"

ssh blxssed "mkdir -p $tmp"
added=()
shopt -s nullglob nocaseglob
for f in "$src"/*.{png,jpg,jpeg,webp,avif,heic}; do
  name="$(basename "$f")"; id="$(echo "${name%.*}" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')"
  if ! grep -qx "$id" <<<"$known"; then echo "skip $name: no agent with ticker '$id'"; continue; fi
  ext="${name##*.}"
  scp -q "$f" "blxssed:$tmp/$id.$ext"
  ssh blxssed "convert '$tmp/$id.$ext' -auto-orient -resize 768x512^ -gravity center -extent 768x512 -quality 82 '$tmp/$id.webp'"
  scp -q "blxssed:$tmp/$id.webp" "$out/$id.webp"
  echo "ok   $name -> web/public/agents/$id.webp"
  added+=("web/public/agents/$id.webp")
done
ssh blxssed "rm -rf $tmp"

[ ${#added[@]} -eq 0 ] && { echo "nothing added"; exit 0; }
[ "${DRY:-}" = 1 ] && { echo "DRY=1: files written, not committed"; exit 0; }
cd "$root"
git add "${added[@]}"
git commit -q -m "web: covers for ${#added[@]} agents"
git push -q origin main
ssh blxssed bureau-deploy-web
