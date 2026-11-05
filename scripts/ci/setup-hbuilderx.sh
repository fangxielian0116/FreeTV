#!/usr/bin/env bash
set -euo pipefail
# Official full CLI distribution includes the UTS, Kotlin and safe-pack tools.
version=5.26.2026091802
destination="$PWD/.tools/HBuilderX-5.26"
mkdir -p "$destination" .cache
if ! test -f "$destination/.installed-$version"; then
  curl --fail --location --retry 3 --connect-timeout 30 --max-time 900 \
    "https://download1.dcloud.net.cn/download/HBuilderX.$version.linux_x64.full.tar.gz" \
    --output .cache/hbuilderx-linux.tar.gz
  tar -xzf .cache/hbuilderx-linux.tar.gz -C "$destination"
  touch "$destination/.installed-$version"
fi
cli=$(find "$destination" -maxdepth 3 -type f -name cli -print -quit)
test -n "$cli" || { echo 'HBuilderX CLI was not found in the official archive'; exit 1; }
home=$(dirname "$cli")
export FREETV_HBUILDERX="$home/HBuilderX"
echo "FREETV_HBUILDERX=$FREETV_HBUILDERX" >> "$GITHUB_ENV"
node --input-type=module -e "import {nativeToolchain} from './scripts/hbuilderx.mjs'; nativeToolchain(process.cwd()); console.log('Native toolchain ready')"
