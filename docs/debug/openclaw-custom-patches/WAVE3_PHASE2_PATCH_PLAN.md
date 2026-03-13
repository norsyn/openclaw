# Wave 3 Phase 2 Patch Plan

## Status

Wave 3 Phase 2 is now implemented.

This document remains the design rationale and target map for the shipped Phase 2 patch.

Wave 3 Phase 2 should add bounded policy overrides on top of:

- the unchanged Wave 2 classifier
- the Wave 3 Phase 1 policy logging layer

Phase 2 must remain conservative, explainable, and reversible.

Reference architecture:

- [docs/research/wave_3_adaptive_policy_architecture.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/docs/research/wave_3_adaptive_policy_architecture.md)
- [docs/research/wave_3_bounded_adaptation_rules.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/docs/research/wave_3_bounded_adaptation_rules.md)

## Phase 2 summary

The smallest safe Phase 2 implementation is not a new routing system.

It is a bounded extension of the existing response-policy seam introduced in Phase 1:

1. keep the Wave 2 classifier as the base decision engine
2. add a small policy-state store keyed by normalized prompt pattern
3. allow only narrow, explicit promotions and demotions
4. require hard blockers before any promotion can apply
5. update policy state only after real turn outcomes are known
6. default to deep whenever uncertain

Smallest-safe behavior recommendation:

- fast -> direct can be active in Phase 2, but only for exact deterministic pattern families
- deep -> fast should be much more conservative and should require both a curated candidate family and accumulated success evidence
- demotions should be easier than promotions
- first rollout should default to `shadow` or explicit opt-in `adaptive`, not silent always-on adaptation

## Exact source targets

### OpenClaw runtime targets

Primary implementation targets:

- [src/auto-reply/reply/response-policy.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.ts)
  - extend Phase 1 decision types
  - add override reason codes
  - add bounded override resolver
  - add policy-evidence update helpers
- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
  - keep Wave 2 classifier unchanged
  - apply bounded override decision immediately after classifier resolution
  - preserve hard deep blockers before any adaptive promotion applies
- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)
  - update policy evidence after the final outcome is known
  - emit additive promotion/demotion evidence in the existing policy event stream

Recommended new supporting files:

- `src/auto-reply/reply/response-policy-state.ts`
  - state types
  - load/save/reset helpers
  - bounded-size pruning
  - atomic write behavior
- `src/auto-reply/reply/response-policy-rules.ts`
  - optional split if `response-policy.ts` becomes too dense
  - curated candidate sets and hard blocker helpers

Recommended state-dir and testing targets:

- [src/test-helpers/state-dir-env.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/test-helpers/state-dir-env.ts)
  - reuse existing `OPENCLAW_STATE_DIR` test plumbing for policy-state persistence tests
- new tests:
  - `src/auto-reply/reply/response-policy-state.test.ts`
  - `src/auto-reply/reply/response-policy-overrides.test.ts`

### Optional config targets

For the smallest safe Phase 2 rollout, config-schema changes are not required.

Recommended first rollout:

- use environment gating plus state-file reset
- avoid expanding OpenClaw config schema unless productizing the feature later

If config-backed controls are later required, likely targets are:

- [src/config/types.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/config/types.ts)
- `src/config/types.openclaw.ts`
- `src/config/zod-schema.ts`

## Proposed policy state

### Smallest safe store shape

Recommended top-level store:

```ts
type ResponsePolicyStateStore = {
  version: 1;
  mode: "off" | "shadow" | "adaptive";
  updatedAt: number;
  entries: Record<string, ResponsePolicyStateEntry>;
};
```

Recommended entry shape:

```ts
type ResponsePolicyStateEntry = {
  key: string;
  promptPreview: string;
  preferredProfile?: "direct" | "fast";
  evidence: {
    directSuccessCount: number;
    fastSuccessCount: number;
    deepSuccessCount: number;
    noToolCount: number;
    noRetrievalCount: number;
    fallbackCount: number;
    toolRequiredCount: number;
    retrievalRequiredCount: number;
    ambiguityCount: number;
  };
  recent: {
    lastClassifierProfile: "fast" | "deep";
    lastSelectedProfile: "direct" | "fast" | "deep";
    lastOverrideReasonCodes: string[];
    lastFallbackTriggered: boolean;
    lastUpdatedAt: number;
    cooldownUntil?: number;
  };
};
```

