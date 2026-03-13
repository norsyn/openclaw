# Wave 2 Readiness Plan

## Why Wave 2 matters

Wave 1 made the already-proven safeguards maintainable by upstreaming them into source and rebuilding dist.

Wave 2 is still needed because Wave 1 intentionally did not redesign or harden the broader architecture. It only preserved the current fixes.

Wave 2 should exist to address the next layer of durability and correctness issues that remain after Wave 1, especially where the current system still depends on operational conditions or version-specific ownership assumptions.

## Proposed scope

Wave 2 should focus on hardening and consolidation, not redoing Wave 1.

Expected Wave 2 concerns:

- make timing enablement reliable for service-managed runtime deployments
- reduce version-coupling around where model-side fallback logic lives
- tighten verification around dashboard, transcript, and provider behavior across more than one provider path
- improve maintenance durability so future upstream updates require less manual inspection
- add stronger regression coverage for runtime-visible behavior, not only unit-level helpers

Likely implementation themes for Wave 2:

- service/runtime configuration path for timing instead of relying on ad hoc environment propagation
- stronger integration tests for dashboard final delivery and transcript cleanliness
- broader provider-path coverage if fallback behavior is meant to be consistent beyond the currently verified Ollama path
- clearer ownership boundaries between provider parsing, transcript persistence, and final client delivery safeguards

## Success metrics

Before starting Wave 2, record a baseline and then compare against post-change results.

Recommended baseline metrics to capture:

- whether `OPENCLAW_TURN_TIMING` is actually present in the running service environment
- whether timing markers appear in `gateway.log` for a known dashboard turn
- dashboard/webchat transcript cleanliness across at least one retrieval-backed turn
- empty-output fallback behavior for at least one known failing prompt path
- explicit JoMemory retrieval success on rebuilt runtime
- number of source patch points still requiring manual interpretation during an upstream version move

Wave 2 should be considered successful if:

- timing can be turned on reliably in the deployed service
- runtime verification is reproducible without ad hoc bundle inspection
- update forward-porting becomes more predictable across upstream releases
- no new visible transcript regressions are introduced

## Risks

- service-level timing changes can easily slip from documentation into behavior changes if not tightly scoped
- source ownership for provider output shaping may move again in future OpenClaw releases
- broader provider normalization can accidentally expand behavior beyond the exact Wave 1 scope if not constrained
- verification may be confounded by model/provider variance rather than code regression

## Suggested order of implementation

1. Capture Wave 2 baseline metrics on the currently deployed Wave 1 runtime.
2. Fix service/runtime timing enablement so timing verification is operationally reliable.
3. Add or improve integration-level regression coverage for dashboard final delivery and transcript cleanliness.
4. Reassess provider ownership of empty-output normalization and decide whether broader provider coverage is required.
5. Tighten update-maintenance guidance based on what changed during the first forward-port attempt.

## Explicitly out of scope

Wave 2 planning should not assume:

- new user-facing features
- redesign of JoMemory behavior
- general OpenClaw architecture refactors
- unrelated channel/provider rewrites
- broad policy changes outside the Wave 1 and maintenance surface

This note is planning only. It does not authorize or implement Wave 2 behavior.
