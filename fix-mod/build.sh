#!/usr/bin/env bash
# Biên dịch mod vá bằng javac (không cần Gradle).
# Dùng: fix-mod/build.sh <thư mục libraries của NeoForge> <file .jar đầu ra>
set -euo pipefail
LIBS="$1"; OUT="$(realpath -m "$2")"
HERE="$(cd "$(dirname "$0")" && pwd)"
B="$(mktemp -d)"
CP="$(find "$LIBS" -name '*.jar' | tr '\n' ':')"
javac --release 21 -proc:none -encoding UTF-8 -cp "$CP" -d "$B" $(find "$HERE/src" -name '*.java')
cp -a "$HERE/resources/." "$B/"
mkdir -p "$(dirname "$OUT")"
( cd "$B" && jar --create --file "$OUT" . )
rm -rf "$B"
echo "Đã build mod vá: $OUT ($(du -h "$OUT" | cut -f1))"
