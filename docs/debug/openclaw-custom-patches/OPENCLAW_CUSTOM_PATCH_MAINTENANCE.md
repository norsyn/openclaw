# OpenClaw Custom Patch Maintenance

## What is customized

This installation should now be treated as a custom OpenClaw code line for operational purposes.

The customization is narrow and source-based, not architectural:

- transcript sanitization and transcript fallback behavior in [src/agents/session-tool-result-guard.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.ts)
- model-side fallback and timing in [src/agents/ollama-stream.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/ollama-stream.ts)
- dashboard/webchat final-delivery safeguard and timing in [src/gateway/server-methods/chat.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/gateway/server-methods/chat.ts)
- Discord listener timing in [src/discord/monitor/listeners.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/discord/monitor/listeners.ts)

The active runtime dist installed globally at `/opt/homebrew/lib/node_modules/openclaw/dist` was rebuilt from this patched source tree.

## Why updates now require care

Normal OpenClaw update flows can overwrite the installed runtime dist and discard these local source-derived changes.

That means:

- a normal npm or pnpm global update can replace `/opt/homebrew/lib/node_modules/openclaw/dist`
- a reinstall from upstream package contents will not automatically preserve the local Wave 1 patches unless the source patch set is re-applied and rebuilt
- future upstream source moves may relocate the owning implementation files, especially where dist chunk names do not exactly match source file names

In practical terms, this is now a local custom fork/branch workflow even if it is not yet published to a remote fork.

## Recommended git workflow

Recommended long-term workflow:

1. Treat `/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream` as the source-of-truth patch workspace.
2. Create a real branch from the release tag that currently carries the Wave 1 work.
3. Tag the exact deployed state after each validated rebuild/install.

Recommended naming pattern:

- branch: `jo/wave1-openclaw-patches`
- deployment tag: `jo-openclaw-v2026.3.1-wave1`

Recommended commit discipline:

- keep Wave 1 source patch commits separate from docs commits
- keep rebuild/install steps out of source commits when possible
- record the installed runtime version and deployment backup path in commit messages or release notes

## How to merge/rebase future upstream releases

Recommended process for a future upstream release:

1. Fetch the new upstream tag or release branch.
2. Create a new integration branch from that upstream release.
3. Rebase or cherry-pick the Wave 1 source commits onto the new release.
4. Resolve any file-move or ownership changes before rebuilding.
5. Run the post-update verification checklist before replacing the installed dist.

Two safe approaches:

### Option A: Rebase the patch branch forward

- Best when the patch set is small and upstream file structure is still similar.
- Keeps a linear history of the customization.

### Option B: Cherry-pick onto each new upstream release branch

- Best when upstream moves quickly or file ownership changes often.
- Makes it easier to adapt each patch deliberately rather than forcing a large rebase.

For this specific patch set, cherry-pick or small manual forward-porting may be safer than a blind rebase because the model-side owning source file already diverged from the dist chunk name in `v2026.3.1`.

## Important patch points to watch in future versions

These are the source files that must be checked first after an upstream upgrade:

- [src/agents/session-tool-result-guard.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.ts)
- [src/agents/session-tool-result-guard-wrapper.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard-wrapper.ts)
- [src/agents/ollama-stream.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/ollama-stream.ts)
- [src/gateway/server-methods/chat.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/gateway/server-methods/chat.ts)
- [src/discord/monitor/listeners.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/discord/monitor/listeners.ts)

Also inspect these contextual files if the above move or change shape:

- [src/agents/model-selection.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/model-selection.ts)
- [src/agents/openai-ws-stream.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/openai-ws-stream.ts)
- [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts#L512)

## Post-update verification checklist

After any upstream update, re-run all of the following before trusting the install:

1. Verify focused unit tests still pass.
2. Run `pnpm build` in the patched OpenClaw source checkout.
3. Confirm the rebuilt generated bundles still contain the expected Wave 1 markers.
4. Replace the installed dist only after the rebuilt dist is confirmed good.
5. Restart the LaunchAgent-backed gateway.
6. Verify dashboard/webchat history is still free of leaked `## Retrieved Memory Context` blocks.
7. Verify the empty-output fallback still appears for a known failing prompt path.
8. Verify an explicit JoMemory retrieval path still works end to end.
9. Verify the installed runtime path points at the rebuilt dist, not stock package contents.
10. Verify the actual log sinks remain `~/.openclaw/logs/gateway.log` and `~/.openclaw/logs/gateway.err.log`.

If timing verification is part of the update, separately confirm whether `OPENCLAW_TURN_TIMING` is actually present in the LaunchAgent environment before treating missing timing lines as a code regression.
