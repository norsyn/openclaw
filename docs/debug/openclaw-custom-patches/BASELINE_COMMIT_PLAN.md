# Baseline Commit Plan

## Goal

Plan the first baseline commit on `jo/stable` so it captures the real maintained Jo/OpenClaw runtime we now depend on.

This means the first baseline commit should include the runtime behavior we actually want to preserve across upstream updates, even if that makes the commit broader than a minimal cleanup commit.

## Refined baseline rule

The first baseline commit should include:

- Wave 1 safeguards
- Wave 2 fast-turn behavior
- Wave 3 adaptive policy behavior
- Wave 4 deep-turn behavior
- source and test files required to keep those behaviors coherent

The first baseline commit should not try to be artificially tiny if that would omit behavior that is now part of the maintained runtime.

Important boundary:

- the `joorchestrator` / `joheartbeatv2` packaging fix lives in the separate Jo repository, not in this `openclaw-upstream` working tree
- that packaging fix needs its own commit plan in Jo and is not captured by an OpenClaw baseline commit here

## Category A: Must be in the first baseline commit

These files represent the real maintained runtime baseline in this repository.

### Wave 1 safeguards and runtime delivery protections

- `src/agents/session-tool-result-guard.ts`
- `src/agents/session-tool-result-guard.test.ts`
- `src/agents/ollama-stream.ts`
- `src/agents/ollama-stream.test.ts`
- `src/gateway/server-methods/chat.ts`
- `src/discord/monitor/listeners.ts`

### Wave 2 fast-turn behavior and trivial-turn latency path

- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/agent-runner-execution.fast-turn.test.ts`
- `src/auto-reply/reply/followup-runner.ts`
- `src/auto-reply/reply/followup-runner.test.ts`
- `src/auto-reply/types.ts`
- `src/config/sessions/types.ts`

### Wave 3 adaptive policy runtime

- `src/auto-reply/reply/response-policy.ts`
- `src/auto-reply/reply/response-policy.test.ts`
- `src/auto-reply/reply/response-policy-rules.ts`
- `src/auto-reply/reply/response-policy-state.ts`
- `src/auto-reply/reply/response-policy-state.test.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`

### Wave 4 deep-turn runtime

- `src/auto-reply/reply/deep-turn-profile.ts`
- `src/auto-reply/reply/deep-turn-profile.test.ts`
- `src/auto-reply/reply/wave4-phase3-validation.test.ts`

### Embedded runner and prompt/report support needed by the live runtime path

- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-runner/run/attempt.test.ts`
- `src/agents/pi-embedded-runner/run/params.ts`
- `src/agents/pi-embedded-runner/run/types.ts`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- `src/agents/system-prompt.ts`
- `src/agents/system-prompt.test.ts`
- `src/agents/system-prompt-report.ts`
- `src/agents/system-prompt-report.test.ts`
- `src/auto-reply/reply/commands-context-report.ts`
- `src/auto-reply/reply/commands-context-report.test.ts`

Why these are baseline files:

- `agent-runner-execution.ts` now directly drives fast-turn direct replies, Wave 3 selection, and Wave 4 deep-turn classification
- `agent-runner.ts` records Wave 3 and Wave 4 outcomes, session resets, and run result handling around that same runtime path
- `attempt.ts`, `params.ts`, `types.ts`, `run.ts`, `system-prompt.ts`, and `system-prompt-report.ts` are no longer optional sidecars; they are part of the prompt-shaping and execution behavior the runtime now depends on
- `deep-turn-profile.ts` and `response-policy.ts` are imported by the active reply path, so excluding them would make the baseline incomplete

## Category B: Should probably be in a second intentional commit

These are useful long-term materials or helpers worth preserving in the fork, but they are not required to define the runtime baseline itself.

### Maintained fork workflow docs

- `.github/copilot-instructions.md`
- `docs/debug/openclaw-custom-patches/FORK_SETUP_PLAN.md`
- `docs/debug/openclaw-custom-patches/UPSTREAM_UPDATE_WORKFLOW.md`
- `docs/debug/openclaw-custom-patches/DEPLOY_FROM_FORK.md`
- `docs/debug/openclaw-custom-patches/BASELINE_COMMIT_PLAN.md`

### Keepable operator diagnostics

- `scripts/diagnose-ollama-runtime.ts`
- `src/diagnostics/ollama-runtime-diagnostic.ts`

These are good candidates for a second commit because they help maintain the fork operationally without redefining the baseline runtime behavior.

## Category C: Should likely stay out of maintained fork history

These look like one-off probes, stale investigation artifacts, or temporary evidence files rather than maintained fork history.

### Disposable or one-off probes

- `scripts/ollama-direct-probe.mjs`
- `src/agents/ollama-runtime-diagnostic.live.test.ts`

### Historical investigation notes that should not define maintained fork history

- `docs/debug/openclaw-custom-patches/CHANGELOG_SUMMARY.md`
- `docs/debug/openclaw-custom-patches/OPENCLAW_CUSTOM_PATCH_MAINTENANCE.md`
- `docs/debug/openclaw-custom-patches/OPENCLAW_RUNTIME_DEPLOYMENT_NOTES.md`
- `docs/debug/openclaw-custom-patches/PROGRAM_WRAP_UP.md`
- `docs/debug/openclaw-custom-patches/WAVE1_FIXES.md`
- `docs/debug/openclaw-custom-patches/WAVE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE2_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE2_READINESS_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE3_ADAPTIVE_ROLLOUT.md`
- `docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE3_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE3_PHASE2_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE3_SHADOW_VERIFICATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE2_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE2_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE3_VALIDATION.md`

These may still be useful as local notes, but they should not be treated as the maintained fork narrative unless you explicitly decide to archive them in a later documentation commit.

## Recommended commit sequence

1. First commit: the real maintained OpenClaw runtime baseline in this repo, including Waves 1 to 4 and the supporting runtime files and tests listed in Category A.
2. Second commit: maintained fork workflow docs and keepable diagnostics from Category B.
3. Third commit: any carefully selected historical docs you explicitly decide are worth preserving in repo history.

## Main risk if the baseline is too small

If the first baseline commit omits the Wave 3 and Wave 4 files that are already wired into the live runtime path, the fork history will look clean but will not actually preserve the maintained system.

That creates three problems:

- future upstream forward-ports will not have an honest baseline for the behavior you are actually running
- deployment validation will be confusing because the branch history will not match the runtime you depend on
- later commits will blur the line between baseline behavior and optional follow-on work
