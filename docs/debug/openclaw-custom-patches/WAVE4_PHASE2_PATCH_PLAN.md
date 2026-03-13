# Wave 4 Phase 2 Patch Plan

## 1. Phase 2 summary

Wave 4 Phase 2 should stay narrow.

The smallest safe next step is not to optimize every deep turn. It is to apply one primary selective reduction, and optionally one tightly-coupled secondary reduction, only where the existing Phase 1 diagnostics already provide clear evidence that the reduction is both explainable and measurable.

Recommended Phase 2 direction:

- optimize `tool_deep` first
- apply the first live reduction to the read-only inspection subset of `tool_deep`, not to all deep turns and not to all tool-backed turns
- keep `memory_deep` and `reasoning_deep` on the current Phase 1 diagnosis-only path for now
- preserve Wave 1 safeguards, Wave 2 routing, Wave 3 policy behavior, and deep mode as the safe capable path

Actual Phase 1 diagnostics evidence that makes this the strongest first target:

- `tool_deep` is the only category that currently ships with both a high-confidence category signal and an explicit `retrievalMode: "skip"` default when no continuity cue is present
- Wave 4 outcome events already record `toolExposureCount`, `toolExposedNames`, `toolUsedCount`, and `toolUsedNames`, which directly supports a tool-exposure reduction decision
- Wave 4 outcome events already record `retrievalRecommended`, `retrievalExecuted`, `retrievalLatencyMs`, and `retrievalResultCount`, which directly supports a retrieval-selectivity decision
- prompt contributors already expose `toolListChars` and `toolSchemaChars`, making the tool-exposure payoff measurable without inventing a new measurement path
- `reasoning_deep` currently defaults to low confidence, so it is a poor first live reduction target
- `memory_deep` keeps retrieval as core behavior, so a first-step retrieval change there is less defensible than in `tool_deep`

## 2. Recommended first reduction target(s)

Recommended first reduction:

- high-confidence, read-only `tool_deep` tool exposure narrowing

Recommended optional second reduction in the same phase only if the hint seam stays small:

- high-confidence, read-only `tool_deep` retrieval skip before generation

Why these are the best first reductions:

- they are supported by the actual Phase 1 diagnostics fields that already exist
- they reduce pre-generation cost rather than post-generation behavior
- they can remain model-agnostic
- they do not require redesigning Wave 4 or the tool system
- they leave the rest of deep mode untouched when confidence is weak or cues conflict

Why prompt/context reduction is not first:

- Phase 1 prompt contributors show what is large, but not yet which non-tool prompt segments can be safely removed per deep category without larger behavioral risk
- tool schema and tool list reduction is a more direct and narrower first move than broad bootstrap or skills trimming

Why internal-round/follow-up selectivity is not first:

- Phase 1 only counts internal rounds; it does not yet classify them semantically enough to justify narrowing them safely
- changing internal rounds first would be harder to reason about than changing user-root, read-only `tool_deep` turns

## 3. Deep category to optimize first

Optimize first:

- `tool_deep`

More precisely, optimize first this subset:

- high-confidence, non-memory, read-only inspection `tool_deep` root turns

Representative prompts:

- `check the repo status`
- `read this file`
- `inspect the server logs`
- `show the failing test output`
- `list the files involved`

Do not include in the first live subset:

- ambiguous `tool_deep` turns
- turns with continuity or recall cues
- turns that imply editing, mutation, or broad orchestration
- `memory_deep`
- `reasoning_deep`
- internal model rounds
- subagent-root turns

Why `tool_deep` wins first:

- it already reuses Wave 3 operational cues, so the classification boundary is not new
- Phase 1 currently marks it high-confidence by default
- Phase 1 already recommends `retrievalMode: "skip"` when continuity is absent
- tool-exposure savings are directly measurable via `toolListChars`, `toolSchemaChars`, `toolExposureCount`, and `toolUsedNames`

## 4. Exact source targets

Primary OpenClaw targets for the first reduction:

- `openclaw-upstream/src/auto-reply/reply/deep-turn-profile.ts`
  - extend the existing diagnosis-only profile so `tool_deep` can produce a concrete Phase 2 recommendation for the read-only inspection subset
  - keep category rules intact; only add narrower recommendation logic and reason codes
- `openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts`
  - translate the existing Wave 4 recommendation into an actual execution hint only when Phase 2 gating passes
  - reuse the existing `toolNameAllowlist` runner plumbing instead of inventing a second tool-routing layer
- `openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts`
  - no architectural redesign required; this is already where allowlists are applied and where prompt-contributor measurements are produced
  - should remain the measurement owner for `toolListChars`, `toolSchemaChars`, and exposed tool names/counts
