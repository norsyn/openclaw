# Wave 1 Fixes

## Summary

Wave 1 moved three already-proven runtime hotfixes out of hand-edited generated bundles and into source-owned OpenClaw modules for the `v2026.3.1` code line.

Wave 1 did not add new product behavior. It upstreamed the already active behaviors so they now survive `pnpm build`, dist regeneration, and future local reinstall/deploy steps.

Wave 1 covered:

- Memory-context transcript leak suppression
- Empty-output safeguard
- Stage timing hooks

Wave 1 ended with a rebuilt source-generated dist installed at `/opt/homebrew/lib/node_modules/openclaw/dist` and the LaunchAgent-backed gateway restarted on that rebuilt dist.

## Problems fixed

### 1. Memory-context transcript leak suppression

Original problem:

- Internal `## Retrieved Memory Context` prompt material could leak into persisted visible transcript content.
- This polluted dashboard-visible history and made internal retrieval scaffolding appear in user-facing messages.

Temporary bundle-hotfix phase:

- The fix was first applied directly in generated runtime bundles so transcript writes stripped the retrieved-memory prefix before persistence.

Final source-level upstreamed fix:

- The same logic now lives in `installSessionToolResultGuard` in [src/agents/session-tool-result-guard.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.ts).
- Visible user/assistant transcript content is sanitized before persistence.

### 2. Empty-output safeguard

Original problem:

- Some turns completed with no visible assistant text.
- That produced blank or unusable results in persisted transcripts or dashboard delivery.

Temporary bundle-hotfix phase:

- The fallback text `I hit an internal empty-output condition after processing your request. Please retry.` was injected directly into generated bundle code at the model/transcript/gateway layers.

Final source-level upstreamed fix:

- The model-side fallback and timing markers now live in [src/agents/ollama-stream.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/ollama-stream.ts).
- The transcript persistence safeguard now lives in [src/agents/session-tool-result-guard.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.ts).
- The dashboard final-delivery safeguard now lives in [src/gateway/server-methods/chat.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/gateway/server-methods/chat.ts).

Note for this release line:

- The generated dist chunk named `model-selection-*` maps to the real owning source in `src/agents/ollama-stream.ts` for `v2026.3.1`.
- The small file [src/agents/model-selection.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/model-selection.ts) in this tag is not the owner of the assistant message builder logic.

### 3. Stage timing hooks

Original problem:

- Timing instrumentation existed in parts of the stack but the Wave 1 runtime tracing needed to be made available across the same code paths that were hotfixed in the bundles.

Temporary bundle-hotfix phase:

- Timing hooks were added directly to generated bundle files for model, transcript, gateway, and Discord listener paths.

Final source-level upstreamed fix:

