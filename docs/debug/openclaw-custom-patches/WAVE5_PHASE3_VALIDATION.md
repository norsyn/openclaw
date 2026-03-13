# Wave 5 Phase 3 Validation

## Status

Wave 5 Phase 3 was executed as a real-runtime validation pass.

An additional managed-runtime redeploy and verification pass was executed on 2026-03-13 after the Wave 5 activation root cause was isolated to service-env propagation.

This pass stayed within the approved Phase 2 boundaries:

- no scope widening beyond the exact approved 3-prompt subset
- no capability-family remapping
- no routing redesign
- no JoOrchestrator move
- no code changes to the Wave 5 runtime behavior

The outcome of this pass is not a rollout expansion.

The source-side env-forwarding fix is now deployed into the installed launchd-managed runtime, but live Wave 5 gating still does not activate in the managed gateway process.

The live gateway was not stable enough to produce comparable exposure reports across the prompt matrix, so the primary Phase 3 result is a validation blocker finding:

- keep scope unchanged
- keep default mode on `shadow`
- do not widen to Phase 4 yet

The managed-runtime redeploy adds a second blocker finding:

- the regenerated LaunchAgent plist contains `OPENCLAW_WAVE5_PHASE2_MODE=active`
- the installed dist contains the service-env forwarding fix and the new `wave5_gate_resolved` rollout-log marker
- but the live managed runtime still exposes the broad tool surface for the exact approved 3-prompt subset

## 1. Validation setup

Reference docs used for this pass:

- `docs/debug/openclaw-custom-patches/WAVE5_TOOL_ROUTING_AND_CAPABILITY_GATING.md`
- `docs/debug/openclaw-custom-patches/WAVE5_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE5_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE5_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE5_PHASE2_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE3_VALIDATION.md`

Runtime preflight performed:

- `openclaw gateway status`
- `openclaw plugins info jo-orchestrator`
- `openclaw channels status --probe`

Observed preflight state:

- gateway LaunchAgent was running and reachable on `ws://127.0.0.1:18789`
- `jo-orchestrator` was loaded from `~/.openclaw/extensions/jo-orchestrator/index.js`
- Discord was configured but reported as `running, disconnected`
- gateway service env already included `OPENCLAW_TURN_TIMING=1`

Mode switching method used for the real-runtime pass:

- `launchctl setenv OPENCLAW_WAVE5_PHASE2_MODE <off|shadow|active>`
- `openclaw gateway restart`

Validation execution path used:

- dashboard-equivalent surface: gateway `chat.send` + `chat.history`
- terminal surface: gateway `agent` + `agent.wait` + `chat.history`
- metrics pull: gateway `sessions.usage` with `includeContextWeight=true`

Why the dashboard-equivalent path was used:

- the WebChat UI uses `chat.send` and `chat.history`
- this matches the documented dashboard/webchat data plane

Discord handling in this pass:

- Discord was probed as a target surface
- the live prompt matrix was not run on Discord because the runtime itself reported the channel as disconnected before validation began

Timeout used for the live prompt matrix:

- `agent.wait timeoutMs = 75000`

## 1.1 Managed-runtime redeploy after service-env fix

Additional deployment steps performed on 2026-03-13:

1. rebuilt the OpenClaw fork with `pnpm build`
2. backed up the installed runtime dist under `/opt/homebrew/lib/node_modules/openclaw/dist.backup-<timestamp>`
3. synced the rebuilt dist into the installed runtime path used by launchd:
   - `/opt/homebrew/lib/node_modules/openclaw/dist`
4. regenerated the LaunchAgent with explicit installer env:
   - `OPENCLAW_WAVE5_PHASE2_MODE=active`
   - `OPENCLAW_WAVE4_PHASE2_MODE=off`
   - `OPENCLAW_TURN_TIMING=1`
5. fully reloaded the managed service with `launchctl bootout` + `launchctl bootstrap`

Deployment verification completed:

- installed dist matched the rebuilt fork dist exactly
- installed dist contained:
  - `OPENCLAW_WAVE5_PHASE2_MODE` forwarding logic
  - `wave5_gate_resolved` rollout-log marker