### Why this shape is the smallest safe one

- `key` keeps policy state keyed to a normalized prompt family rather than full raw prompt storage
- `promptPreview` keeps the state inspectable for operators
- `preferredProfile` remains narrow and does not need to store arbitrary strategy data
- `evidence` uses simple counters instead of opaque scores
- `recent.cooldownUntil` gives a reversible backoff mechanism after negative evidence
- state remains human-readable JSON and bounded in size

### Keying recommendation

Use a normalized key derived from:

- lowercased prompt text
- collapsed whitespace
- injected timestamp stripped
- punctuation normalized conservatively

Keep the preview short.

Recommended preview policy:

- trimmed normalized text
- capped around 80 chars
- no full raw transcript storage in policy state

### Bounded-size recommendation

Keep the store intentionally small.

Recommended cap:

- `100` to `250` entries maximum

Pruning policy:

- evict least recently updated entries first
- preserve entries currently in cooldown only if they are recent

## Override and demotion rules

### Hard blockers before any promotion

These must be checked before state lookup or promotion logic:

- attachments present
- slash command present
- continuity or memory cues present
- explicit operational/debugging intent present
- tool-backed intent already known to require deep behavior

If any blocker applies:

- selected profile must remain `deep`
- adaptive promotion must not run

### Fast -> direct promotion

This is the safest active promotion.

Recommended rule:

- allow only when all of the following are true:
  - classifier profile is `fast`
  - direct reply is deterministic from a fixed template family
  - no tools were needed recently for the key
  - no retrieval was needed recently for the key
  - no fallback was observed recently for the key
  - the key is not in cooldown

Recommended evidence threshold:

- at least `3` recent successful fast-like outcomes for the same key family
- zero recent fallback events
- zero recent tool-required and retrieval-required signals

Important boundary:

- existing hardcoded Wave 2 direct replies remain base behavior
- adaptive `fast -> direct` should initially apply only to additional deterministic pattern families beyond the current built-in exact catalog
- if no such additional family is ready, Phase 2 can ship the rule machinery but keep the active adaptive direct set empty or extremely small

### Deep -> fast promotion

This is riskier and must be much narrower.

Recommended Phase 2 rule:

- allow only when all of the following are true:
  - hard deep blockers are absent
  - prompt is short and low-complexity
  - the normalized key belongs to a curated fast-candidate family
  - no recent tools were actually needed for that key
  - no recent retrieval was actually needed for that key
  - no recent fallback or failure signal exists for that key
  - the key is not in cooldown

Recommended evidence threshold:

- at least `5` prior successful outcomes in the candidate family
- zero recent fallback events
- zero recent tool-required and retrieval-required signals

Important safety note:

- the system does not have true counterfactual fast-profile outcomes for turns that currently ran deep
- because of that, Phase 2 should not autonomously promote arbitrary deep keys to fast based only on deep outcomes
- the smallest safe approach is curated-candidate plus evidence-reinforced promotion, not unrestricted learning

### Direct -> fast demotion

Recommended rule:

- demote only adaptive direct preferences, not the existing hardcoded exact direct catalog
- demote when any of the following are observed:
  - the prompt family becomes ambiguous
  - the key no longer resolves cleanly to a deterministic reply template
  - a negative operator signal or explicit disable flag is recorded
  - the key is manually reset

Practical note:

- current built-in exact direct replies are already deterministic and should remain owned by the base classifier path
- Phase 2 demotion logic should mainly govern adaptive direct preferences added by state, not the built-in direct set

### Fast -> deep demotion

This should be easier than promotion.

Recommended rule:

- demote when any of the following are observed:
  - fallback triggered
  - tools were actually needed
  - retrieval was actually needed
  - continuity or memory signal detected
  - operational/debugging intent detected
  - ambiguity became high

