#!/usr/bin/env bash
# Run each test file in its own Bun process to ensure mock.module isolation.
# Bun's test runner shares the module cache across test files in a single process,
# which causes mock.module calls from different files to conflict.
set -uo pipefail

exit_code=0
files=$(find src -name '*.test.ts' -type f | sort)

for f in $files; do
  if ! bun test --timeout 15000 "$f"; then
    exit_code=1
  fi
done

exit $exit_code
