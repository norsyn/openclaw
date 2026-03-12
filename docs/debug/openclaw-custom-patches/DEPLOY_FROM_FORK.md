# Deploy From Fork

## Deployment target

The deployable runtime is built from the owned OpenClaw fork checkout, not from manual edits inside the installed package path.

Current local paths:

- fork working tree: `/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream`
- generated build output: `/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/dist`
- installed runtime root: `/opt/homebrew/lib/node_modules/openclaw`
- installed runtime `dist`: `/opt/homebrew/lib/node_modules/openclaw/dist`

The live gateway is started by LaunchAgent label `ai.openclaw.gateway` from `/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist`.

The LaunchAgent currently runs:

```bash
/opt/homebrew/Cellar/node/25.6.1_1/bin/node /opt/homebrew/lib/node_modules/openclaw/dist/index.js gateway --port 18789
```

## Deployment rule

Going forward, only deploy from a validated fork commit.

That means:

- commit and tag the source change in the fork
- build `dist/` from that fork commit
- replace the installed `dist/` from the built artifact
- restart the LaunchAgent
- verify that the installed runtime matches the built fork artifact

## Build and deploy sequence

```bash
cd /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream

# Ensure you are on the exact deployable fork commit.
git switch jo/stable
git pull --ff-only origin jo/stable

# Build the deployable runtime.
pnpm install
pnpm build

# Back up the currently installed runtime dist.
stamp=$(date +%Y%m%d-%H%M%S)
cp -R /opt/homebrew/lib/node_modules/openclaw/dist \
  /opt/homebrew/lib/node_modules/openclaw/dist.backup-$stamp

# Replace the installed dist from the fork build.
rsync -a --delete \
  /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/dist/ \
  /opt/homebrew/lib/node_modules/openclaw/dist/

# Restart the launchd service so the new runtime is loaded.
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
```

## Post-deploy verification

Run these checks immediately after deployment:

```bash
# Confirm the installed dist matches the fork build.
diff -qr \
  /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/dist \
  /opt/homebrew/lib/node_modules/openclaw/dist

# Confirm the LaunchAgent is loaded.
launchctl list | grep ai.openclaw.gateway

# Confirm the process is running.
ps aux | grep -E 'openclaw|gateway' | grep -v grep

# Inspect recent gateway logs.
tail -n 80 /Users/jo-runtime/.openclaw/logs/gateway.log
tail -n 80 /Users/jo-runtime/.openclaw/logs/gateway.err.log
```

Then verify runtime behavior:

1. exact-reply trivial turns still return quickly
2. JoMemory retrieval still works
3. dashboard and webchat responses still complete correctly
4. no new tool or prompt regressions appear in gateway logs

## How to prove the deployed runtime came from the fork

Use all of these checks together:

1. the deployed commit is tagged in the fork
2. the local fork checkout is at that tagged commit
3. `pnpm build` was run on that checkout
4. `diff -qr` between fork `dist/` and installed `dist/` returns clean
5. the LaunchAgent was restarted after the copy

If those five conditions are true, the installed runtime matches the fork build.

## Rollback procedure

If the deployment regresses behavior:

```bash
rsync -a --delete \
  /opt/homebrew/lib/node_modules/openclaw/dist.backup-$stamp/ \
  /opt/homebrew/lib/node_modules/openclaw/dist/

launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
```

Then re-run the log and process checks.

Keep the backup directory until the replacement runtime has passed validation.

## Important operational notes

- Do not edit the installed runtime in place as a primary workflow.
- The installed path is a deployment target, not a development workspace.
- The current LaunchAgent plist includes `OPENCLAW_TURN_TIMING=1`; treat missing timing output as a runtime verification issue, not an assumption about absent environment configuration.
