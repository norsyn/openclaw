# OpenClaw Fork Setup Plan

## Purpose

This document converts the current local OpenClaw patch workflow into a maintained fork workflow.

The goal is to make the OpenClaw runtime safely ours without losing the ability to take future upstream updates.

## Current assessed state

As of 2026-03-12:

- The active customized OpenClaw source tree is `/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream`.
- That checkout is currently at upstream tag `v2026.3.1` on a detached `HEAD`.
- Its only configured remote is `origin`, and `origin` still points at `https://github.com/openclaw/openclaw.git`.
- The checkout is not clean. It contains tracked source edits across the agent, reply, Discord, and gateway paths, plus untracked diagnostics, tests, and custom-patch docs.
- The current diff is much larger than the narrow exact-reply production fix. It includes wider prompt, policy, profiling, and diagnostics work that should be treated as branch hygiene work before the fork is considered tidy.
- The active installed runtime is `/opt/homebrew/lib/node_modules/openclaw`.
- The active LaunchAgent is `ai.openclaw.gateway` from `/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist`.
- The LaunchAgent runs `/opt/homebrew/Cellar/node/25.6.1_1/bin/node /opt/homebrew/lib/node_modules/openclaw/dist/index.js gateway --port 18789`.
- The active log sinks are `/Users/jo-runtime/.openclaw/logs/gateway.log` and `/Users/jo-runtime/.openclaw/logs/gateway.err.log`.
- `OPENCLAW_TURN_TIMING=1` is currently present in the LaunchAgent plist environment.
- The local source checkout already behaves like a working fork copy, but it is not yet a real owned fork because it has no fork remote, no named maintenance branch, and no clean published history.
- The current local `dist` in `openclaw-upstream/dist` does not match the installed runtime `dist` byte-for-byte, so the deployed runtime provenance is source-based but not yet reproducible from the current working tree without a rebuild-and-compare step.

## Canonical source of truth

The canonical OpenClaw source of truth should be an owned GitHub fork created from the existing `openclaw-upstream` checkout.

Do not make the Jo monorepo the canonical OpenClaw fork.

Reasoning:

- `openclaw-upstream` already contains the active OpenClaw source changes.
- It already contains the existing custom-patch investigation docs.
- OpenClaw build, merge, and deployment history should live with OpenClaw source history.
- Jo should remain the integration and operations repo, not the upstream-sync vehicle for OpenClaw itself.

## Recommended remote structure

Use this remote layout in the fork checkout:

- `upstream` -> `https://github.com/openclaw/openclaw.git`
- `origin` -> `git@github.com:norsyn/openclaw.git`

Rules:

- `upstream` is read-only and is never used for Jo-specific commits.
- `origin` is the maintained fork and the only remote that receives Jo/OpenClaw customization commits.

## Recommended branch structure

Use this branch model in the fork:

- `main`: clean upstream-tracking branch in the fork. No Jo-only commits. Keep it aligned with upstream history so diffs stay obvious.
- `jo/stable`: long-lived deployable customization branch. This is the branch that carries the Jo/OpenClaw runtime behavior we actually ship.
- `jo/integration/upstream-v<version>`: temporary staging branch for each upstream upgrade attempt.
- `jo/feature/<topic>`: optional short-lived branch for new work that should not go straight onto `jo/stable`.

## Documentation placement

Documentation should be handled this way:

- The fork repo is the canonical home for source, branch, merge, and deployment-maintenance docs.
- Jo keeps a mirrored copy of these docs under `docs/debug/openclaw-custom-patches/` because deployment and verification also touch Jo-operated services and environment paths.
- When the two copies diverge, the fork copy wins for source/update rules and the Jo copy wins only for local environment specifics.

## Required cleanup before the fork is considered healthy

Before this becomes a routine maintained fork, do these cleanup steps:

1. Anchor the detached `HEAD` into a named branch immediately so the working tree is no longer floating.
2. Rename the current `origin` remote to `upstream`.
3. Add the owned fork as the new `origin`.
4. Separate deployable runtime changes from follow-on experimental work.
5. Commit the deployable OpenClaw changes on `jo/stable` in reviewable slices.
6. Push both `main` and `jo/stable` to the owned fork.
7. Tag the first validated deployable state from the fork.

## No-surprises setup sequence

These commands are safe setup commands for the current local checkout once the fork repository exists:

```bash
cd /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream

# Stop carrying the work on a detached HEAD.
git switch -c jo/stable

# Preserve the current upstream remote under the correct name.
git remote rename origin upstream

# Point origin at the owned fork.
git remote add origin git@github.com:norsyn/openclaw.git

# Create a clean upstream mirror branch in the fork.
git fetch upstream --tags
git switch -c main upstream/main
git push -u origin main

# Return to the deployable customization branch.
git switch jo/stable
```

## Commit hygiene recommendation

Do not publish the current `jo/stable` branch as one giant mixed commit if it can be avoided.

The current working tree contains at least three categories of change:

- deployed production behavior changes
- diagnostics and investigative helpers
- deeper prompt or policy follow-on work that is not part of this pass

Before the first public push, separate those into explicit commits or side branches so future upstream forward-ports are understandable.

## Deployment tagging

After each validated deployment from the fork, create an annotated tag on the deployed commit.

Recommended tag format:

- `jo-deploy/v2026.3.1-20260312-01`

That tag should represent the exact source commit from which the deployed `dist` was built.
