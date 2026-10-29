#!/usr/bin/env bash
# Prints the name of the newest available iPhone simulator on the newest available iOS runtime.
set -euo pipefail
xcrun simctl list devices available -j | python3 -c '
import json, re, sys
devices = json.load(sys.stdin)["devices"]
def version(runtime):
    m = re.search(r"iOS-(\d+(?:-\d+)*)$", runtime)
    return tuple(int(p) for p in m.group(1).split("-")) if m else None
runtimes = sorted((r for r in devices if version(r)), key=version, reverse=True)
def rank(name):
    m = re.search(r"iPhone (\d+)", name)
    return (int(m.group(1)) if m else 0, name.endswith(" Pro"), name)
for runtime in runtimes:
    phones = [d["name"] for d in devices[runtime] if d["name"].startswith("iPhone")]
    if phones:
        print(max(phones, key=rank))
        sys.exit(0)
sys.exit("No iPhone simulator available")
'
