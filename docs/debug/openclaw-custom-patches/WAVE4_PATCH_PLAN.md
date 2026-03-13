# Wave 4 Patch Plan

## Status

Wave 4 Phase 1 is implemented.

This upstream-tree copy mirrors the Jo planning record and exists so the Waves 1 through 4 patch history lives in a single OpenClaw patch-doc tree.

Primary planning source:

- `Jo/docs/debug/openclaw-custom-patches/WAVE4_PATCH_PLAN.md`

Implementation record:

- `docs/debug/openclaw-custom-patches/WAVE4_IMPLEMENTATION.md`

## Phase 1 scope shipped

Phase 1 shipped as a diagnosis-only layer that:

- classifies only already-deep turns
- emits structured Wave 4 decision and outcome diagnostics
- reuses `systemPromptReport` for prompt/context measurement
- records retrieval recommendation vs execution
- records exposed-tool vs used-tool attribution
- tags user root, queued follow-up, subagent root, and internal model rounds

Phase 1 intentionally does not:

- apply selective reductions by default
- change Wave 1, Wave 2, or Wave 3 behavior
- add provider routing
- redesign JoMemory or tool routing
