# Wave 4 Phase 3 Validation

## Status

This document records the Wave 4 Phase 3 validation and rollout-verification pass for the shipped Phase 2 scope.

Scope stayed intentionally narrow:

- no live-scope broadening was added
- no retrieval skip was added
- no allowlist redesign was performed
- default mode remains `shadow`
- validation focused on proving the shipped Phase 2 behavior and confirming unchanged behavior outside that scope

## Verification method

Validation used the existing Wave 4 diagnostics and the shared reply path through a dedicated focused harness plus the prior focused regression suites.

Primary validation harness:

```bash
pnpm exec vitest run src/auto-reply/reply/wave4-phase3-validation.test.ts
```

Harness result:

- 1 file passed
- 12 tests passed

Broader focused OpenClaw suite:

```bash
pnpm exec vitest run \
  src/auto-reply/reply/wave4-phase3-validation.test.ts \
  src/auto-reply/reply/deep-turn-profile.test.ts \
  src/auto-reply/reply/agent-runner.policy.test.ts \
  src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts \
  src/auto-reply/reply/followup-runner.test.ts \
  src/agents/system-prompt-report.test.ts \
  src/auto-reply/reply/commands-context-report.test.ts \
  src/auto-reply/reply/response-policy.test.ts \
  src/agents/ollama-stream.test.ts \
  src/agents/session-tool-result-guard.test.ts
```

Result:

- 10 files passed
- 130 tests passed

Focused Jo regression:

```bash
pnpm --filter joorchestrator test -- tests/jomemory-turn-middleware.test.ts
```

Result:

- 1 file passed
- 17 tests passed

Important validation boundary:

- this pass intentionally used the existing event and report surfaces and mocked focused runner responses to validate routing, exposure, fallback, and category behavior
- `latencyMs` remained observable in the `wave4` outcome events, but the mocked harness values were not treated as rollout-performance gates

## Prompts validated

In-scope shipped prompts:

- `check the repo status`
- `read this file`
- `list the files involved`

Out-of-scope prompts validated as unchanged:

- `inspect the server logs`
- `show the failing test output`
- `what did we decide last time about Wave 1`
- `explain the architectural tradeoffs here`
- one `subagent_root` case using `check the repo status`

## In-scope shadow vs active findings

### Shadow mode

For all three shipped prompts, validation showed:

- `phase2Mode: "shadow"`
- `category: "tool_deep"`
- `confidence: "high"`
- `phase2CandidateReduction: "tool_allowlist_narrowing"`
- `phase2Applied: false`
- `phase2ShadowOnly: true`
- `toolAllowlistRecommendation: ["read_file", "grep_search", "file_search", "list_dir"]`
- full deep tool exposure remained active

Measured shadow exposure for the shipped scope:

- exposed tool count: `6`
- exposed tool names:
  - `read_file`
  - `grep_search`
  - `file_search`
  - `list_dir`
  - `exec`
  - `process`
- used tool count: `1`
- used tool names:
  - `read_file` for `check the repo status`
  - `read_file` for `read this file`
  - `list_dir` for `list the files involved`
- `phase2FallbackToFullDeep: false`

Policy seam remained unchanged:

- Wave 3 still selected `deep`
- `overrideApplied: false`

### Active mode

For all three shipped prompts, validation showed:

- `phase2Mode: "active"`
- `category: "tool_deep"`
- `confidence: "high"`
- `phase2CandidateReduction: "tool_allowlist_narrowing"`
- `phase2Applied: true`
- `phase2ShadowOnly: false`

Measured active exposure for the shipped scope:

- exposed tool count: `4`
- exposed tool names:
  - `read_file`
  - `grep_search`
  - `file_search`
  - `list_dir`
- used tool count: `1`
- used tool names:
  - `read_file` for `check the repo status`
  - `read_file` for `read this file`
  - `list_dir` for `list the files involved`
- `phase2FallbackToFullDeep: false` on the clean active path

Observed output-quality result for the shipped scope:

- final assistant output remained sensible in both `shadow` and `active`
- no notable quality difference appeared between `shadow` and `active` in the focused validation harness for the shipped prompts

### Latency observability

`latencyMs` was present in the `wave4` outcome event for the validated in-scope runs.

Rollout conclusion from this pass:

- latency remains observable for real environments
- the mocked harness values were not meaningful enough to use as rollout thresholds
- prompt-surface reduction and fallback correctness were the relevant validation gates in this pass

## Out-of-scope findings

### `inspect the server logs`

Validation showed:

- category remained `tool_deep`
- `phase2Applied: false`
- `phase2ReasonCodes: ["phase2_prompt_out_of_scope"]`
- exposed tool count remained `6`
- no narrowed tool exposure occurred
- `phase2FallbackToFullDeep: false`
- retrieval remained unchanged: `retrievalExecuted: false`

### `show the failing test output`

Validation showed:

- category remained `tool_deep`
- `phase2Applied: false`
- `phase2ReasonCodes: ["phase2_prompt_out_of_scope"]`
- exposed tool count remained `6`
- no narrowed tool exposure occurred
- `phase2FallbackToFullDeep: false`
- retrieval remained unchanged: `retrievalExecuted: false`

### `what did we decide last time about Wave 1`

Validation showed:

- category remained `memory_deep`
- `phase2Applied: false`
- `phase2ReasonCodes: ["phase2_not_tool_deep"]`
- exposed tool count remained `6`
- retrieval remained active and unchanged: `retrievalExecuted: true`
- no narrowed tool exposure occurred
- `phase2FallbackToFullDeep: false`

### `explain the architectural tradeoffs here`

Validation showed:

- category remained `reasoning_deep`
- `phase2Applied: false`
- `phase2ReasonCodes: ["phase2_not_tool_deep"]`
- exposed tool count remained `6`
- retrieval remained unchanged: `retrievalExecuted: false`
- no narrowed tool exposure occurred
- `phase2FallbackToFullDeep: false`

### `subagent_root` case

Validation showed:

- `turnOrigin: "subagent_root"`
- category remained `tool_deep`
- `phase2Applied: false`
- `phase2ReasonCodes: ["phase2_non_user_root_turn"]`
- exposed tool count remained `6`
- `phase2FallbackToFullDeep: false`
- `internalRoundCount` remained observable in the outcome event

### Wave 3 boundary check

Across the validated out-of-scope runs:

- Wave 3 still selected `deep`
- `overrideApplied: false`
- no accidental policy widening was observed

## Fallback observations

Fallback was validated on the shipped in-scope prompt family using `list the files involved` in `active` mode.

Observed behavior:

- first narrowed run exposed only the 4-tool allowlist
- first narrowed run returned no usable assistant text
- runtime retried once with the full deep tool set
- second run returned a sensible final answer

Measured fallback outcome:

- final exposed tool count: `6`
- final exposed tool names:
  - `read_file`
  - `grep_search`
  - `file_search`
  - `list_dir`
  - `exec`
  - `process`
- used tool count: `1`
- used tool names: `list_dir`
- `phase2FallbackToFullDeep: true`

Fallback conclusion:

- the retry path works as designed
- the fallback remains narrow and reversible
- no accidental fallback behavior was observed outside the intentionally induced in-scope retry case

## Rollout readiness assessment

### Default mode

Recommendation:

- keep default mode on `shadow`

Reason:

- the shipped scope is validated and safe, but `shadow` remains the correct conservative default for a narrow execution-plan reduction

### Active mode

Recommendation:

- active mode is safe enough for controlled environments for the current shipped scope

Reason:

- the in-scope prompts narrow correctly
- out-of-scope prompts do not narrow
- fallback-to-full-deep works when needed
- protected Memory Deep, Reasoning Deep, and subagent-root cases remain unchanged

### Scope width

Recommendation:

- keep the current 3-prompt allowlist scope exactly as-is

Reason:

- validation found no pressure to widen it yet
- validation found no evidence requiring it to be tightened
- the current scope remains explainable, measurable, and safe

### Retrieval skip

Recommendation:

- retrieval skip is still correctly deferred

Reason:

- the validation found no issue that forces retrieval skip into Wave 4 completion
- the current shipped scope is already coherent without widening the OpenClaw-to-Jo seam

## Completion recommendation

Wave 4 can be considered complete as-is after this validation pass.

Reason:

- the shipped Phase 2 scope is validated in both `shadow` and `active`
- unchanged out-of-scope behavior is validated
- fallback behavior is validated
- rollout posture remains conservative by default
- there is no evidence-driven reason to widen, tighten, or add retrieval skip before closing Wave 4

Practical interpretation:

- future scope widening or retrieval skip should be treated as a new follow-on effort, not as required work to close Wave 4

## Bottom line

Wave 4 is complete for the currently shipped scope.

Recommended final posture:

1. leave default mode on `shadow`
2. allow `active` only in controlled environments for the current 3-prompt scope
3. keep retrieval skip deferred
4. treat any future widening as a separate follow-on, not unfinished Wave 4 work