- `openclaw-upstream/src/agents/pi-embedded-runner/run/params.ts`
  - likely only additive if a dedicated Phase 2 hint field is needed beyond the existing allowlist field
- `openclaw-upstream/src/auto-reply/reply/agent-runner.policy.test.ts`
  - extend with Wave 4 Phase 2 coverage proving the selected reduction only applies to the safe `tool_deep` subset and does not alter Wave 2 or Wave 3 decisions
- `openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.test.ts`
  - validate the reduced tool set is the actual set exposed to the runner and reflected in prompt-contributor reporting

Primary Jo targets only if the second reduction is included:

- `Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts`
  - consume a small explicit retrieval-hint contract for the already-classified Phase 2-safe `tool_deep` subset
  - do not duplicate Wave 4 category logic here
- `Jo/packages/joorchestrator/tests/jomemory-turn-middleware.test.ts`
  - add regression coverage that the retrieval skip applies only when the explicit hint requests it and hard blockers are absent

Recommended supporting file only if the mapping becomes noisy:

- `openclaw-upstream/src/auto-reply/reply/deep-turn-phase2-rules.ts`
  - optional helper for read-only `tool_deep` allowlists and Phase 2 gating logic
  - not required if the logic stays small enough inside `deep-turn-profile.ts`

## 5. Gating and safety rules

### Hard blockers

Phase 2 should not apply the live reduction when any of these are true:

- selected profile is not `deep`
- Wave 4 category is not `tool_deep`
- Wave 4 confidence is not `high`
- `retrievalLikely` is true
- `retrievalMode` is not `skip`
- `reasonCodes` include continuity or other memory-recall cues
- prompt implies mutation, editing, fixing, building, running, or broad debugging rather than inspection
- turn origin is `subagent_root`
- turn origin is `agent_internal_round`
- attachments are present
- slash-command or other protected-deep path requires preserving the current full plan

### Confidence threshold

The first live reduction should require all of the following:

- `category === "tool_deep"`
- `confidence === "high"`
- read-only inspection cue family matched
- no memory or continuity cue present
- no signal that prior behavior needed retrieval

### Fallback behavior

Fallback must be immediate and conservative:

- if any gating condition fails, preserve the current full deep behavior
- if the narrowed tool set fails to satisfy the turn safely, Phase 2 should fall back to the current full deep tool exposure rather than fail the turn
- if the retrieval-skip hint is absent or malformed, preserve current JoMemory behavior

### Phase 2 rollout flags

Recommended smallest safe control plane:

- `OPENCLAW_WAVE4_PHASE2_MODE=off|shadow|active`
- default: `shadow`

Recommended semantics:

- `off`
  - Phase 1 diagnostics continue unchanged
  - Phase 2 candidate reductions are neither computed nor applied
- `shadow`
  - compute the candidate allowlist and retrieval skip decision
  - emit additive diagnostics showing what would have changed
  - do not apply the reduction
- `active`
  - apply only the gated read-only `tool_deep` reduction

Unlike Wave 3, no persistence state is recommended for Phase 2.

Reason:

- this is execution-plan shaping, not adaptive policy learning
- the reduction should stay explicit, bounded, and operator-controlled

### Additional diagnostics to emit in Phase 2

Recommended additive fields:

- `phase2CandidateReduction`
- `phase2Applied`
- `phase2ReasonCodes`
- `phase2ToolAllowlist`
- `phase2RetrievalSkipped`
- `phase2FallbackToFullDeep`

These should extend the existing `wave4` event family rather than introduce a third planning/event channel.

## 6. Measurement plan

Before/after measurement should reuse the actual Phase 1 diagnostics already in place.

### Baseline prompts

Measure at least these prompts before enabling `active` mode:

- `check the repo status`
- `read this file`
- `inspect the server logs`
- `show the failing test output`
- control memory prompt: `what did we decide last time about Wave 1`
- control reasoning prompt: `explain the architectural tradeoffs here`

### Required metrics

From existing Wave 4 diagnostics capture:

- deep category
- confidence
- retrieval recommended
- retrieval executed
- retrieval latency
- retrieval result count if available
- exposed tool count
- exposed tool names
- used tool count
- used tool names
- internal round count
- total root-turn latency
- prompt contributors:
  - `systemPromptChars`
  - `projectContextChars`
  - `toolListChars`
  - `toolSchemaChars`
  - bootstrap totals

### Success criteria for the first reduction

Primary success criteria:

- lower `toolExposureCount`
- lower `toolListChars`
- lower `toolSchemaChars`
- no increase in fallback rate
- no increase in internal round count
- no loss of required tool use for the gated prompt family

Secondary success criteria if retrieval skip is included:

