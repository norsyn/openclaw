# Wave 3 Adaptive Rollout

## Status

This document records the final controlled adaptive enablement pass for Wave 3.

The rollout remains intentionally narrow and reversible:

- default mode remains `shadow`
- adaptive remains operator-controlled
- only the two shadow-validated deep-to-fast families are enabled for live adaptive application
- hard deep blockers remain unchanged
- Wave 1 and Wave 2 behavior remain unchanged outside that bounded family

## Exact adaptive scope enabled

Live adaptive deep-to-fast application is now limited to:

- `what can you do`
- `how can you help`

No other deep-to-fast families are eligible in this pass.

In particular, these are not adaptive in this pass:

- `who are you`
- `what is your name`
- all protected-deep continuity prompts
- all protected-deep operational or tool-backed prompts

Adaptive-direct scope was not expanded in this pass.

## Safety boundaries preserved

The following boundaries remain unchanged:

- attachments force deep
- slash commands force deep
- continuity and memory cues force deep
- operational, debugging, and tool-backed prompts force deep
- deep remains the safe fallback when uncertain
- `off`, `shadow`, and `adaptive` modes are unchanged
- default rollout remains `shadow`

## Code change summary

The adaptive implementation path already existed from Phase 2.

This pass only narrowed the code-owned curated deep-to-fast family so adaptive application matches the shadow-validated safe family.

Applied code change:

- [src/auto-reply/reply/response-policy-rules.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-rules.ts)
  - removed unvalidated deep-to-fast families from `CURATED_DEEP_TO_FAST_KEYS`
  - retained only:
    - `what can you do`
    - `how can you help`

## Focused tests added or updated

Updated:

- [src/auto-reply/reply/response-policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.test.ts)
  - shadow still computes but does not apply for `what can you do`
  - adaptive applies for `how can you help`
  - unvalidated family `who are you` no longer adapts even with strong evidence
- [src/auto-reply/reply/agent-runner.policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.policy.test.ts)
  - shadow path validated for `what can you do`
  - adaptive path validated for `how can you help`
  - unvalidated family `who are you` remains deep in adaptive mode

## Tests run

OpenClaw focused policy and regression suites:

```bash
pnpm exec vitest run \
  src/auto-reply/reply/response-policy.test.ts \
  src/auto-reply/reply/response-policy-state.test.ts \
  src/auto-reply/reply/agent-runner.policy.test.ts \
  src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts \
  src/agents/session-tool-result-guard.test.ts \
  src/agents/ollama-stream.test.ts
```

Result:

- 6 files passed
- 71 tests passed

JoMemory regression suite:

```bash
pnpm --filter ./packages/joorchestrator exec vitest run tests/jomemory-turn-middleware.test.ts
```

Result:

- 1 file passed
- 17 tests passed

Controlled adaptive verification harness:

```bash
pnpm exec vitest run test/wave3-adaptive-rollout-verification.test.ts
```

Result:

- 1 file passed
- 1 verification test passed

## Controlled adaptive verification results

Verification compared `shadow` and `adaptive` decisions for:

- `what can you do`
- `how can you help`
- `what did we decide last time about Wave 1`
- `check the repo status`

### Validated adaptive family

`what can you do`

- classifier profile: `deep`
- shadow selected profile: `deep`
- shadow candidate profile: `fast`
- shadow override applied: `false`
- adaptive selected profile: `fast`
- adaptive override applied: `true`
- reason codes:
  - `preferred_profile_state`
  - `curated_fast_candidate`
  - `repeated_fast_success`
- latency impact: not meaningfully measurable in the mocked verification harness

`how can you help`

- classifier profile: `deep`
- shadow selected profile: `deep`
- shadow candidate profile: `fast`
- shadow override applied: `false`
- adaptive selected profile: `fast`
- adaptive override applied: `true`
- reason codes:
  - `preferred_profile_state`
  - `curated_fast_candidate`
  - `repeated_fast_success`
- latency impact: not meaningfully measurable in the mocked verification harness

### Protected-deep checks

`what did we decide last time about Wave 1`

- classifier profile: `deep`
- shadow selected profile: `deep`
- adaptive selected profile: `deep`
- override applied: `false` in both modes
- reason codes:
  - `continuity_detected`
  - `protected_deep_trigger`

`check the repo status`

- classifier profile: `deep`
- shadow selected profile: `deep`
- adaptive selected profile: `deep`
- override applied: `false` in both modes
- reason codes:
  - `operational_intent_detected`
  - `protected_deep_trigger`

## Rollout recommendation

Recommended operational posture:

1. keep default mode on `shadow`
2. use `adaptive` only in controlled environments
3. if adaptive is enabled, treat the scope as limited to:
   - `what can you do`
   - `how can you help`
4. do not broaden the adaptive family without another shadow verification pass

## Adaptive-direct mismatch recommendation

Recommendation:

- defer this to a later Wave 3 polish step

Reason:

- `got it`
- `understood`
- `works for me`

still classify `deep` under the unchanged Wave 2 classifier and therefore do not enter the current `fast -> direct` adaptive path.

There is no obviously tiny safe fix in this pass that would preserve the instruction to avoid redesigning the classifier boundary. The safe move is to leave the mismatch documented and defer it.

## Remaining limitations

- latency impact was not meaningfully measurable from the mocked controlled verification harness; this pass verified decision safety and scope rather than live latency deltas
- the adaptive-direct family remains code-present but practically unreachable
- pruning behavior remains test-verified rather than rollout-verified in this pass

## Bottom line

Controlled adaptive enablement is now in place for exactly the two shadow-validated prompt families and nowhere else.

The rollout stays explainable, reversible, and narrow.
