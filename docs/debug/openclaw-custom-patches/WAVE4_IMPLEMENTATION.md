# Wave 4 Implementation

This file mirrors the implementation record in `Jo/docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md` so the upstream patch-doc tree stays complete alongside Waves 1 through 3.

## Status

Wave 4 Phase 1 and Phase 2 are implemented, and Phase 3 validation is now complete.

Detailed Phase 2 record:

- `docs/debug/openclaw-custom-patches/WAVE4_PHASE2_IMPLEMENTATION.md`

Detailed Phase 3 validation record:

- `docs/debug/openclaw-custom-patches/WAVE4_PHASE3_VALIDATION.md`

## Top-level summary

Phase 1 introduced diagnosis-only deep-turn classification and measurements.

Phase 2 adds one narrow live reduction:

- gated Tool Deep allowlist narrowing for the approved read-only inspection subset

Phase 2 explicitly does not add:

- cloud routing
- provider routing
- retrieval skip
- broad prompt trimming
- changes to Memory Deep or Reasoning Deep behavior

## Exact files changed

OpenClaw source:

- `src/auto-reply/types.ts`
- `src/config/sessions/types.ts`
- `src/agents/system-prompt-report.ts`
- `src/agents/system-prompt-report.test.ts`
- `src/agents/pi-embedded-runner/run/params.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-runner/run/types.ts`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- `src/auto-reply/reply/deep-turn-profile.ts`
- `src/auto-reply/reply/deep-turn-profile.test.ts`
- `src/auto-reply/reply/response-policy-rules.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/commands-context-report.ts`
- `src/auto-reply/reply/commands-context-report.test.ts`
- `src/auto-reply/reply/followup-runner.ts`
- `src/auto-reply/reply/followup-runner.test.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`
- `src/auto-reply/reply/wave4-phase3-validation.test.ts`

Jo source:

- `Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts`
- `Jo/packages/joorchestrator/tests/jomemory-turn-middleware.test.ts`

Docs:

- `docs/debug/openclaw-custom-patches/WAVE4_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE3_VALIDATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md`

## Deep-turn diagnostics

Wave 4 continues to use the existing `wave4` decision-side and outcome-side event family with:

- deep category
- category confidence
- retrieval recommendation and execution
- exposed tools and used tools
- prompt contributor totals from `systemPromptReport`
- root-turn latency
- internal-round count
- turn origin
- additive reason codes

Phase 2 extends those diagnostics additively with:

- `phase2Mode`
- `phase2CandidateReduction`
- `phase2Applied`
- `phase2ShadowOnly`
- `phase2ReasonCodes`
- `phase2FallbackToFullDeep`

## Behavior guarantees

Phase 1 remained diagnosis-only.

Phase 2 applies only a narrow, gated tool allowlist reduction for three exact Tool Deep prompt families.

Unchanged:

- Wave 1 safeguards
- Wave 2 fast-turn behavior
- Wave 3 policy behavior
- JoMemory retrieval decisions
- provider routing
- Memory Deep behavior
- Reasoning Deep behavior
- subagent-root deep turns
- internal-round handling

## Tests run

Focused OpenClaw Phase 1 suites passed:

- `deep-turn-profile.test.ts`
- `agent-runner.policy.test.ts`
- `agent-runner-execution.fast-turn.test.ts`
- `followup-runner.test.ts`
- `system-prompt-report.test.ts`
- `commands-context-report.test.ts`
- `ollama-stream.test.ts`
- `session-tool-result-guard.test.ts`

Focused OpenClaw Phase 2 suites passed:

- `deep-turn-profile.test.ts`
- `agent-runner.policy.test.ts`
- `agent-runner-execution.fast-turn.test.ts`
- `followup-runner.test.ts`
- `system-prompt-report.test.ts`
- `commands-context-report.test.ts`
- `response-policy.test.ts`
- `ollama-stream.test.ts`
- `session-tool-result-guard.test.ts`

Focused OpenClaw Phase 3 validation suites passed:

- `wave4-phase3-validation.test.ts`
- `deep-turn-profile.test.ts`
- `agent-runner.policy.test.ts`
- `agent-runner-execution.fast-turn.test.ts`
- `followup-runner.test.ts`
- `system-prompt-report.test.ts`
- `commands-context-report.test.ts`
- `response-policy.test.ts`
- `ollama-stream.test.ts`
- `session-tool-result-guard.test.ts`

Focused Jo suite passed:

- `tests/jomemory-turn-middleware.test.ts`

## Known limitations

- diagnostics are additive only and not persisted as a dedicated Wave 4 store yet
- retrieval latency and result count are available only when surfaced by the JoMemory tool-result path
- the only live reduction is the narrow Tool Deep allowlist shipped in Phase 2
- retrieval skip remains deferred

## Current rollout recommendation

Keep default Phase 2 mode on `shadow`, inspect `wave4` events for the approved prompt family, and enable `active` only in controlled environments first.

## Completion recommendation

Wave 4 can be considered complete as-is for the current shipped scope.

Future widening or retrieval skip should be treated as separate follow-on work, not as unfinished Wave 4 work.
