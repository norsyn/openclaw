# Wave 3 Phase 2 Implementation

## Status

Wave 3 Phase 2 is implemented as a narrow bounded-adaptation layer on top of the unchanged Wave 2 classifier and the Phase 1 policy event seam.

The implementation keeps the rollout conservative:

- default mode is `shadow`
- persistence is lightweight and local to `OPENCLAW_STATE_DIR`
- hard deep blockers win before any adaptive promotion can apply
- deep remains the safe fallback
- JoMemory internals are unchanged

## What changed

### 1. Bounded policy resolution

Updated:

- [src/auto-reply/reply/response-policy.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.ts)
- [src/auto-reply/reply/response-policy-rules.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-rules.ts)

Phase 2 adds:

- hard deep blockers
- explicit override reason codes
- mode-aware bounded override resolution
- additive event fields for `policyMode`, `shadowOnly`, `candidateProfile`, `normalizedKey`, and `promptPreview`
- outcome-driven evidence updates and state demotion rules

Implemented hard blockers:

- attachments
- slash commands
- continuity and memory cues
- operational, debugging, and tool-backed intent cues

Implemented bounded directions:

- `fast -> direct`
- `deep -> fast`
- `direct -> fast`
- `fast -> deep`

Important boundary:

- existing Wave 2 exact direct replies remain base behavior and are not replaced by adaptive state

### 2. Lightweight policy-state persistence

Added:

- [src/auto-reply/reply/response-policy-state.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-state.ts)

Implemented behavior:

- versioned state store
- best-effort JSON load/save
- atomic temp-file rename writes
- corruption fallback to empty state
- prune least-recently-updated entries first
- one-shot reset via `OPENCLAW_RESPONSE_POLICY_RESET=1`

Persistence path:

- `OPENCLAW_STATE_DIR/response-policy/state.v1.json`

### 3. Execution-path wiring

Updated:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)

Decision-side behavior:

- load the policy-state entry for the normalized prompt key
- resolve a bounded policy decision after the existing Wave 2 classifier
- emit the extended Phase 2 decision event on the existing `policy` event stream
- apply only the selected bounded profile, without redesigning routing

Outcome-side behavior:

- emit the extended Phase 2 outcome event on the existing `policy` stream
- update policy evidence after final outcome is known
- persist state best-effort without blocking reply routing on I/O failure

## Exact files changed

Code:

- [src/auto-reply/reply/response-policy.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.ts)
- [src/auto-reply/reply/response-policy-rules.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-rules.ts)
- [src/auto-reply/reply/response-policy-state.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-state.ts)
- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)
- [src/auto-reply/reply/response-policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.test.ts)
- [src/auto-reply/reply/response-policy-state.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy-state.test.ts)
- [src/auto-reply/reply/agent-runner.policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.policy.test.ts)

Docs:

- [docs/debug/openclaw-custom-patches/WAVE3_PHASE2_PATCH_PLAN.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_PHASE2_PATCH_PLAN.md)
- [docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md)
- [docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md)

## Mode behavior

Implemented modes:

- `off`
  - no adaptive state lookup is used for profile changes
  - no overrides are applied
  - state recording is skipped
- `shadow`
  - candidate overrides are computed and logged
  - actual routing stays on the base classifier result
  - evidence still accumulates for later validation
- `adaptive`
  - bounded overrides can be applied after hard blockers pass
  - evidence and demotion logic continue to update state

Default mode:

- `shadow`

Mode control:

- `OPENCLAW_RESPONSE_POLICY_MODE=off|shadow|adaptive`

## State schema and persistence behavior

Top-level store:

```ts
type ResponsePolicyStateStore = {
  version: 1;
  mode: "off" | "shadow" | "adaptive";
  updatedAt: number;
  entries: Record<string, ResponsePolicyStateEntry>;
};
```

Per-entry fields:

- normalized `key`
- short `promptPreview`
- optional `preferredProfile`
- bounded evidence counters
- recent last-decision metadata
- optional `cooldownUntil`

Implemented recent metadata includes:

- last classifier profile
- last selected profile
- last override reason codes
- last fallback flag
- last override-applied flag
- last shadow-only flag
- last policy mode
- last updated timestamp
- optional cooldown

Persistence guarantees:

- atomic temp-file rename write
- corruption degrades to empty state
- missing file degrades to empty state
- prune cap is `200` entries
- least-recently-updated entries are evicted first

Reset behavior:

- delete the state file directly
- or set `OPENCLAW_RESPONSE_POLICY_RESET=1`

## Curated candidate sets

Initial code-owned `deep -> fast` candidate set:

- `who are you`
- `what is your name`
- `what can you do`
- `how can you help`

Initial code-owned adaptive direct reply set:

- `got it` -> `Got it.`
- `understood` -> `Understood.`
- `works for me` -> `Works for me.`

These sets are code-owned only in Phase 2. They are not operator-editable yet.

## Event schema extension

Phase 1 fields were preserved.

Phase 2 extends the decision and outcome event records with:

- `policyVersion: "wave3-phase2"`
- `policyMode`
- `shadowOnly`
- `promptPreview`
- `normalizedKey`
- `statePreferredProfile`
- `candidateProfile`

This keeps events explainable and grep-friendly while preserving the original Phase 1 structure.

## Tests run

OpenClaw focused Phase 2 + Phase 1 + Wave 2 + Wave 1 suite:

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
- 69 tests passed

JoMemory middleware regression:

```bash
pnpm --filter ./packages/joorchestrator exec vitest run tests/jomemory-turn-middleware.test.ts
```

Result:

- 1 file passed
- 17 tests passed

## Rollout guidance

Recommended first rollout:

- keep production on `shadow`
- inspect policy events and the state file under `OPENCLAW_STATE_DIR`
- verify that candidate promotions stay narrow and expected
- enable `adaptive` only after reviewing shadow evidence for the curated candidate set

Recommended rollout order:

1. deploy with default `shadow`
2. inspect `policy` events and `state.v1.json`
3. confirm no protected-deep regressions
4. enable `adaptive` only in controlled environments first

## Known limitations

- Phase 2 state is still local-process control state, not a shared service or fleet-level telemetry system.
- Evidence counters are intentionally simple and conservative; there is no decay or time-window weighting yet.
- `deep -> fast` is limited to the small code-owned candidate set and evidence thresholds shipped here.
- Adaptive direct promotion exists for the code-owned deterministic set, but current base Wave 2 exact direct replies remain the dominant direct path by design.
- `off` mode skips adaptive state recording entirely rather than keeping a passive background store.

## Safety boundaries preserved

Explicitly unchanged:

- Wave 1 safeguard behavior
- Wave 2 classifier rules
- Wave 2 exact direct reply catalog
- JoMemory internals and retrieval heuristics
- overall routing architecture and shared reply flow shape

Phase 2 remains an additive bounded layer above the base classifier rather than a routing redesign.