- `retrievalExecuted` drops to false for the gated subset
- total latency decreases for the gated subset
- memory-heavy control prompts remain unchanged

### Validation method

Recommended order:

1. capture Phase 1 baseline in `off`
2. run `shadow` and inspect would-apply diagnostics
3. enable `active` for the narrowed read-only `tool_deep` subset only
4. compare before/after for the exact same prompt family

### Reporting path

Continue using:

- `wave4` decision and outcome events for per-turn analysis
- `systemPromptReport` and `/context` output for contributor verification

No second measurement system should be introduced in Phase 2.

## 7. Jo-package integration assessment

Default assumption still holds.

Keep live execution shaping in OpenClaw.

Assessment:

- `Jo/packages/jotelemetry`
  - not required for the first live reduction
  - still the best later home for aggregate analysis across many deep turns
  - should remain optional, not a runtime dependency, for Phase 2
- `Jo/packages/jopolicy`
  - not recommended for Phase 2
  - Wave 4 execution shaping is not approval or risk policy
- `Jo/packages/jobench`
  - useful later for replay/evaluation harnesses
  - not the runtime owner for the first reduction
- `Jo/packages/joorchestrator`
  - only involved if the optional retrieval-skip reduction is included
  - even then, it should consume a tiny explicit hint rather than re-own Wave 4 categorization

Recommended Phase 2 boundary:

- live tool exposure narrowing stays entirely in OpenClaw
- retrieval skip enters Jo only through a very small explicit hint seam if and only if that seam can be added without duplicating classification logic

If that seam is not small, Phase 2 should ship tool exposure narrowing first and defer retrieval skip to the next pass.

## 8. Risk analysis

### 1. Over-narrowing tool exposure

Risk:

- a read-only `tool_deep` turn may still need a tool outside the first allowlist

Mitigation:

- scope the first live reduction to the read-only inspection subset only
- require `shadow` validation first
- preserve an immediate fallback to the full deep tool set

### 2. Duplicating classification logic in JoMemory

Risk:

- retrieval skip could accidentally re-implement Wave 4 logic inside Jo and drift over time

Mitigation:

- prefer an explicit OpenClaw-to-Jo retrieval hint
- if that hint seam is not tiny, do not ship retrieval skip in the first Phase 2 pass

### 3. Touching the wrong deep category first

Risk:

- reasoning or memory turns get optimized before the diagnostics are strong enough

Mitigation:

- keep `reasoning_deep` and `memory_deep` diagnosis-only in this phase
- optimize only the high-confidence read-only `tool_deep` subset first

### 4. Hidden behavior drift under Wave 2 and Wave 3

Risk:

- a Wave 4 execution reduction could accidentally change Wave 2 or Wave 3 routing behavior

Mitigation:

- do not change classifier or policy decisions
- apply the Phase 2 change only after deep selection has already been finalized
- extend the existing policy and Wave 4 tests rather than creating a disconnected test path

### 5. Weak measurement discipline

Risk:

- the first reduction ships without a trustworthy before/after comparison

Mitigation:

- require baseline, `shadow`, and `active` comparisons on the same prompt family
- reuse the existing Wave 4 diagnostics instead of adding ad hoc logging

## 9. Recommended implementation order

1. Extend `deep-turn-profile.ts` so high-confidence read-only `tool_deep` turns can produce a concrete allowlist recommendation and Phase 2 reason codes.
2. Add `OPENCLAW_WAVE4_PHASE2_MODE=off|shadow|active` with default `shadow`.
3. In `agent-runner-execution.ts`, compute but do not apply the candidate reduction in `shadow`, and emit additive Phase 2 diagnostics.
4. Reuse the existing `toolNameAllowlist` plumbing to apply the narrowed tool set for the gated subset in `active` mode.
5. Validate exposed-tool reduction and prompt-contributor reduction via `run/attempt.ts`, existing prompt-report tests, and `agent-runner.policy.test.ts`.
6. Only if the OpenClaw-to-Jo retrieval hint seam stays very small, add the optional retrieval skip for the same gated subset.
7. Re-run the focused Wave 4, Wave 3, Wave 2, Wave 1, and JoMemory regression suites.
8. Keep `memory_deep`, `reasoning_deep`, internal rounds, and subagent-root turns unchanged until the first `tool_deep` reduction is proven safe and measurable.

## 10. Open questions, if any

1. Is there already a single OpenClaw-to-Jo bridge where `MemoryTurnContext` is built for JoMemory pre-response retrieval, or would the Phase 2 retrieval hint need a new explicit seam?
2. For the first live tool allowlist, do you want the read-only `tool_deep` subset restricted to file/repo inspection only, or should log/status inspection be included in the same first pass?