- LaunchAgent plist contained:
  - `OPENCLAW_TURN_TIMING=1`
  - `OPENCLAW_WAVE4_PHASE2_MODE=off`
  - `OPENCLAW_WAVE5_PHASE2_MODE=active`

Important managed-runtime outcome:

- despite the correct deployed bundle and correct plist env block, the live managed gateway still did not activate Wave 5 gating for the approved subset

## 2. Prompt test matrix

Prompt families executed under `off`, `shadow`, and `active` on the live-available surfaces:

- `check the repo status`
- `read this file`
- `list the files involved`
- `review the repository and summarize its architecture`
- `analyze the project structure and explain how the agent system works`
- `run the tests and report any failures`

Additional protected-deep control executed in `active` only:

- `/check the repo status`

Surfaces executed:

- OpenClaw dashboard-equivalent gateway chat path
- terminal / direct gateway agent path

Surface probed but not fully executed:

- Discord agent interface

Reason Discord matrix was not executed:

- `openclaw channels status --probe` reported Discord as `running, disconnected`

## 3. Off vs Shadow vs Active comparisons

Common 12-run matrix summary on the live-available surfaces:

- `off`: 8 `agent.wait` timeouts, 4 gateway abnormal-closure errors
- `shadow`: 8 `agent.wait` timeouts, 4 gateway abnormal-closure errors
- `active`: the same common 12-run failure profile as `off` and `shadow`

Additional `active` protected-deep probes:

- dashboard protected-deep probe ended with gateway abnormal closure
- terminal protected-deep probe ended with `agent.wait` timeout

Interpretation:

- the live failure pattern was effectively the same across `off`, `shadow`, and `active`
- this pass did not produce evidence that Phase 2 narrowing introduced a new failure mode
- it also did not produce enough successful runs to prove the gating behavior in real runtime conditions

## 4. Tool exposure reduction results

Expected Phase 3 comparison goal:

- compare `exposedToolCount`, `exposedToolNames`, `visibleCapabilityFamilies`, and `toolFamilyCounts` across modes

Observed result in this pass:

- no run produced a persisted `contextWeight` / `systemPromptReport` payload in time for comparison
- all recorded `exposedToolCount` values were `null`
- all recorded `exposedToolNames` values were empty
- all recorded `visibleCapabilityFamilies` values were empty
- all recorded `toolFamilyCounts` values were empty

Consequence:

- this pass could not prove real-runtime exposure reduction
- it also could not disprove it
- the blocker was runtime instability before comparable prompt reports were persisted

## 4.1 Managed-runtime three-prompt subset after redeploy

The exact approved Phase 2 subset was re-run on the reloaded launchd-managed gateway:

- `check the repo status`
- `read this file`
- `list the files involved`

Observed live metrics for all three prompts from the internal runtime log:

- `tool_allowlist_count=0`
- `tool_exposed_count=97`
- `tool_list_chars=9385`
- `tool_schema_chars=42103`

Observed live prompt-surface result:

- the managed runtime stayed on the broad tool surface rather than the expected narrowed 4-tool allowlist
- expected active-mode values were not reached:
  - expected `tool_allowlist_count=4`
  - expected `tool_exposed_count` drop
  - expected `runtime_process` hidden from the visible family

Observed live response result:

- all three reloaded runs timed out on `ollama/qwen3:14b`
- each run then fell through to the existing empty-output safeguard reply
- persisted session transcripts did not show the narrowed Wave 5 family

Most important negative finding:

- the new `wave5_gate_resolved` log line was not observed in the managed runtime logs during the reloaded subset run

Interpretation:

- the source-side service-env fix is deployed correctly
- the managed service definition is regenerated correctly
- but the live managed gateway still does not appear to resolve the Wave 5 mode env into the active runtime path that controls tool exposure

## 5. Schema size comparison

Expected Phase 3 comparison goal:

- compare `toolListChars`, `toolSchemaChars`, and `topSchemaContributors` across modes

Observed result in this pass:

- `toolListChars` was unavailable in all recorded runs
- `toolSchemaChars` was unavailable in all recorded runs
- `topSchemaContributors` was unavailable in all recorded runs

Reason:

- the runs did not complete cleanly enough to persist a usable `systemPromptReport`

Consequence:

- no real-runtime schema savings measurement was produced in this pass

