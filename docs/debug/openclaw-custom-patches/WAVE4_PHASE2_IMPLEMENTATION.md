# Wave 4 Phase 2 Implementation

## Status

Wave 4 Phase 2 is implemented as a narrow, reversible Tool Deep execution-plan reduction.

Scope stayed intentionally small:

- default mode is `shadow`
- only the approved read-only Tool Deep subset is eligible
- deep remains the safe capable path
- retrieval skip was deferred in this pass
- Wave 1, Wave 2, Wave 3, and Wave 4 Phase 1 diagnostics remain intact

## What changed

### 1. Phase 2 mode control

Implemented env flag:

- `OPENCLAW_WAVE4_PHASE2_MODE=off|shadow|active`

Default:

- `shadow`

Mode behavior:

- `off`
  - no Phase 2 candidate reduction is computed or applied
- `shadow`
  - the candidate allowlist is computed and emitted on the existing `wave4` event stream
  - runtime behavior stays on the full deep tool set
- `active`
  - the candidate allowlist is applied only for the gated read-only Tool Deep subset
  - if the narrowed run produces no usable assistant text, the runtime retries once with the current full deep tool set

### 2. Gated Tool Deep allowlist recommendation

Updated:

- `src/auto-reply/reply/deep-turn-profile.ts`
- `src/auto-reply/reply/response-policy-rules.ts`

Phase 2 recommendation and live application are limited to these prompts only:

- `check the repo status`
- `read this file`
- `list the files involved`

The candidate allowlist is:

- `read_file`
- `grep_search`
- `file_search`
- `list_dir`

No broader log or server inspection prompts were included in this pass.

### 3. Execution-path wiring

Updated:

- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`

Implemented behavior:

- Phase 2 is evaluated only after Wave 3 has already selected `deep`
- existing deep-turn diagnostics are preserved and extended additively with Phase 2 fields
- in `shadow`, the allowlist is computed but not applied
- in `active`, the allowlist is passed through the existing `toolNameAllowlist` runner seam
- if the narrowed run produces no usable assistant text and no tool usage, the runtime retries once with the current full deep tool set

This keeps the reduction explainable and reversible without redesigning routing.

### 4. Retrieval skip decision

Retrieval skip was explicitly deferred.

Reason:

- the OpenClaw-to-Jo seam was not already tiny and explicit enough to add a clean retrieval hint without creating a messier bridge or duplicating Wave 4 logic

Phase 2 therefore stays OpenClaw-only in this pass.

## Exact files changed

OpenClaw source:

- `src/auto-reply/reply/deep-turn-profile.ts`
- `src/auto-reply/reply/deep-turn-profile.test.ts`
- `src/auto-reply/reply/response-policy-rules.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`

Docs:

- `docs/debug/openclaw-custom-patches/WAVE4_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md`

Jo docs mirror:

- `Jo/docs/debug/openclaw-custom-patches/WAVE4_PHASE2_IMPLEMENTATION.md`
- `Jo/docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md`

## Gating rules shipped

Narrowing applies only when all are true:

- selected profile is `deep`
- Wave 4 category is `tool_deep`
- confidence is `high`
- prompt is one of the three approved read-only inspection prompts
- no continuity or recall cue is present
- `retrievalLikely` is false
- `retrievalMode` is `skip`
- no attachments are present
- turn origin is neither `subagent_root` nor `agent_internal_round`
- the prompt is not a slash-command protected path

If any gate fails:

- the runtime preserves the current full deep path

## Additive diagnostics shipped

Phase 2 extends the existing `wave4` decision and outcome records with:

- `phase2Mode`
- `phase2CandidateReduction`
- `phase2Applied`
- `phase2ShadowOnly`
- `phase2ReasonCodes`
- `phase2FallbackToFullDeep`

The existing Phase 1 fields remain intact.

## Tests run

Focused OpenClaw suites:

```bash
pnpm exec vitest run \
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

- 9 files passed
- 118 tests passed

Focused Jo suite:

```bash
pnpm --filter joorchestrator test -- tests/jomemory-turn-middleware.test.ts
```

Result:

- 1 file passed
- 17 tests passed

## Before/after measurement summary

This pass used the existing Wave 4 diagnostics and prompt reporting only.

Controlled Phase 2 test measurements for the gated subset show:

- shadow/full-deep exposure example
  - exposed tools: `6`
  - `toolListChars: 100`
  - `toolSchemaChars: 400`
- active/narrowed exposure example
  - exposed tools: `4`
  - `toolListChars: 40`
  - `toolSchemaChars: 80`

Observed directional effect in the active narrowed path:

- exposed tool count drops from `6` to `4`
- tool list chars drop from `100` to `40`
- tool schema chars drop from `400` to `80`

Fallback behavior remains measurable:

- when the narrowed run produced no usable assistant text, the runtime retried once with the full deep tool set
- the final outcome event recorded `phase2FallbackToFullDeep: true`
- the final exposed tool count returned to the full-deep example value in that retry path

Memory Deep and Reasoning Deep controls remained unchanged in the active-mode tests.

## Rollout recommendation

Recommended rollout:

1. keep default mode on `shadow`
2. inspect `wave4` decision and outcome events for the three approved prompts only
3. enable `active` only in controlled environments first
4. review fallback-to-full-deep frequency before widening scope

## Known limitations

- the live scope is intentionally limited to three exact prompt families
- log inspection, server inspection, failing test output inspection, and broader operational prompts remain on the current full deep path
- retrieval skip is not included in this pass
- the fallback-to-full-deep retry is intentionally narrow and only triggers when the narrowed run produces no usable assistant text
- no separate Phase 2 persistence store exists; diagnostics remain event-driven
