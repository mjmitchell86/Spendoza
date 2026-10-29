#!/usr/bin/env bash
# Prints the UDID of the newest available iPhone simulator on the newest available iOS runtime.
# A UDID, not a name: the same name (say "iPhone 17 Pro") can exist on several runtimes, and
# `-destination name=...` would then be ambiguous.
# Usage: scripts/sim-udid.sh [devices.json]   (defaults to `xcrun simctl list devices available -j`)
set -euo pipefail
if [[ $# -gt 0 ]]; then json="$(cat "$1")"; else json="$(xcrun simctl list devices available -j)"; fi
printf '%s' "$json" | python3 -c '
import json, re, sys
devices = json.load(sys.stdin)["devices"]
def version(runtime):
    m = re.search(r"iOS-(\d+(?:-\d+)*)$", runtime)
    return tuple(int(p) for p in m.group(1).split("-")) if m else None
runtimes = sorted((r for r in devices if version(r)), key=version, reverse=True)
def rank(device):
    name = device["name"]
    m = re.search(r"iPhone (\d+)", name)
    return (int(m.group(1)) if m else 0, name.endswith(" Pro"), name)
for runtime in runtimes:
    phones = [d for d in devices[runtime] if d["name"].startswith("iPhone")]
    if phones:
        print(max(phones, key=rank)["udid"])
        sys.exit(0)
sys.exit("No iPhone simulator available")
'
