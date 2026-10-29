#!/usr/bin/env bash
# Prints "-collect-test-diagnostics never" when this xcodebuild supports the option (it skips the slow
# `simctl diagnose` after a failing test run), and nothing otherwise: older Xcodes (CI pins 26.3) reject
# unknown options.
# Usage: scripts/diagnostics-flag.sh [help.txt]   (defaults to `xcodebuild -help`)
set -uo pipefail
if [[ $# -gt 0 ]]; then help="$(cat "$1")"; else help="$(xcodebuild -help 2>&1)"; fi
if grep -q -- '-collect-test-diagnostics' <<< "$help"; then
  echo "-collect-test-diagnostics never"
fi
