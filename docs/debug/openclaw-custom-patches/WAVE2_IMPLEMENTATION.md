# Wave 2 Implementation

## Status

Wave 2 was implemented on 2026-03-11 as a narrow, internal fast-turn profile.

Scope stayed intentionally small:

- no user-facing mode toggle was added
- deep/full behavior remains the fallback whenever classification is uncertain
- Jo integrations were preserved
- Wave 1 safeguards were preserved and re-tested

## What was implemented

### 1. Conservative fast-turn classifier

Implemented in:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

Behavior:

- classifies only a narrow set of clearly trivial turns as `fast`
- strips the injected webchat timestamp envelope before classification so live gateway traffic matches the trivial patterns
- keeps `deep` as the default fallback
- forces `deep` on continuity/action cues such as `remember`, `last time`, `check`, `read`, `fix`, `build`, `debug`, `todo`

Fast-turn cases implemented:

- `hi`
- `hello`
- `hey`
- `thanks`
- `thank you`
- `ok`
- `okay`
- `sounds good`
- `what time is it`
- `summarize this in one sentence`

### 2. Fast-turn prompt/context reduction

Implemented in:

- [src/agents/pi-embedded-runner/run.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run.ts)
- [src/agents/pi-embedded-runner/run/params.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/params.ts)
- [src/agents/pi-embedded-runner/run/attempt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts)
- [src/agents/system-prompt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.ts)

Behavior for `fast` turns:

- forces `bootstrapContextMode: "lightweight"`
- forces minimal prompt mode
- suppresses the skills prompt entirely
- avoids injecting workspace bootstrap files into project context

Additional prompt-side fix:

- when no tools are exposed for a run, the system prompt no longer expands to the broad fallback default tool list
- instead it emits the truthful minimal line: `- (no tools exposed for this run)`

### 3. Fast-turn tool reduction

Implemented in:

- [src/agents/pi-embedded-runner/run/params.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/params.ts)
- [src/agents/pi-embedded-runner/run.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run.ts)
- [src/agents/pi-embedded-runner/run/attempt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts)

Behavior:

- `fast` acknowledgement-style turns disable tools entirely
- `what time is it` stays `fast` but is restricted to a tiny allowlist:
  - `session_status`
- allowlist filtering is applied before prompt construction and before client tool exposure, so tool schemas and tool list text shrink with the effective tool set

### 4. JoMemory retrieval short-circuit for trivial turns

Implemented in:

- [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts)

Behavior:

- adds a narrow `isClearlyTrivialTurn` helper
- skips `maybeSearch` for clearly trivial turns before substantial-turn retrieval logic runs
- preserves:
  - tool-backed intent handling
  - canonical todo handling
  - existing substantial-turn retrieval

## Exact files changed

OpenClaw source:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- [src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts)
- [src/agents/pi-embedded-runner/run/params.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/params.ts)
- [src/agents/pi-embedded-runner/run.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run.ts)
- [src/agents/pi-embedded-runner/run/attempt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts)
- [src/agents/pi-embedded-runner/run/attempt.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.test.ts)
- [src/agents/system-prompt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.ts)
- [src/agents/system-prompt.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.test.ts)

Jo source:

- [packages/joorchestrator/src/runtime/memory/jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts)
- [packages/joorchestrator/src/index.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/index.ts)
- [packages/joorchestrator/tests/jomemory-turn-middleware.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/tests/jomemory-turn-middleware.test.ts)

Docs:

- [docs/debug/openclaw-custom-patches/WAVE2_PATCH_PLAN.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE2_PATCH_PLAN.md)
- [docs/debug/openclaw-custom-patches/WAVE2_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE2_IMPLEMENTATION.md)

## Test results

### OpenClaw focused Wave 2 + Wave 1 regressions

Passed:

- `pnpm exec vitest run src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/system-prompt.test.ts src/agents/session-tool-result-guard.test.ts src/agents/ollama-stream.test.ts`

