#!/usr/bin/env bash
# Usage: scripts/test.sh [--unit]   (--unit runs only the SpendozaKit package tests)
set -euo pipefail
cd "$(dirname "$0")/.."
(cd Packages/SpendozaKit && swift test)
[[ "${1:-}" == "--unit" ]] && exit 0
xcodegen generate --quiet
SIM="$(scripts/sim-name.sh)"
rm -rf build/TestResults.xcresult
xcodebuild test -project Spendoza.xcodeproj -scheme Spendoza \
  -destination "platform=iOS Simulator,name=$SIM" -derivedDataPath build \
  -resultBundlePath build/TestResults.xcresult -quiet
