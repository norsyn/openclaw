# Wave 3 Shadow Verification

## Status

This document records the Wave 3 Phase 2 shadow-mode verification pass.

Scope stayed narrow:

- default rollout remained `shadow`
- no adaptive rollout change was made
- no policy redesign was performed
- verification focused on bounded candidates, protected deep behavior, and the local policy state file

## Verification method

Verification used the real Phase 2 classifier, policy resolver, event builders, and policy-state persistence helpers in a temporary `OPENCLAW_STATE_DIR`.

Verification state path used for this pass:

```text
/tmp/wave3-shadow-verify/state/response-policy/state.v1.json
```

The prompt sweep wrote a structured verification bundle and a real `state.v1.json`, then those artifacts were inspected directly.

Prompt sweep executed in `shadow` mode:

- `hi`
- `thanks`
- `got it` x4
- `understood` x4
- `works for me` x4
- `summarize this in one sentence`
- `what can you do` x6
- `how can you help` x6
- `what did we decide last time about Wave 1`
- `check the repo status`
- `debug this error`
- `read this file`
- `remember this for later`

Synthetic outcome shaping stayed conservative and was only used to feed the existing evidence-update path:

- retrieval evidence for the continuity query via `jo_memory_search`
- tool evidence for repo/debug/file prompts via `read_file`
- no fallback events injected
- no attachments injected

## Policy event observations

### High-level summary

- total decision/outcome records inspected: `32`
- candidate override records observed in shadow: `2`
- candidate prompt families observed: `what can you do`, `how can you help`
- classifier profiles observed:
  - `deep`: `29`
  - `fast`: `3`
- selected profiles observed in shadow:
  - `deep`: `29`
  - `direct`: `3`

Important shadow guarantee held for the whole sweep:

- `selectedProfile` remained aligned with the base classifier result for every shadow-mode record
- no candidate override was actually applied in shadow mode

### Bounded candidate overrides observed

Shadow-only candidate overrides appeared only after repeated clean evidence for the curated deep-to-fast family:

- `what can you do` on iteration `6`
  - classifier profile: `deep`
  - selected profile: `deep`
  - candidate profile: `fast`
  - `shadowOnly: true`
  - reason codes:
    - `preferred_profile_state`
    - `curated_fast_candidate`
    - `repeated_fast_success`
- `how can you help` on iteration `6`
  - classifier profile: `deep`
  - selected profile: `deep`
  - candidate profile: `fast`
  - `shadowOnly: true`
  - reason codes:
    - `preferred_profile_state`
    - `curated_fast_candidate`
    - `repeated_fast_success`

This is narrow and explainable. No unexpected candidate families appeared.

### Direct and trivial base behavior observed

Base direct replies behaved as expected and did not become policy overrides:

- `hi`
  - classifier profile: `fast`
  - selected profile: `direct`
  - `overrideApplied: false`
- `thanks`
  - classifier profile: `fast`
  - selected profile: `direct`
  - `overrideApplied: false`
- `summarize this in one sentence`
  - classifier profile: `fast`
  - selected profile: `direct`
  - `overrideApplied: false`

### Reason-code sanity

Observed reason-code counts across the sweep:

- `insufficient_evidence`: `22`
- `protected_deep_trigger`: `5`
- `operational_intent_detected`: `3`
- `continuity_detected`: `2`
- `preferred_profile_state`: `2`
- `curated_fast_candidate`: `2`
- `repeated_fast_success`: `2`

These were sensible for the prompt mix used:

- insufficient evidence dominated during warm-up runs, which is expected
- protected deep markers appeared only on continuity or operational prompts
- candidate promotion codes appeared only for the curated deep-to-fast family

## State file observations

### Shape and inspectability

The state file matched the documented Phase 2 schema:

- top-level fields present:
  - `version`
  - `mode`
  - `updatedAt`
  - `entries`
- per-entry fields present:
  - `key`
  - `promptPreview`
  - `evidence`
  - `recent`
  - optional `preferredProfile`

State file summary for this pass:

- mode: `shadow`
- entries: `13`
- max preview length observed: `41`

### Key and preview quality

Observed properties:

- keys were normalized lowercase prompt-family strings
- no repeated prompt history or transcript accumulation was present
- previews were short and inspectable
- longest preview observed was:
  - `what did we decide last time about wave 1`
  - length `41`

This indicates no obvious prompt-history bloat.

### Evidence-counter behavior

Observed evidence was directionally sane:

- base direct prompts accumulated `directSuccessCount`
- curated deep-to-fast families accumulated repeated `deepSuccessCount` plus clean no-tool and no-retrieval counts
- protected deep prompts accumulated `toolRequiredCount` and `retrievalRequiredCount` where expected

Examples:

- `what can you do`
  - `deepSuccessCount: 6`
  - `noToolCount: 6`
  - `noRetrievalCount: 6`
  - formed `preferredProfile: "fast"`
- `what did we decide last time about wave 1`
  - `toolRequiredCount: 1`
  - `retrievalRequiredCount: 1`
  - no preferred profile formed
- `check the repo status`
  - `toolRequiredCount: 1`
  - no preferred profile formed

### Preferred profiles observed

Only two preferred profiles formed during the sweep:

- `what can you do` -> `fast`
- `how can you help` -> `fast`

No unsafe preferred profiles appeared.

### Pruning observation

This verification sweep did not hit the max-entry cap, so live pruning was not exercised here.

Pruning sanity is still covered by the focused unit test:

- [src/auto-reply/reply/response-policy-state.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-state.test.ts)

## Protected-deep verification

Protected deep prompts stayed protected and did not surface shadow promotion candidates.

Observed protected cases:

- `what did we decide last time about Wave 1`
  - classifier profile: `deep`
  - selected profile: `deep`
  - reason codes:
    - `continuity_detected`
    - `protected_deep_trigger`
  - retrieval/tool evidence recorded
- `check the repo status`
  - classifier profile: `deep`
  - selected profile: `deep`
  - reason codes:
    - `operational_intent_detected`
    - `protected_deep_trigger`
- `debug this error`
  - classifier profile: `deep`
  - selected profile: `deep`
  - reason codes:
    - `operational_intent_detected`
    - `protected_deep_trigger`
- `read this file`
  - classifier profile: `deep`
  - selected profile: `deep`
  - reason codes:
    - `operational_intent_detected`
    - `protected_deep_trigger`
- `remember this for later`
  - classifier profile: `deep`
  - selected profile: `deep`
  - reason codes:
    - `continuity_detected`
    - `protected_deep_trigger`

This is the expected safety behavior.

## Candidate override patterns

Observed candidate pattern families were narrow:

- only the curated code-owned deep-to-fast family surfaced shadow candidates in this sweep
- no protected-deep prompt surfaced a candidate
- no base direct prompt surfaced a candidate override

Important negative result:

- the adaptive-direct family did not surface any shadow candidates for:
  - `got it`
  - `understood`
  - `works for me`

Observed reason:

- those prompts currently classify as `deep` under the unchanged Wave 2 classifier
- because the Phase 2 adaptive direct rule only runs from a `fast` base profile, those prompts never enter the `fast -> direct` candidate path

This is a real rule-boundary issue, not policy drift.

## Rollout recommendation

Shadow behavior is safe enough to justify a controlled adaptive trial for the narrow curated deep-to-fast family only.

Current evidence supports controlled adaptive enablement only for:

- `what can you do`
- `how can you help`

Recommended rollout posture:

1. keep default rollout on `shadow`
2. if adaptive is tested, scope it to a controlled environment only
3. treat the current curated deep-to-fast family as the only acceptable initial adaptive family from this verification pass

Do not treat the adaptive-direct family as ready based on this pass.

## Issues found

### 1. Adaptive-direct family is currently unreachable

Prompts intended as adaptive-direct candidates:

- `got it`
- `understood`
- `works for me`

Observed behavior:

- classifier profile stayed `deep`
- no shadow candidate profile appeared
- reason code stayed `insufficient_evidence`
- no `preferredProfile` formed

Interpretation:

- the code-owned adaptive-direct set exists, but the current base classifier does not route these prompts into the `fast` branch where the `fast -> direct` rule can operate

This should be tightened before any adaptive-direct rollout is considered.

### 2. Pruning was not exercised by the live sweep

No issue was observed in implementation, but this pass did not hit the size cap, so pruning remains test-verified rather than sweep-verified.

## Tests run for this verification pass

One-off shadow verification harness:

```bash
pnpm exec vitest run test/wave3-shadow-verification.test.ts
```

Result:

- `1` file passed
- `1` verification test passed

Existing focused verification already passing and still relevant:

- [src/auto-reply/reply/response-policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.test.ts)
- [src/auto-reply/reply/response-policy-state.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-state.test.ts)
- [src/auto-reply/reply/agent-runner.policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.policy.test.ts)

## Bottom line

The shadow pass shows a sane, narrow, and safe policy layer for the curated deep-to-fast family.

It does not yet show readiness for adaptive-direct candidate families because those prompts do not currently enter the required fast base path.

## Follow-through

That shadow conclusion has now been carried into a controlled adaptive rollout limited to the two validated families only:

- `what can you do`
- `how can you help`

Rollout and verification details are recorded here:

- [docs/debug/openclaw-custom-patches/WAVE3_ADAPTIVE_ROLLOUT.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_ADAPTIVE_ROLLOUT.md)