- JoMemory timing already existed in source in [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts#L512).
- Model timing is now source-owned in [src/agents/ollama-stream.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/ollama-stream.ts).
- Transcript timing is now source-owned in [src/agents/session-tool-result-guard.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.ts).
- Dashboard timing is now source-owned in [src/gateway/server-methods/chat.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/gateway/server-methods/chat.ts).
- Discord listener timing is now source-owned in [src/discord/monitor/listeners.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/discord/monitor/listeners.ts).

## Source files changed

Source changes made in the OpenClaw source checkout:

- [src/agents/session-tool-result-guard.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.ts)
- [src/agents/ollama-stream.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/ollama-stream.ts)
- [src/gateway/server-methods/chat.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/gateway/server-methods/chat.ts)
- [src/discord/monitor/listeners.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/discord/monitor/listeners.ts)

Supporting source that was inspected but did not require code changes:

- [src/agents/session-tool-result-guard-wrapper.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard-wrapper.ts)
- [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts#L512)

## Tests added/updated

Updated tests:

- [src/agents/ollama-stream.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/ollama-stream.test.ts)
  Added a focused empty-output fallback assertion for the model-side builder.
- [src/agents/session-tool-result-guard.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/session-tool-result-guard.test.ts)
  Added focused assertions for:
  - stripping `## Retrieved Memory Context` blocks before visible persistence
  - applying the empty-output fallback before transcript persistence

Existing test target used as a compile/runtime smoke check for the Discord listener path:

- [src/discord/monitor/listeners.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/discord/monitor/listeners.test.ts)

Focused validation command that passed during the source-upstream pass:

```bash
pnpm exec vitest run \
  src/agents/ollama-stream.test.ts \
  src/agents/session-tool-result-guard.test.ts \
  src/discord/monitor/listeners.test.ts
```

## Verification performed

### Source/build verification

- `pnpm install --frozen-lockfile` completed in the OpenClaw source checkout.
- `pnpm build` completed successfully.
- Rebuilt generated bundles contained the Wave 1 markers by generation rather than manual edit.

Examples verified in rebuilt dist:

- `stripRetrievedMemoryContextText` in rebuilt `pi-embedded` and `reply` bundles
- `ensureVisibleAssistantMessage` in rebuilt `gateway-cli` bundles
- `model_request_start` and `first_token` in rebuilt `model-selection-*` bundles

### Runtime verification performed

After installing the rebuilt dist and restarting the LaunchAgent-backed gateway:

- Empty-output fallback still triggered on rebuilt runtime.
  Evidence: [59a284e9-17d8-4024-a053-1648915040a1.jsonl](/Users/jo-runtime/.openclaw/agents/main/sessions/59a284e9-17d8-4024-a053-1648915040a1.jsonl#L5) and [59a284e9-17d8-4024-a053-1648915040a1.jsonl](/Users/jo-runtime/.openclaw/agents/main/sessions/59a284e9-17d8-4024-a053-1648915040a1.jsonl#L6)
- JoMemory retrieval still worked on rebuilt runtime.
  Evidence: [dcfe8c95-f449-4d6b-902c-4a726ee8fc19.jsonl](/Users/jo-runtime/.openclaw/agents/main/sessions/dcfe8c95-f449-4d6b-902c-4a726ee8fc19.jsonl#L6), [dcfe8c95-f449-4d6b-902c-4a726ee8fc19.jsonl](/Users/jo-runtime/.openclaw/agents/main/sessions/dcfe8c95-f449-4d6b-902c-4a726ee8fc19.jsonl#L7), and [dcfe8c95-f449-4d6b-902c-4a726ee8fc19.jsonl](/Users/jo-runtime/.openclaw/agents/main/sessions/dcfe8c95-f449-4d6b-902c-4a726ee8fc19.jsonl#L8)
- Dashboard-visible messages remained clean with respect to the retrieved-memory transcript leak during the rebuilt memory probe.
  The visible transcript contained normal user text, a tool call, a tool result, and a final answer, but no injected `## Retrieved Memory Context` block.

## Known limitations

- Timing code compiles and is present in rebuilt generated bundles, but timing lines still did not appear in the LaunchAgent logs during verification because `OPENCLAW_TURN_TIMING` was not present in the running LaunchAgent environment.
- The initial retrieval-style dashboard probe on rebuilt runtime returned the empty-output fallback instead of a useful answer. That was observed as runtime behavior, not treated as a source-upstream failure, because a separate explicit memory probe succeeded and the runtime did not show a build/runtime crash.
- This document only covers Wave 1. Wave 2 scope remains separate.

## Rollback notes

Operational rollback of the installed runtime is straightforward:

1. Stop or restart the gateway service after replacing dist content.
2. Restore the previous backup dist from `/opt/homebrew/lib/node_modules/openclaw/dist.backup-source-upstream-20260311-140512` back to `/opt/homebrew/lib/node_modules/openclaw/dist`.
3. Restart the LaunchAgent `ai.openclaw.gateway`.

Source rollback in the source checkout is separate:

- Reset or reverse the changes in the OpenClaw source checkout at `/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream`.
- Rebuild with `pnpm build`.
- Reinstall the rebuilt dist into the active runtime path.