Recommended action:

- clear `preferredProfile` for the key
- put the key in cooldown for a bounded period
- let the base classifier or hard blocker return the next decision

### Reversibility policy

Every adaptive preference must be reversible by:

- automatic demotion from negative evidence
- operator reset of the state file or single key
- global disable mode

No entry should become permanent without the base classifier still remaining valid underneath it.

## Override reason codes

Recommended Phase 2 reason codes:

Promotion-oriented:

- `stable_direct_pattern`
- `repeated_fast_success`
- `curated_fast_candidate`
- `preferred_profile_state`

Blocking and safety:

- `attachment_present`
- `slash_command`
- `continuity_detected`
- `operational_intent_detected`
- `protected_deep_trigger`
- `cooldown_active`
- `insufficient_evidence`

Demotion-oriented:

- `fallback_risk`
- `tool_required`
- `retrieval_required`
- `ambiguity_high`
- `direct_pattern_unstable`
- `adaptive_state_reset`

Control-plane and mode:

- `policy_disabled`
- `policy_shadow_mode`
- `policy_state_missing`
- `policy_state_corrupt`

Contract recommendation:

- keep the existing Phase 1 `overrideReasonCodes` field
- add a single top-level `overrideDecisionCode` or equivalent if the implementation later needs a canonical primary code
- long-term, align this contract shape with JoPolicy-style `decisionCode` and `reasonCodes` rather than inventing a different downstream schema

## Persistence/reset strategy

### Smallest safe persistence strategy

Recommended Phase 2 persistence:

- a lightweight versioned JSON file under `OPENCLAW_STATE_DIR`
- atomic write via temp file plus rename
- best-effort load/save only
- never block reply routing on read/write failure

Recommended path:

- `OPENCLAW_STATE_DIR/response-policy/state.v1.json`

Why this is the smallest safe choice:

- it stays local to OpenClaw where routing decisions already happen
- it is easy to inspect and diff
- it avoids introducing a database or service dependency
- it can be fully deleted without affecting the base classifier

### Disable behavior

Recommended initial mode gate:

- `OPENCLAW_RESPONSE_POLICY_MODE=off|shadow|adaptive`

Recommended semantics:

- `off`
  - no state lookup
  - no overrides
  - optional passive logging only
- `shadow`
  - compute candidate overrides and reason codes
  - do not actually apply them
  - update or simulate evidence depending on implementation choice
- `adaptive`
  - apply bounded overrides after hard blockers pass
  - update policy state from outcomes

Recommended default for first Phase 2 rollout:

- `shadow`

This keeps rollout safe while preserving observability.

### Reset behavior

Recommended reset surfaces:

1. file delete reset
   - delete the state file
   - next process start recreates empty state
2. one-shot env reset
   - `OPENCLAW_RESPONSE_POLICY_RESET=1`
   - clear the state file during startup, then continue normally
3. targeted per-key reset helper
   - optional internal helper, not required for the first cut

Reset requirements:

- reset must never affect Wave 2 base routing
- reset must only remove adaptive preferences and evidence
- corruption on load should degrade into empty state, not runtime failure

## Jo-package integration assessment

### Overall recommendation

Phase 2 should remain primarily an OpenClaw response-policy feature.

There is not a strong enough reason to move active Phase 2 routing logic into a Jo package yet.

The runtime decision boundary, state lookup, and outcome update all live directly in the OpenClaw reply path today. Moving them out now would increase coupling and implementation risk.

### 1. Policy-state persistence

Best Phase 2 home:

- OpenClaw local state file under `OPENCLAW_STATE_DIR`

Why not `jomemory`:

- Phase 2 policy state is not semantic memory
- it is operational routing state tightly coupled to reply selection
- pushing it into JoMemory would turn bounded local routing preferences into a service dependency too early

Why not `jotelemetry`:

- telemetry is the wrong abstraction for the primary source of truth of live policy state
- telemetry can mirror or summarize outcomes later, but it should not be the control-plane store for routing decisions in Phase 2

