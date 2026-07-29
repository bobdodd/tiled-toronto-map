#!/bin/bash
# One-shot watcher: let nunavut finish, then stop the DEM reindex.
#
# Why bootout and not kill: the launchd agent sets
#   KeepAlive = { SuccessfulExit = false }
# so ANY non-zero exit is restarted after ThrottleInterval (120s). Killing the
# driver therefore does not stop the job, it pauses it for two minutes. Only
# a clean "ALL DONE" (exit 0) is left alone. Unloading the agent is the stop.
#
# Stop conditions, either of:
#   • nunavut lands in done.txt   -> it fully succeeded (rsync + remote upsert
#                                    + remote cleanup all returned 0)
#   • state/attempts/nunavut exists -> a full 3-try upload cycle failed, and the
#                                    driver is about to move on to austin, which
#                                    is precisely what we do not want tonight
#
# To resume later:
#   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.a11ybob.dem-reindex.plist
# RunAtLoad starts it immediately and it resumes from done.txt.

set -o pipefail

STATE="/Users/bob3/Documents/Bob/Claude/Tiled City Map/dem-reindex/state"
DONE="$STATE/done.txt"
ATTEMPT="$STATE/attempts/nunavut"
LOG="$STATE/stop-after-nunavut.log"
LABEL="com.a11ybob.dem-reindex"
UID_N="$(id -u)"

say() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" >> "$LOG"; }

say "watcher start (pid $$), waiting for nunavut"

while :; do
  if grep -qx 'nunavut' "$DONE" 2>/dev/null; then
    say "nunavut COMPLETED (in done.txt)"
    break
  fi
  if [ -f "$ATTEMPT" ]; then
    say "nunavut FAILED an upload cycle (attempts/nunavut = $(cat "$ATTEMPT")); stopping rather than moving to austin"
    break
  fi
  sleep 15
done

say "final status: $(sed -n '3p' "$STATE/status.txt" 2>/dev/null)"
say "done count: $(wc -l < "$DONE" | tr -d ' ') / 41"

launchctl bootout "gui/$UID_N/$LABEL" >> "$LOG" 2>&1
rc=$?
say "launchctl bootout rc=$rc"

sleep 5
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
  say "WARNING: agent still listed after bootout"
else
  say "agent unloaded; reindex stopped"
fi

if pgrep -f 'dem-reindex/run.sh' > /dev/null 2>&1; then
  say "WARNING: run.sh still running: $(pgrep -f 'dem-reindex/run.sh' | tr '\n' ' ')"
else
  say "driver gone"
fi

say "watcher exit"
