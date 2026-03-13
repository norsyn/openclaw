# Wave 3 Patch Plan

## Status

This document is a planning pass only.

Wave 3 Phase 1 must add bounded response-policy scaffolding and decision logging without changing current Wave 1 safeguards or Wave 2 fast-turn behavior.

The reference architecture remains:

- [docs/research/wave_3_adaptive_policy_architecture.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/docs/research/wave_3_adaptive_policy_architecture.md)

## Wave 3 goals

Wave 3 should introduce a bounded response policy layer that sits above the existing Wave 2 classifier and can later support conservative profile adaptation.

Phase 1 should do only two things:

- add a policy decision boundary above the existing classifier
- record enough turn outcome data to support later bounded overrides

Phase 1 should not:

- change the Wave 2 classifier rules
- change direct, fast, or deep execution behavior
- change JoMemory retrieval behavior
- change tool exposure or tool routing
- change deep reasoning flows
- change Wave 1 safety behavior

## Architecture mapped to real source files

### A. Current turn-selection path

Current shared reply path:

- [src/auto-reply/reply/get-reply.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/get-reply.ts)
- [src/auto-reply/reply/get-reply-run.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/get-reply-run.ts)
- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)
- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

Observed responsibility split:

- `get-reply.ts` prepares the inbound turn and session state, then delegates to `runPreparedReply`
- `get-reply-run.ts` assembles the prepared run and delegates to `runReplyAgent`
- `agent-runner.ts` manages run lifecycle, payload finalization, fallback notices, diagnostics, and final response assembly
- `agent-runner-execution.ts` contains the current Wave 2 classifier via `resolveTurnRunProfile` and applies the resulting fast/deep run profile to execution

### B. Existing Wave 2 classifier boundary

The current Wave 2 classifier lives in:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- [src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts)

Important current behavior:

- `resolveTurnRunProfile` currently returns the Wave 2 `fast` or `deep` execution mode
- exact deterministic replies are handled immediately afterward through `resolveFastTurnDirectReply`
- the selected profile is then threaded into prompt reduction, bootstrap reduction, and tool exposure

This means Wave 3 should not replace this classifier. It should wrap its result and decide whether to keep or override it.

### C. Recommended Wave 3 source target

Primary new module:

- `src/auto-reply/reply/response-policy.ts`

Why this is the safest home:

- it keeps Wave 3 separate from the Wave 2 classifier implementation
- it stays in the same shared reply layer as the existing classifier
- it avoids per-channel duplication
- it can be introduced as a narrow additive dependency of `agent-runner-execution.ts`

Recommended supporting surface if a second file is needed:

- `src/auto-reply/reply/response-policy.types.ts`

Phase 1 can likely stay in a single file if kept intentionally small.

### D. Existing observability surfaces that Wave 3 should reuse

OpenClaw event surfaces:

- [src/infra/agent-events.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/infra/agent-events.ts)
- [src/infra/diagnostic-events.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/infra/diagnostic-events.ts)

Current useful data already available in the shared reply flow:

- run id and session key from `agent-events`
- model fallback outcome from `agent-runner.ts`
- total run duration from `agent-runner.ts`
- final payload count and final payload text lengths from `agent-runner.ts`
- tool-result emission activity inside `agent-runner-execution.ts`

Jo boundary that must remain unchanged in Phase 1:

- [packages/joorchestrator/src/runtime/memory/jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts)

Why this file matters:

- it owns JoMemory retrieval timing and retrieval heuristics
- it already emits `memory_retrieval_start` and `memory_retrieval_end`
- Wave 3 should consume those signals if needed later, not rewrite that middleware in Phase 1

## Safest insertion points

### 1. Decision insertion point

Safest point:

- immediately after `resolveTurnRunProfile(...)` in [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

Recommended shape:

1. call the existing Wave 2 classifier unchanged
2. pass its result into a new Wave 3 policy resolver
3. use the policy resolver output as the effective response profile for the rest of the run

Why this is safest:

- it preserves the exact current classifier logic as the source decision input
- it gives Wave 3 the correct architectural position: above the classifier, below execution
- it minimizes the patch surface to one existing callsite

### 2. Direct-profile handling point

Safest point:

- keep the existing direct exact-match handling where it already is in [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

Recommendation:

- in Phase 1, do not move deterministic direct replies out of the current execution file
- instead, have the policy layer record whether the selected profile is `direct`, then continue to let the existing direct-return path execute unchanged

Why this is safer than refactoring direct replies now:

- direct behavior is currently coupled to exact trivial-turn handling
- moving it during Phase 1 would create unnecessary behavior risk
- Phase 1 needs scaffolding, not a routing rewrite

### 3. Outcome logging point

Safest point:

- after `runAgentTurnWithFallback(...)` returns in [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)

Why this point is best:

- total run latency is already known there
- fallback outcome is already resolved there
- final payloads and response lengths are already known there
- it is the narrowest place to log end-of-turn outcome without disturbing lower-level execution

Recommended Phase 1 split:

- `agent-runner-execution.ts` records the decision-side data
- `agent-runner.ts` records the outcome-side data

## Minimal Phase 1 data structures

### A. Response profile enum

Recommended enum:

- `direct`
- `fast`
- `deep`

Reason:

- Wave 3 architecture is defined in these three profiles even though the current Wave 2 classifier exposes only `fast` and `deep`
- deterministic direct replies should be first-class in policy records even if Phase 1 continues to execute them through existing exact-match logic

### B. Classifier snapshot

Recommended minimal structure:

```ts
type Wave2ClassifierSnapshot = {
  mode: "fast" | "deep";
  disableTools: boolean;
  toolNameAllowlist?: string[];
  directReplyEligible: boolean;
};
```

Reason:

- this captures the Wave 2 decision exactly as it exists now
- it avoids changing the public Wave 2 classifier contract
- `directReplyEligible` is additive and derived from the current direct-exact-match check

### C. Policy decision record

Recommended minimal structure:

```ts
type ResponsePolicyDecision = {
  policyVersion: "wave3-phase1";
  classifierProfile: "fast" | "deep";
  selectedProfile: "direct" | "fast" | "deep";
  overrideApplied: boolean;
  overrideReasonCodes: string[];
};
```

Phase 1 recommendation:

- `overrideApplied` should almost always be `false`
- only hard safety promotions should be allowed in Phase 1 if needed to maintain architecture invariants
- if no safety promotion is needed, Phase 1 can operate in pure shadow mode while still logging the future override surface

### D. Turn outcome record

Recommended minimal structure:

```ts
type ResponsePolicyTurnOutcome = {
  latencyMs: number;
  retrievalUsed: boolean;
  toolsUsed: boolean;
  toolNames?: string[];
  fallbackTriggered: boolean;
  responseLength: number;
};
```

Notes:

- `retrievalUsed` should be derived from existing retrieval timing signals, not by adding new JoMemory behavior
- `toolsUsed` can be true if any tool result or tool-output callbacks were emitted
- `responseLength` should be the final assistant-visible text length after payload assembly

### E. Full Phase 1 log envelope

Recommended minimal full record:

```ts
type ResponsePolicyTurnRecord = {
  runId: string;
  sessionKey?: string;
  timestamp: number;
  prompt: string;
  hasAttachments: boolean;
  isSlashCommand: boolean;
  classifier: Wave2ClassifierSnapshot;
  decision: ResponsePolicyDecision;
  outcome: ResponsePolicyTurnOutcome;
};
```

Practical Phase 1 note:

- if raw prompt retention is too sensitive for always-on diagnostics, store:
  - full prompt only in local debug logging
  - plus a normalized short preview and stable hash for future aggregation

The architecture document asks for prompt text, so the Phase 1 plan should preserve that field in the local record shape even if production emission later redacts or truncates it.

## Smallest safe Phase 1 implementation plan

### Step 1. Add a bounded policy resolver without changing behavior

Add a new helper in:

- `src/auto-reply/reply/response-policy.ts`

Minimal function shape:

- input:
  - current prompt text
  - attachment/slash-command flags
  - Wave 2 classifier result
  - whether deterministic direct reply is available
- output:
  - selected profile
  - whether an override was applied
  - reason codes

Phase 1 behavior:

- preserve the Wave 2 result by default
- map exact deterministic direct replies to `direct`
- allow only conservative safety promotions to `deep` if architecture invariants require them
- do not introduce any fast-to-direct or deep-to-fast learning yet

### Step 2. Call the policy resolver at the existing classifier boundary

Touch only:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

Recommended change shape:

- keep `resolveTurnRunProfile(...)` intact
- compute a `policyDecision`
- continue using the resulting selected profile to decide:
  - direct deterministic short-circuit
  - prompt mode
  - bootstrap context mode
  - tool suppression / allowlist

In Phase 1, selected behavior should match current behavior.

### Step 3. Add outcome logging with additive instrumentation only

Primary target:

- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)

Recommended logging shape:

- emit one additive diagnostic or agent event for policy decision start
- emit one additive diagnostic or agent event for policy outcome completion

Lowest-risk recommendation:

- prefer diagnostics for structured summary records
- optionally also emit a lightweight `agent-events` stream event for live UI observability

### Step 4. Reuse existing retrieval and tool signals instead of modifying those systems

Do not change:

- [packages/joorchestrator/src/runtime/memory/jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts)
- OpenClaw tool construction paths

Instead derive:

- `retrievalUsed` from existing memory retrieval timing or an already available retrieval flag
- `toolsUsed` from existing tool-result emission hooks and run metadata

### Step 5. Add narrow tests that prove no behavior drift

Primary OpenClaw tests to add or extend:

- [src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts)
- new policy resolver tests near `response-policy.ts`
- targeted `agent-runner.ts` tests for policy outcome logging

Test objective for Phase 1:

- identical direct / fast / deep runtime behavior before and after the patch
- additive logs only
- no change to Wave 2 classification expectations

## Risk analysis

### 1. Biggest architectural risk

Risk:

- implementing Wave 3 by editing Wave 2 classifier rules directly would blur the boundary between classifier and policy layer

Consequence:

- future adaptation logic becomes hard to reason about
- Wave 2 regressions become more likely

Mitigation:

- keep Wave 2 classification unchanged in `resolveTurnRunProfile`
- add a separate policy wrapper module

### 2. Biggest behavior risk

Risk:

- a policy override path could accidentally change current fast/deep routing during Phase 1

Mitigation:

- default Phase 1 to shadow-equivalent behavior
- allow only explicit safety promotions if necessary
- add regression tests using current Wave 2 fixtures

### 3. JoMemory interference risk

Risk:

- policy logging could tempt the implementation to add retrieval flags by changing JoMemory middleware

Mitigation:

- treat JoMemory retrieval timing as an external signal source
- do not change `maybeSearch`, `runPreResponseHook`, or the retrieval heuristics in Phase 1

### 4. Tool-routing interference risk

Risk:

- the policy layer could be implemented too low in the stack and accidentally change tool exposure or execution behavior

Mitigation:

- insert the policy decision before run options are applied
- keep tool plumbing unchanged below that line
- limit Phase 1 to logging what happened

### 5. Deep reasoning regression risk

Risk:

- attachment turns, slash commands, and operational requests could be accidentally demoted

Mitigation:

- hard-code the architecture invariants in the policy resolver:
  - attachments force `deep`
  - slash commands force `deep`
  - explicit tool-backed / operational turns force `deep`
  - uncertainty forces `deep`

### 6. Observability risk

Risk:

- logging the wrong `responseLength`, `retrievalUsed`, or `toolsUsed` values would poison later adaptation work

Mitigation:

- derive each metric from a single existing source of truth
- do not infer signals from prompt text if a runtime fact already exists

## Recommended implementation order

1. Add `response-policy.ts` with types and a no-behavior-change resolver.
2. Wire it into [agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts) immediately after `resolveTurnRunProfile(...)`.
3. Add policy decision logging at the decision boundary.
4. Add policy outcome logging in [agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts).
5. Add tests proving Wave 2 behavior remains identical.
6. Validate that JoMemory retrieval and tool-routing tests remain unchanged.

This order keeps the highest-risk behavior changes out until the scaffolding is already isolated and testable.

## Metrics to capture

Phase 1 should capture these metrics per turn:

- selected profile: `direct`, `fast`, or `deep`
- classifier profile: current Wave 2 result before policy override
- override applied: yes or no
- override reason codes
- latency per turn
- retrieval used
- tools used
- fallback triggered
- response length
- attachment presence
- slash-command presence

Recommended aggregate rollups for later analysis:

- latency by `classifierProfile`
- latency by `selectedProfile`
- fallback rate by `selectedProfile`
- retrieval rate by `selectedProfile`
- tool-use rate by `selectedProfile`
- average response length by `selectedProfile`
- override frequency by reason code

## Expected performance improvements

### Phase 1 expectation

Phase 1 should not aim for user-visible performance improvement.

Expected runtime effect:

- near-zero behavior change
- negligible overhead from one extra decision helper and additive structured logging

The success criterion for Phase 1 is observability and architectural separation, not latency gain.

### Future Wave 3 expectation after Phase 2

Once bounded overrides are enabled later, likely performance wins are:

- more correct promotion of exact trivial patterns into `direct`
- more correct promotion of lightweight questions into `fast`
- fewer unnecessary deep turns for low-risk prompts
- lower prompt assembly cost on promoted turns
- fewer unnecessary retrieval/tool paths on promoted turns

That benefit should come later and only after Phase 1 logging proves the policy decisions are safe.

## Boundaries that must remain unchanged in Phase 1

Do not modify behavior in:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts) classifier rules
- [packages/joorchestrator/src/runtime/memory/jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts) retrieval heuristics
- OpenClaw tool construction / routing below the run-profile decision boundary
- deep reasoning and fallback flows already handled in [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)

## Summary recommendation

The smallest safe Wave 3 Phase 1 patch is:

- add a new `response-policy.ts` module in the shared OpenClaw reply layer
- call it immediately after the existing Wave 2 classifier in `agent-runner-execution.ts`
- keep Phase 1 behavior effectively identical to current routing
- log decision and outcome records using existing event infrastructure
- treat JoMemory and tool-routing systems as signal providers, not patch targets

Wave 3 should start as an architectural wrapper with observability, not as a behavioral rewrite.

## Implementation status

Wave 3 Phase 1 is now implemented as a behavior-neutral scaffold.

Implementation record:

- [docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md)

The implementation keeps the existing Wave 2 classifier as the unchanged base classifier and adds only:

- standalone response-policy scaffolding
- additive policy decision events
- additive policy outcome events
- regression coverage proving no routing change