Why not `jopolicy` yet:

- `jopolicy` is a strong long-term home for canonical decision contracts and reusable rule typing
- but it does not need to own the persistence layer for this first bounded rollout

### 2. Profile-outcome telemetry

Best long-term home:

- `jotelemetry`

Why:

- it already provides structured spans, signals, metrics, and persistence
- it is a better place for aggregate analysis of profile latency, fallback rate, and promotion/demotion counts
- repo memory already notes that telemetry can carry policy `decisionCode`, `reasonCodes`, and `ruleIds`

Phase 2 recommendation:

- do not make `jotelemetry` a hard dependency of Phase 2 runtime routing
- keep primary event emission in OpenClaw agent events
- optionally document a later mirror/export path into `jotelemetry`

### 3. Preference memory

Best long-term home:

- `jomemory`

Why:

- explicit user preferences and personalization belong in durable memory, not local routing state
- that is a Phase 3 concern, not a Phase 2 requirement

Phase 2 recommendation:

- do not store user preference memory in the Phase 2 policy-state store
- keep Phase 2 state limited to routing evidence and adaptive profile preference

### 4. Later adaptive tuning

Best long-term split:

- `jopolicy` for canonical decision contracts and reusable bounded rule definitions
- `jotelemetry` for long-horizon evidence aggregation and reporting
- OpenClaw reply layer for the live per-turn decision application

Practical recommendation:

- Phase 2 should stay OpenClaw-owned
- Phase 3 or later can evaluate lifting shared types into `jopolicy` once the rule surface stabilizes

## Risk analysis

### 1. Hidden drift risk

Risk:

- adaptive state slowly changes routing in ways that are hard to inspect

Mitigation:

- keep state JSON human-readable
- keep counters explicit
- cap entry count
- record last override reason codes
- default first rollout to `shadow`

### 2. Deep-regression risk

Risk:

- an adaptive promotion weakens protected deep-mode guarantees

Mitigation:

- run hard blockers before any state lookup or promotion
- keep deep as the fallback whenever uncertain
- make demotions easier than promotions

### 3. False-learning risk for deep -> fast

Risk:

- the system infers that deep turns could have succeeded as fast turns without real evidence

Mitigation:

- do not allow unrestricted deep -> fast learning from deep outcomes alone
- require curated candidate families plus explicit success evidence

### 4. State corruption or I/O risk

Risk:

- a corrupt state file breaks reply routing

Mitigation:

- best-effort load
- parse failure resets to empty state
- atomic writes only
- base classifier remains fully operational without state

### 5. Privacy and inspectability tension

Risk:

- storing raw prompts in state creates unnecessary retention

Mitigation:

- store normalized key plus short preview
- avoid full prompt history in policy state
- keep detailed prompt text in existing per-turn events instead of long-lived adaptive state

## Recommended implementation order

1. Extend [response-policy.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.ts) with Phase 2 reason codes, hard blocker helpers, and bounded override resolution.
2. Add `response-policy-state.ts` with versioned state types, load/save/reset helpers, and bounded-size pruning.
3. Wire override application into [agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts) immediately after the Wave 2 classifier and before final profile execution.
4. Wire outcome-based evidence updates into [agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts) after final payload assembly and outcome logging.
5. Add `shadow` mode first and keep it as the recommended rollout default.
6. Add focused tests for:
   - hard deep blockers
   - fast -> direct promotion safety
   - deep -> fast promotion safety
   - direct -> fast demotion
   - fast -> deep demotion
   - state load/save/reset behavior under `OPENCLAW_STATE_DIR`
7. Only after shadow validation, enable `adaptive` mode for the curated candidate set.

## Implemented decisions

The implemented Phase 2 patch resolved the planning questions as follows:

1. first rollout defaults to `shadow`
2. lightweight JSON persistence is included in the first implementation
3. the initial curated `deep -> fast` candidate set is code-owned in OpenClaw

## Implementation record

Shipped implementation record:

- [docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md)
