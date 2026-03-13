# OpenClaw Runtime Deployment Notes

## Active runtime path

The active installed OpenClaw runtime is located at:

- `/opt/homebrew/lib/node_modules/openclaw`

The active dist currently in use by the LaunchAgent-backed gateway is:

- `/opt/homebrew/lib/node_modules/openclaw/dist`

The LaunchAgent executes:

- Node binary: `/opt/homebrew/Cellar/node/25.6.1_1/bin/node`
- Program entry: `/opt/homebrew/lib/node_modules/openclaw/dist/index.js`

This is defined in [ai.openclaw.gateway.plist](/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist).

## Dist provenance

The currently active dist is not stock package dist.

It was replaced with a source-generated rebuild produced from:

- `/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream`

You can tell it is using the rebuilt source-generated dist by checking for Wave 1 generated markers in the installed bundles, for example:

- `ensureVisibleAssistantMessage` in installed `gateway-cli-*`
- `stripRetrievedMemoryContextText` in installed `pi-embedded-*` and `reply-*`
- `model_request_start` and `first_token` in installed `model-selection-*`

Those were verified in the installed runtime after the dist swap.

## Backup location

The previous installed dist was preserved at:

- `/opt/homebrew/lib/node_modules/openclaw/dist.backup-source-upstream-20260311-140512`

That backup remained present after deployment verification.

## LaunchAgent/service notes

The active service is the macOS LaunchAgent:

- label: `ai.openclaw.gateway`

Key service traits from [ai.openclaw.gateway.plist](/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist):

- `RunAtLoad = true`
- `KeepAlive = true`
- gateway port `18789`
- gateway token is injected by LaunchAgent environment

After any future rebuild or dist replacement, this service must be restarted so the new dist is actually loaded.

## Actual log sinks

For the LaunchAgent-backed gateway, the actual stdout/stderr sinks are:

- stdout: `/Users/jo-runtime/.openclaw/logs/gateway.log`
- stderr: `/Users/jo-runtime/.openclaw/logs/gateway.err.log`

These are the authoritative process log sinks for the LaunchAgent.

Important distinction:

- the gateway may also log an internal file path like `/tmp/openclaw/openclaw-2026-03-11.log`
- that path is not the same thing as LaunchAgent stdout/stderr
- Wave 1 timing `console.log` output should be expected in `gateway.log`, not in the `/tmp/openclaw` file

## Timing flag issue

The stage timing code is present and compiles, but timing lines did not appear yet in the live LaunchAgent logs because `OPENCLAW_TURN_TIMING` did not reach the running LaunchAgent environment.

What was confirmed:

- the LaunchAgent plist environment shown in [ai.openclaw.gateway.plist](/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist) does not include `OPENCLAW_TURN_TIMING`
- `launchctl print gui/<uid>/ai.openclaw.gateway` showed the program and log paths but did not show `OPENCLAW_TURN_TIMING` on the running job

Operational conclusion:

- the missing timing lines are currently an environment propagation issue, not evidence that the source timing hooks failed to compile

## Restart/redeploy checklist

After any future OpenClaw rebuild or dist replacement:

1. Build the patched source checkout with `pnpm build`.
2. Back up the currently installed dist.
3. Copy the rebuilt dist into `/opt/homebrew/lib/node_modules/openclaw/dist`.
4. Restart the LaunchAgent `ai.openclaw.gateway`.
5. Confirm the service restarted cleanly.
6. Confirm `gateway.log` and `gateway.err.log` are still the active sinks.
7. Confirm the installed bundles contain the expected Wave 1 markers.
8. Re-run the post-update runtime checks before trusting the deployment.
