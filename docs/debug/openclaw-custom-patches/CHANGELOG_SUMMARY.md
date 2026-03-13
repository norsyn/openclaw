# Changelog Summary

## Key files touched by wave

### Wave 1

Primary runtime files:

- `src/agents/session-tool-result-guard.ts`
- `src/agents/ollama-stream.ts`
- `src/gateway/server-methods/chat.ts`
- `src/discord/monitor/listeners.ts`

Primary tests/docs:

- `src/agents/session-tool-result-guard.test.ts`
- `src/agents/ollama-stream.test.ts`
- `docs/debug/openclaw-custom-patches/WAVE1_FIXES.md`

### Wave 2

Primary runtime files:

- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/params.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/system-prompt.ts`
- `Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts`

Primary tests/docs:

- `src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts`
- `src/agents/system-prompt.test.ts`
- `Jo/packages/joorchestrator/tests/jomemory-turn-middleware.test.ts`
- `docs/debug/openclaw-custom-patches/WAVE2_IMPLEMENTATION.md`

### Wave 3

Primary runtime files:

- `src/auto-reply/reply/response-policy.ts`
- `src/auto-reply/reply/response-policy-rules.ts`
- `src/auto-reply/reply/response-policy-state.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`

Primary tests/docs:

- `src/auto-reply/reply/response-policy.test.ts`
- `src/auto-reply/reply/response-policy-state.test.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`
- `docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE3_SHADOW_VERIFICATION.md`
- `docs/debug/openclaw-custom-patches/WAVE3_ADAPTIVE_ROLLOUT.md`

### Wave 4

Primary runtime files:

- `src/auto-reply/reply/deep-turn-profile.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/agents/system-prompt-report.ts`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- `src/auto-reply/reply/followup-runner.ts`
- `src/config/sessions/types.ts`
- `src/auto-reply/types.ts`
- `Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts`

Primary tests/docs:

- `src/auto-reply/reply/deep-turn-profile.test.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`
- `src/auto-reply/reply/wave4-phase3-validation.test.ts`
- `docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE3_VALIDATION.md`

## Major behavior changes by wave

### Wave 1

- transcript persistence strips leaked retrieved-memory context
- empty-output assistant turns become a visible fallback message
- timing hooks become source-owned runtime behavior

### Wave 2

- narrow fast-turn classifier reduces work on trivial turns
- exact trivial turns can resolve as deterministic direct replies
- prompt, tools, and retrieval are reduced only for the fast subset

### Wave 3

- response-policy decisions and outcomes become structured and observable
- adaptive behavior becomes bounded, stateful, and reversible
- live adaptive scope stays intentionally narrow

### Wave 4

- already-deep turns gain structured deep-category diagnostics
- a narrow Tool Deep allowlist reduction becomes available for three exact prompts
- fallback to full deep is available when the narrowed run returns no usable text

## Major safeguards added

- transcript leak suppression
- empty-output safeguard
- stage timing hooks
- conservative fast-turn classifier with deep fallback
- hard deep blockers in response policy
- reversible adaptive state with conservative modes
- deep-turn diagnostics for category, tool exposure, retrieval, and turn origin
- full-deep retry when narrow Wave 4 execution returns no usable text

## Validation and testing summary

### Wave 1

- focused safeguard tests passed
- build completed
- runtime verification completed on rebuilt dist

### Wave 2

- focused OpenClaw and Jo tests passed
- build verification passed
- runtime regression checks confirmed no Wave 1 regressions

### Wave 3

- policy tests, state tests, and shared runner tests passed
- shadow verification confirmed bounded behavior
- adaptive rollout remained narrowly scoped and validated

### Wave 4

- deep-turn diagnostics tests passed
- focused Phase 2 suites passed
- Phase 3 validation harness passed
- focused OpenClaw Phase 3 suite passed: 10 files, 130 tests
- JoMemory middleware regression remained clean: 1 file, 17 tests

## Operational flags and modes added

### Wave 1

- `OPENCLAW_TURN_TIMING`

### Wave 3

- `OPENCLAW_RESPONSE_POLICY_MODE=off|shadow|adaptive`
- `OPENCLAW_RESPONSE_POLICY_RESET=1`

### Wave 4

- `OPENCLAW_WAVE4_PHASE2_MODE=off|shadow|active`

## Docs created

Major wave records created across the program:

- `WAVE1_FIXES.md`
- `WAVE2_PATCH_PLAN.md`
- `WAVE2_IMPLEMENTATION.md`
- `WAVE3_PATCH_PLAN.md`
- `WAVE3_IMPLEMENTATION.md`
- `WAVE3_PHASE2_PATCH_PLAN.md`
- `WAVE3_PHASE2_IMPLEMENTATION.md`
- `WAVE3_SHADOW_VERIFICATION.md`
- `WAVE3_ADAPTIVE_ROLLOUT.md`
- `WAVE4_PATCH_PLAN.md`
- `WAVE4_IMPLEMENTATION.md`
- `WAVE4_PHASE2_IMPLEMENTATION.md`
- `WAVE4_PHASE3_VALIDATION.md`
- `PROGRAM_WRAP_UP.md`
- `CHANGELOG_SUMMARY.md`