Result:

- 5 files passed
- 114 tests passed

Additional Wave 1 safeguard rerun:

- `pnpm exec vitest run src/agents/ollama-stream.test.ts src/agents/session-tool-result-guard.test.ts`

Result:

- 2 files passed
- 42 tests passed

### JoMemory focused tests

Passed:

- `pnpm --filter ./packages/joorchestrator exec vitest run tests/jomemory-turn-middleware.test.ts`

Result:

- 1 file passed
- 17 tests passed

### Build verification

Passed:

- `pnpm build` in [openclaw-upstream](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream)
- `pnpm --filter ./packages/joorchestrator build` in [Jo](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo)

### Runtime regression checks

Verified:

- no `## Retrieved Memory Context` leakage in fresh post-patch transcripts
- empty-output safeguard tests still pass
- deep memory retrieval still works on an explicit memory prompt
- tool-backed deep path still works on a repo-status prompt

## Before/after measurement summary

### Measurement notes

- baseline prompts were run live through `chat.send`/`chat.history`
- first-token latency was not directly measurable from the gateway CLI path used here
- total elapsed time was measured from send to final visible assistant message observation
- final prompt-size comparisons use `systemPromptReport` from fresh live sessions

### Pre-patch baseline shape

Representative trivial-turn prompt footprint before Wave 2:

- system prompt chars: `32547`
- project context chars: `20470`
- skills prompt chars: `2550`
- tool list chars: `1804`
- tool schema chars: `17161`

Representative deep-turn prompt footprint before Wave 2:

- same as above for the tested default/deep path

### Post-patch fast-turn shape

Representative fast-turn prompt footprint after Wave 2 (`hi`):

- system prompt chars: `3506`
- project context chars: `0`
- skills prompt chars: `0`
- tool list chars: `33`
- tool schema chars: `0`

Representative fast utility-turn prompt footprint after Wave 2 (`what time is it`):

- system prompt chars: `3658`
- project context chars: `0`
- skills prompt chars: `0`
- tool list chars: `185`
- tool schema chars: `89`

Representative deep-turn prompt footprint after Wave 2 (`check the repo status` and explicit deep memory check):

- system prompt chars: `32547`
- project context chars: `20470`
- skills prompt chars: `2550`
- tool list chars: `1804`
- tool schema chars: `17161`

### Prompt-by-prompt summary

`hi`

- elapsed: `31.9s` pre -> `20.3s` post
- tools called: `0` -> `0`
- JoMemory retrieval: `false` -> `false`
- system prompt chars: `32547` -> `3506`

`hello`

- elapsed: `20.2s` pre -> `8.6s` post
- tools called: `0` -> `0`
- JoMemory retrieval: `false` -> `false`
- system prompt chars: `32547` -> `3506`

`thanks`

- elapsed: `16.4s` pre -> `8.6s` post
- tools called: `0` -> `0`
- JoMemory retrieval: `false` -> `false`
- system prompt chars: `32547` -> `3506`

`what time is it`

- elapsed: `86.3s` pre -> `20.2s` post
- tools called: `2` -> `1`
- `session_status`: still used where needed
- JoMemory retrieval: `false` -> `false`
- system prompt chars: `32547` -> `3658`

`summarize this in one sentence`

- elapsed: `121.0s` pre -> `12.5s` post
- tools called: `3` -> `0`
- JoMemory retrieval: `false` -> `false`
- system prompt chars: `32547` -> `3506`

Explicit deep memory check:

- live `jo_memory_search` tool call observed post-patch
- prompt footprint stayed full-size
- no transcript leakage of retrieved memory context markers

`check the repo status`

- post-patch deep/tool path remained full-size
- live tool call observed
- visible assistant answer returned repository status instead of a trivial-chat fallback

## Known limitations