## 6. Fallback behavior results

Expected Phase 3 goal:

- verify `phase2FallbackToFullDeep` and fallback safety in real runs

Observed result in this pass:

- no live run produced an observable Wave 5 outcome payload with fallback fields
- no successful narrowed run completed
- no real-runtime fallback event was captured

Interpretation:

- fallback safety remains validated only by the focused automated Phase 2 tests
- this real-runtime pass did not yield a successful active narrowed run from which fallback could be observed

## 7. Output quality observations

Observed result across the live-available surfaces:

- no run produced usable assistant text in the captured history snapshot
- all timeout cases recorded `usableTextResponse: false`
- all gateway-closure error cases failed before a comparable assistant output could be evaluated

Interpretation:

- there was no observable output-quality regression unique to `active`
- there was also no successful real-runtime answer quality baseline to compare against
- the pass is blocked by runtime stability rather than by a measurable Wave 5 narrowing regression

## 8. Discord vs Dashboard vs Terminal differences

### Dashboard

Observed pattern:

- `repo_status`, `read_file`, `reasoning_control`, and `operational_control` timed out
- `list_files` and `memory_control` hit gateway abnormal-closure errors

### Terminal

Observed pattern:

- most terminal runs timed out
- `repo_status` and `read_file` also showed gateway abnormal-closure errors in `off` and `shadow`
- `active` terminal `read_file` shifted from abnormal closure to timeout, but still did not produce a usable result or prompt report

### Discord

Observed preflight state:

- configured but disconnected

Effect on this pass:

- Discord did not qualify as a live execution surface for the full prompt matrix
- only the availability probe was recorded for Discord

## 9. Any anomalies discovered

Primary anomalies:

1. The live gateway produced repeated abnormal WebSocket closures:
   - `1006 abnormal closure (no close frame)`

2. The live runs frequently timed out with no `startedAt` / `endedAt` from `agent.wait` and no usable transcript output.

3. `sessions.usage` did not return a comparable `contextWeight` payload for the validation runs, so the Phase 3 exposure and schema metrics remained unavailable.

4. Discord was not live enough for matrix execution because the runtime probe reported it as disconnected before the run started.

Interpretation:

- these anomalies occurred in `off`, `shadow`, and `active`
- because the failure signature was cross-mode and cross-surface on the common prompt set, the evidence points to a broader runtime/gateway stability problem rather than a Wave 5 Phase 2 gating regression

## 10. Recommendation: keep scope, widen scope, or adjust gating

Recommendation:

- keep scope

Detailed recommendation:

1. Do not widen Wave 5 beyond the exact approved 3-prompt subset.
2. Keep the default live mode on `shadow`.
3. Do not proceed to a broader Phase 4 rollout until the live gateway can complete the Phase 3 matrix successfully enough to persist comparable `systemPromptReport` data.
4. Treat gateway abnormal closures, cross-mode timeouts, Discord disconnection, and the managed-runtime Wave 5 activation miss as Phase 3 blockers that must be resolved before any rollout decision.
5. Re-run Phase 3 after runtime stability is restored, then compare the originally planned metrics again:
   - tool exposure
   - capability-family counts
   - tool/schema chars
   - usable output quality
   - fallback behavior

Additional recommendation from the managed-runtime redeploy:

6. Treat the current launchd-managed env propagation path as not yet proven end-to-end for Wave 5 mode activation, even though the source fix and plist rewrite are correct.
7. Do not mark Wave 5 complete until a live managed-gateway run for the exact approved 3-prompt subset shows the expected narrowed tool surface.

## Validation conclusion

This pass does not justify widening scope.

It also does not show evidence that Wave 5 Phase 2 active gating is uniquely harmful.

What it does show is that the current live runtime is not stable enough to complete the planned Phase 3 real-world comparison, so the correct next step is to keep the current narrow Phase 2 scope and fix the validation environment before considering Phase 4.

The 2026-03-13 managed-runtime redeploy extends that conclusion:

- the fix is deployed into the installed runtime
- the LaunchAgent plist is correct
- but the live managed gateway still does not activate the Wave 5 gate for the exact approved subset

Wave 5 therefore remains incomplete in live managed-runtime terms.
