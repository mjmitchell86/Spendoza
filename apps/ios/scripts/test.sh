#!/usr/bin/env bash
# Usage: scripts/test.sh [--unit]   (--unit runs only the SpendozaKit package tests)
set -euo pipefail
cd "$(dirname "$0")/.."
(cd Packages/SpendozaKit && swift test)
[[ "${1:-}" == "--unit" ]] && exit 0
xcodegen generate --quiet
SIM="$(scripts/sim-name.sh)"
# Pin the status bar (clock, battery, signal) so screenshots are identical from one moment to the next:
# the UI tests detect "the screen stopped changing" and the end of a scrolled page by comparing screenshots.
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b > /dev/null
xcrun simctl status_bar "$SIM" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularBars 4 --wifiBars 3
trap 'xcrun simctl status_bar "$SIM" clear' EXIT
rm -rf build/TestResults.xcresult
xcodebuild test -project Spendoza.xcodeproj -scheme Spendoza \
  -destination "platform=iOS Simulator,name=$SIM" -derivedDataPath build \
  -resultBundlePath build/TestResults.xcresult -collect-test-diagnostics never -quiet
