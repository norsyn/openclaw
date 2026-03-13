# Wave 5 Phase 2 Implementation

## Status

Wave 5 Phase 2 is now implemented as one narrow live capability-gating reduction in OpenClaw.

Scope stayed intentionally narrow:

- no broad family rollout
- no tool-system redesign
- no JoOrchestrator-first implementation
- no weakening of protected deep behavior
- no global tool removals
- no change to Wave 1 safeguards
- no change to Wave 2 fast-turn behavior
- no change to Wave 3 policy behavior
- no change to Wave 4 behavior outside the exact approved subset

The first live target remains exactly this 3-prompt subset:

- `check the repo status`
- `read this file`
- `list the files involved`

The intended visible family for this subset is:

- `read_only_workspace`

The first hidden family remains:

- `runtime_process`

## Exact files changed

Code:

- `src/auto-reply/reply/wave5-capability-routing.ts`
- `src/auto-reply/reply/wave5-capability-routing.test.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`

Docs:

- `docs/debug/openclaw-custom-patches/WAVE5_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE5_IMPLEMENTATION.md`

## Mode behavior implemented

Wave 5 Phase 2 now has explicit mode behavior in `src/auto-reply/reply/wave5-capability-routing.ts`.

Supported mode:

- `OPENCLAW_WAVE5_PHASE2_MODE=off|shadow|active`

Compatibility note:

- `OPENCLAW_WAVE5_PHASE1_MODE` is still accepted as a fallback input so the mode remains backward-compatible during the transition

Semantics:

- `off`
  - do not compute or apply the Wave 5 family gate
- `shadow`
  - compute the candidate gate for the exact approved 3-prompt subset
  - emit `wave5` diagnostics
  - do not change visible tools
- `active`
  - apply the `read_only_workspace` allowlist only for the exact approved 3-prompt subset when all gates pass

Default remains:

- `shadow`

## Gating behavior implemented

The live Wave 5 gate applies only when all of these are true:

1. Wave 3 selected profile is `deep`
2. Wave 4 category is `tool_deep`
3. Wave 4 confidence is `high`
4. prompt is exactly one of the 3 approved prompts
5. Wave 4 `retrievalMode` is `skip`
6. Wave 4 `retrievalLikely` is `false`
7. Wave 5 recommends `read_only_workspace`
8. turn origin is `user_root`
9. no attachments are present
10. no slash-command protected path is present
11. no protected deep blocker is present

If any gate fails:

- the current broader safe path is preserved

What the live gate changes for the exact approved subset:

- visible tool allowlist becomes:
  - `read_file`
  - `grep_search`
  - `file_search`
  - `list_dir`
- this hides the `runtime_process` family on the narrowed path for the exact approved subset

What it does not do:

- it does not broaden beyond the approved 3-prompt subset
- it does not proactively hide other families unless they are absent due to the exact allowlist already in use

## Fallback behavior implemented

Phase 2 reuses the already-validated narrow retry shape from the existing runner path.

Behavior:

- in `active`, if the narrowed run returns no usable assistant text, retry once with the broader deep tool surface

Important boundaries:

- fallback is explicit and measurable
- fallback does not create persistent learning
- fallback remains limited to one retry

## Diagnostics added or extended

The existing `wave5` event stream remains the main Phase 2 diagnostics surface.

Decision-side diagnostics now support:

- `mode`
- `phase2Applied`
- `capabilityFamilyRecommendation`
- `candidateReduction`
- `toolAllowlistRecommendation`
- `hiddenCapabilityFamilies`
- `shadowOnly`
- `gatingDiagnosticOnly`
- additive reason codes

Outcome-side diagnostics now support:

- `visibleCapabilityFamilies`
- `toolFamilyCounts`
- `exposedToolCount`
- `exposedToolNames`
- `toolListChars`
- `toolSchemaChars`
- `topSchemaContributors`
- `fallbackToBroaderToolsWouldBeNeeded`
- `phase2FallbackToFullDeep`
- `usableTextResponse`

## Real-world validation hooks available

Phase 2 can be validated in real runs using:

- the `wave5` decision/outcome event stream
- `/context list`
- `/context detail`
- `systemPromptReport` on the run/session path

These hooks make it possible to compare:

- `off` vs `shadow` vs `active`
- in-scope prompts vs out-of-scope controls
- narrowed-path visible families vs broader-path visible families
- fallback behavior when a narrowed run returns no usable assistant text

## Tests run

Focused Wave 5 Phase 2 and regression suite:

```bash
pnpm exec vitest run \
  src/auto-reply/reply/wave5-capability-routing.test.ts \
  src/auto-reply/reply/agent-runner.policy.test.ts \
  src/auto-reply/reply/wave4-phase3-validation.test.ts \
  src/auto-reply/reply/response-policy.test.ts \
  src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts \
  src/auto-reply/reply/deep-turn-profile.test.ts \
  src/agents/session-tool-result-guard.test.ts \
  src/agents/ollama-stream.test.ts \
  src/agents/system-prompt-report.test.ts \
  src/auto-reply/reply/commands-context-report.test.ts
```

Result:

- 10 files passed
- 124 tests passed

What the focused tests prove:

- shadow computes but does not apply the family gate
- active applies the gate only for the exact approved 3-prompt subset
- `runtime_process` is hidden for that subset
- out-of-scope prompts remain unchanged
- memory-heavy control prompts remain unchanged
- reasoning-heavy control prompts remain unchanged
- protected deep slash-command paths remain unchanged
- fallback to broader deep tools works when needed
- no regression to Wave 4 behavior
- no regression to Wave 3 policy behavior
- no regression to Wave 2 fast-turn behavior
- no regression to Wave 1 safeguard surfaces touched by the runner path

## Known limitations

- the first live Wave 5 scope is still exactly the approved 3-prompt subset only
- this is not yet a general `read_only_workspace` family rollout
- `runtime_process` is the only explicitly targeted hidden family in this phase
- broader real-world validation across dashboard, Discord, and terminal/tool-path runs is still required before any scope widening
- this phase still does not move control-plane ownership into JoOrchestrator

## Recommended Phase 3 next steps

1. Run real `off` / `shadow` / `active` comparisons on dashboard, Discord, and terminal/tool-path validation.
2. Capture before/after metrics for exposed tools, family counts, tool/schema chars, fallback frequency, and output quality.
3. Keep default mode on `shadow` until the real-world validation set is clean.
4. Do not widen beyond the approved 3-prompt subset until the real-world results prove the narrowed path is safe.
