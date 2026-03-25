#!/usr/bin/env bash
set -uo pipefail
exit_code=0
files=$(find src -name '*.test.ts' -type f 2>/dev/null | sort)
for f in $files; do
  if ! bun test --timeout 15000 "$f"; then
    exit_code=1
  fi
done
exit $exit_code
