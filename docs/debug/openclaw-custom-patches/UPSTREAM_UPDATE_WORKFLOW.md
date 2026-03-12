# Upstream Update Workflow

## Goal

Take future OpenClaw upstream updates into our owned fork without overwriting Jo-specific runtime behavior.

## Default strategy

Use this strategy by default:

- keep `main` as the clean upstream-tracking branch
- keep `jo/stable` as the deployable customization branch
- create a fresh `jo/integration/upstream-v<version>` branch for each upstream release you want to evaluate
- forward-port the Jo patch commits onto that integration branch
- merge back into `jo/stable` only after build, validation, and deployment checks pass

For this codebase, forward-porting by explicit cherry-pick or small manual adaptation is safer than blind long-range rebases.

Reasoning:

- the current patch set touches high-churn files in the agent and reply pipeline
- the active local diff includes both production fixes and exploratory work
- future upstream releases are likely to move prompt, tool, and delivery code again

## Release intake procedure

When a new upstream release appears:

```bash
cd /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream
git fetch upstream --tags
git switch main
git fetch upstream main
git reset --hard upstream/main
git push origin main --force-with-lease
```

Notes:

- `main` is allowed to be a clean mirror branch, so force-with-lease is acceptable there if needed.
- Do not run that command on `jo/stable`.

## Create the staging branch for a new upstream release

For an upstream release tag such as `v2026.3.2`:

```bash
cd /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream
git fetch upstream --tags
git switch --create jo/integration/upstream-v2026.3.2 v2026.3.2
```

## Forward-port the Jo patch stack

First inspect what actually lives on `jo/stable` beyond the last upstream release base:

```bash
git log --oneline v2026.3.1..jo/stable
```

Then replay only the commits that are meant to survive into the new release:

```bash
git cherry-pick <commit-a> <commit-b> <commit-c>
```

If the patch set is already clean and intentionally linear, a contiguous range is fine:

```bash
git cherry-pick <oldest-jo-commit>^..<newest-jo-commit>
```

Avoid carrying forward investigation-only commits unless they are still needed.

## Conflict handling rules

When conflicts happen, resolve them in this order:

1. preserve upstream structure changes first
2. re-apply Jo behavior changes at the new owning call sites
3. remove dead compatibility code instead of forcing old shapes into new files
4. update tests before rebuilding `dist`

Check these files first because they are current customization hotspots:

- `src/agents/ollama-stream.ts`
- `src/agents/session-tool-result-guard.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/gateway/server-methods/chat.ts`
- `src/discord/monitor/listeners.ts`

Also inspect any new upstream replacements for those responsibilities if the files move.

## Rebuild procedure

After the integration branch compiles and tests look sane:

```bash
cd /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream
pnpm install
pnpm build
```

If the branch includes new or changed focused tests, run those before the full runtime deploy check.

Minimum expectation:

- run targeted tests for every touched patch area
- run `pnpm build`
- confirm the build regenerated `dist/` without errors

## Validation before merge back to jo/stable

Before merging the update into `jo/stable`, validate all of the following:

1. the branch is based on the intended upstream tag
2. the intended Jo commits were forward-ported and nothing extra came along accidentally
3. `pnpm build` succeeded
4. the rebuilt `dist/` is the artifact you intend to deploy
5. the gateway still starts with the rebuilt runtime
6. exact-reply trivial turns still return quickly
7. JoMemory retrieval still works end to end
8. dashboard and webchat final delivery still behaves correctly
9. the deployed runtime can be traced back to a source commit and deployment tag

## Merge back to jo/stable

Once the integration branch is validated:

```bash
cd /Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream
git switch jo/stable
git merge --no-ff jo/integration/upstream-v2026.3.2
git push origin jo/stable
git tag -a jo-deploy/v2026.3.2-YYYYMMDD-01 -m "Jo deploy on top of upstream v2026.3.2"
git push origin jo-deploy/v2026.3.2-YYYYMMDD-01
```

## What not to do

Do not do these by default:

- do not patch files directly inside `/opt/homebrew/lib/node_modules/openclaw/dist`
- do not deploy from a detached `HEAD`
- do not mix upstream intake, local feature work, and deployment-only edits in a single commit
- do not overwrite `jo/stable` with upstream history
- do not treat the installed runtime as the canonical source of truth