- `okay` is correctly treated as a fast trivial turn, but the model’s visible reply quality is still weak for that case. In the final live run it replied with a generic greeting rather than a terse acknowledgement.
- first-token latency was not directly measurable from the gateway CLI path used here; only total observed latency was recorded.
- the exact elapsed times remain model- and runtime-noise-sensitive; the main reliable signal is the large reduction in prompt/context/tool footprint for trivial turns.
- the fast-turn classifier is intentionally narrow. Many short turns still fall back to deep mode by design.

## Maintenance notes

- the fast-turn classifier depends on stripping the injected timestamp envelope used by the live webchat/gateway path; if timestamp injection format changes, re-check [agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- the no-tools prompt fallback is now owned by [system-prompt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.ts); future prompt refactors should preserve the `- (no tools exposed for this run)` path
- the fast-turn profile is only internal. If a future user-facing mode toggle is introduced, it should reuse the same `turnProfile` plumbing rather than bypassing it
- after future upstream updates, re-check these files first:
  - [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
  - [src/agents/pi-embedded-runner/run.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run.ts)
  - [src/agents/pi-embedded-runner/run/attempt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts)
  - [src/agents/system-prompt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.ts)
  - [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts)

## Wave 2 polish and verification

### Polish changes made

This pass kept the Wave 2 classifier and fast/deep boundary intact.

Narrow polish only:

- added tiny style hints for weak exact fast-turn acknowledgement/greeting cases in [agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- promoted the weakest exact trivial turns to deterministic direct replies:
  - `hi` -> `Hi! How can I help?`
  - `hello` -> `Hello! How can I help?`
  - `hey` -> `Hey! How can I help?`
  - `ok` / `okay` -> `Okay.`
  - `sounds good` -> `Sounds good.`
  - `thanks` / `thank you` -> `You're welcome.`
  - `summarize this in one sentence` -> `I need the text or content to summarize.`

Why direct replies were used:

- model-backed hinting improved `thanks` but remained unstable for `okay`
- `okay` still drifted into generic greetings or empty-output fallback on repeated live checks
- direct replies were limited to exact trivial cases only, keeping the rest of the fast path and all deep behavior unchanged

### Timing enablement method

The smallest reproducible observability fix was operational, not architectural.

Implemented change:

- added `OPENCLAW_TURN_TIMING=1` to [ai.openclaw.gateway.plist](/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist)

Reproducible enablement method:

1. Ensure [ai.openclaw.gateway.plist](/Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist) contains:
   - `OPENCLAW_TURN_TIMING = 1`
2. Reload the LaunchAgent from the plist so the running process sees the env change:
   - `launchctl bootout gui/$(id -u) /Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist`
   - `launchctl bootstrap gui/$(id -u) /Users/jo-runtime/Library/LaunchAgents/ai.openclaw.gateway.plist`
3. Verify the running job sees the env:
   - `launchctl print gui/$(id -u)/ai.openclaw.gateway | grep OPENCLAW_TURN_TIMING`

Verified log sink:

- stdout timing events appear in `/Users/jo-runtime/.openclaw/logs/gateway.log`

Verified timing example:

- prompt: `hi`
- run id: `wave2-directlog-hi-1773268686`
- observed stages in `gateway.log`:
  - `request_received`
  - `prompt_assembly_start`
  - `prompt_assembly_end`
  - `outbound_send_start`
  - `outbound_send_success`
- measured dashboard delivery latency from log timestamps: about `81ms`

This verified that timing is now operationally visible for future fast-turn measurements.

### Discord verification status

What was verified:

- `channels.status` shows Discord configured and the provider running
- gateway logs show repeated successful Discord logins for the default account `@JoD`
- the runtime still loads the Discord provider after LaunchAgent reloads

What remains unverified live:

- a real inbound Discord user trivial prompt exercising the fast path end to end
- a real inbound Discord empty-output fallback case
- live confirmation that no `## Retrieved Memory Context` leakage appears in a real Discord-visible reply
- live confirmation that classifier behavior matches dashboard behavior for real inbound Discord prompts

Exact blockers:

- no recent inbound Discord activity was available during the verification window: `lastInboundAt` remained `null`
- no default outbound target is configured in the current Discord config, so there is no known safe built-in test channel to use automatically
- this environment does not expose a second Discord user identity/credential that could send a real inbound message to the bot for end-to-end verification
- after LaunchAgent reloads, `channels.status` reported `connected: false` even while gateway logs showed successful bot login; that inconsistency makes fully automated live-path confidence weaker than it should be

Operational conclusion:

- Discord provider startup/login is partially verified
- real inbound Discord end-to-end Wave 2 behavior is still operationally unverified in this environment

### Updated measurements

#### Measurement notes for polish pass

- deterministic direct fast replies were measured from timing-log delivery timestamps in `gateway.log`
- model-backed turns still used session/history evidence where appropriate
- for deterministic direct replies, `systemPromptReport` prompt-size fields are unavailable because no embedded model run occurs

#### Final polished fast-turn results

`hi`

- total latency: about `81ms` from timing log delivery
- reply: `Hi! How can I help?`
- retrieval ran: `false`
- tools called: `0`
- prompt-size contributors: not applicable for direct reply path

`okay`

- total latency: about `84ms` from timing log delivery
- reply: `Okay.`
- retrieval ran: `false`
- tools called: `0`
- prompt-size contributors: not applicable for direct reply path

`thanks`

- total latency: about `104ms` from timing log delivery
- reply: `You're welcome.`
- retrieval ran: `false`
- tools called: `0`
- prompt-size contributors: not applicable for direct reply path

`what time is it`

- total latency: about `27.7s` from live gateway measurement
- reply stayed model-backed and tool-backed
- retrieval ran: `false`
- tools called: `1`
- `session_status` observed: `true`
- prompt-size contributors:
  - system prompt chars: `3658`
  - project context chars: `0`
  - skills prompt chars: `0`
  - tool list chars: `185`
  - tool schema chars: `89`

`summarize this in one sentence`

- total latency: about `87ms` from timing log delivery
- reply: `I need the text or content to summarize.`
- retrieval ran: `false`
- tools called: `0`
- prompt-size contributors: not applicable for direct reply path

#### Final polished deep-turn results

`what did we decide last time about Wave 1 source-level fixes and rebuild?`

- total latency: about `139.9s` from live gateway measurement
- retrieval ran: `true`
- tools called: `1`
- no retrieved-memory transcript leakage observed
- prompt-size contributors:
  - system prompt chars: `32547`
  - project context chars: `20470`
  - skills prompt chars: `2550`
  - tool list chars: `1804`
  - tool schema chars: `17161`

`check the repo status`

- total latency: about `43.6s` from live gateway measurement
- retrieval ran: `false`
- tools called: `1`
- prompt-size contributors:
  - system prompt chars: `32547`
  - project context chars: `20470`
  - skills prompt chars: `2550`
  - tool list chars: `1804`
  - tool schema chars: `17161`

#### Quality improvements observed

- `okay` is now stable and terse instead of drifting into a generic greeting
- `thanks` is now consistently `You're welcome.`
- `summarize this in one sentence` no longer summarizes the request itself; it now asks for the missing content directly
- trivial fast replies now avoid model drift and avoid the empty-output fallback on those exact cases

### Additional verification notes

- fresh deterministic fast replies appear in `chat.history` as visible assistant messages
- for those direct-reply runs, `chat.history` shows provider `openclaw` and model `gateway-injected`
- no `## Retrieved Memory Context` leakage was observed in the final polish measurement set

### Remaining polish limitations

- deterministic direct fast replies do not produce `systemPromptReport` metrics, because they intentionally bypass the embedded model run
- `what time is it` remains model-backed and tool-backed, so its latency is still much higher than exact deterministic fast replies
- deep memory/tool turns remain much slower than trivial fast turns by design
- real inbound Discord end-to-end verification remains blocked by environment/runtime conditions described above
