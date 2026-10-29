#!/usr/bin/env bash
# Tests for the helper scripts. Run: scripts/tests/run.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
failures=0
fixtures="$(mktemp -d)"
trap 'rm -rf "$fixtures"' EXIT

check() {  # check <name> <expected> <actual>
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1: expected '$2', got '$3'"; failures=$((failures + 1)); fi
}

# sim-udid.sh: the same phone name on two runtimes must resolve to the newest runtime's device, by UDID (1.1).
cat > "$fixtures/devices.json" <<'JSON'
{"devices": {
  "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
    {"name": "iPhone 17 Pro", "udid": "OLD-17-PRO"},
    {"name": "iPhone 17", "udid": "OLD-17"}],
  "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [
    {"name": "iPhone 17 Pro", "udid": "NEW-17-PRO"},
    {"name": "iPhone 17", "udid": "NEW-17"},
    {"name": "iPad Pro 13-inch (M5)", "udid": "NEW-IPAD"}],
  "com.apple.CoreSimulator.SimRuntime.watchOS-12-0": [
    {"name": "Apple Watch Series 11", "udid": "WATCH"}]
}}
JSON
check "sim-udid picks the newest runtime's best iPhone" "NEW-17-PRO" "$(scripts/sim-udid.sh "$fixtures/devices.json")"
echo '{"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-27-0": []}}' > "$fixtures/none.json"
scripts/sim-udid.sh "$fixtures/none.json" > /dev/null 2>&1
check "sim-udid fails without an iPhone" "1" "$?"

# diagnostics-flag.sh: only pass -collect-test-diagnostics when this xcodebuild knows it (Minor 3).
printf 'Usage: xcodebuild ...\n    -collect-test-diagnostics never|on-failure|always\n' > "$fixtures/help-new.txt"
printf 'Usage: xcodebuild ...\n    -resultBundlePath PATH\n' > "$fixtures/help-old.txt"
check "diagnostics flag when supported" "-collect-test-diagnostics never" "$(scripts/diagnostics-flag.sh "$fixtures/help-new.txt")"
check "no diagnostics flag when unknown" "" "$(scripts/diagnostics-flag.sh "$fixtures/help-old.txt")"

[[ $failures -eq 0 ]] || { echo "$failures script test(s) failed"; exit 1; }
