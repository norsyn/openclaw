# Wave 5 Phase 2 Patch Plan

## Status

This is a planning pass only.

Wave 5 Phase 1 is already implemented as a diagnosis-first capability-family layer in OpenClaw.

Reference documents:

- `docs/debug/openclaw-custom-patches/WAVE5_TOOL_ROUTING_AND_CAPABILITY_GATING.md`
- `docs/debug/openclaw-custom-patches/WAVE5_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE5_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE4_PHASE3_VALIDATION.md`
- `Jo/docs/research/jo_tool_exposure_orchestrator_gating_plan.md`

This Phase 2 plan defines the smallest safe next step:

- apply one narrow live capability-family reduction
- keep OpenClaw as the first implementation layer
- preserve Wave 1 through Wave 4 behavior
- preserve protected deep behavior
- require real-world validation before widening scope

## 1. Phase 2 summary

The smallest safe Phase 2 move is not broad capability gating.

It is one extremely narrow live reduction for the already-approved read-only inspection prompt family that Phase 1 now measures explicitly.

Phase 1 evidence from the shipped Wave 5 diagnostics and existing Wave 4 validation is strong enough for exactly one first live target:

- prompt family: `check the repo status`, `read this file`, `list the files involved`
- Wave 5 Phase 1 decision recommendation: `read_only_workspace`
- Wave 5 Phase 1 observed visible family split on the targeted path:
  - `read_only_workspace = 4`
  - `runtime_process = 2`
- Wave 5 Phase 1 observed visible tool count on the targeted path: `6`
- Wave 5 Phase 1 observed top visible schema contributors on the targeted path:
  - `exec`
  - `process`
- Wave 5 Phase 1 observed `fallbackToBroaderToolsWouldBeNeeded: false` on the clean targeted shadow case

That evidence lines up with the earlier Wave 4 validation for the same prompt family:

- shadow/full-deep exposure: `6` tools
- active narrowed exposure: `4` tools
- narrowed allowlist: `read_file`, `grep_search`, `file_search`, `list_dir`
- actual used tool names stayed inside that allowlist on the clean validated runs
- fallback to the broader tool surface worked when the narrowed run returned no usable assistant text

So Phase 2 should stay narrow and use the same safe family boundary plus the new Wave 5 family diagnostics.

## 2. Recommended first live target

Recommended first live target:

- an even narrower subset than the whole `read_only_workspace` family in the abstract
- specifically: the current approved three-prompt read-only inspection subset only

That means Phase 2 should not yet say:

- “all `read_only_workspace` turns can go narrow”

It should instead say:

- “the exact current read-only inspection prompt family can go narrow when the Phase 2 gates pass”

Why this is the safest choice:

1. Phase 1 only has direct recommendation evidence for that exact prompt family.
2. Wave 4 already validated the exact same 4-tool allowlist and fallback shape for those prompts.
3. The targeted path already shows that only the `read_only_workspace` family is actually used in the clean validated cases.
4. Broader `read_only_workspace` rollout would be a family-wide expansion without equivalent real-world evidence yet.

So the first live target should remain:

- `check the repo status`
- `read this file`
- `list the files involved`

Nothing broader should go live in the first Phase 2 pass.

## 3. Capability families to hide

For the first live target, the planned visible family should be:

- `read_only_workspace`

The first family to hide should be:

- `runtime_process`

Evidence for that choice:

- the shipped Wave 5 Phase 1 diagnostics for the approved prompt family currently show only two visible families:
  - `read_only_workspace`
  - `runtime_process`
- the top visible schema contributors on that path are both in `runtime_process`:
  - `exec`
  - `process`
- the actual used tools in the validated cases stayed inside `read_only_workspace`

Phase 2 recommendation:

- when the exact live gates pass, hide `runtime_process` by applying the existing `read_only_workspace` allowlist

Conservative rule for other families:

- do not proactively hide `session_orchestration`, `browser_web`, `environment_control`, `workspace_mutation`, `jo_memory`, or `jo_observability_admin` in the first live pass unless the real targeted runtime surface actually exposes them on those prompts and shadow validation proves they are irrelevant there

In other words:

- first live reduction should target the currently observed extra family, not speculate about larger future hiding sets

## 4. Gating and fallback rules

### Gating rules

The first live capability-family gate should apply only when all of these are true:

1. Wave 3 selected profile is `deep`.
2. Wave 4 category is `tool_deep`.
3. Wave 4 confidence is `high`.
4. The normalized prompt is one of:
   - `check the repo status`
   - `read this file`
   - `list the files involved`
5. Wave 4 retrieval mode is `skip`.
6. Wave 4 `retrievalLikely` is `false`.
7. Wave 5 Phase 2 recommendation is `read_only_workspace`.
8. Turn origin is `user_root`.
9. No attachments are present.
10. No protected deep blocker is present.
11. No slash-command protected path is present.

If any of these fail:

- keep the current broader safe path

### Fallback behavior

Fallback should remain as narrow and explicit as the existing validated Wave 4 behavior.

Recommended Phase 2 fallback rule:

- in `active`, if the narrowed run returns no usable assistant text, retry once with the current broader deep tool surface

Fallback should not trigger for:

- successful narrowed runs
- protected-deep runs that never narrowed
- speculative partial-quality heuristics in Phase 2

Recommended Phase 2 fallback telemetry:

- record whether fallback happened
- record the final exposed tool count after fallback
- record the final exposed tool names after fallback
- keep the existing “broader tools would be needed” style evidence visible in Wave 5 outcome reporting

### Off / shadow / active behavior

Recommended Phase 2 semantics:

- `off`
  - do not compute or apply Wave 5 Phase 2 capability gating
  - keep Wave 5 Phase 1 diagnostics off for the Phase 2 gate if desired, or keep only minimal bookkeeping
- `shadow`
  - compute the exact candidate family gate for the approved prompt family
  - emit decision/outcome diagnostics
  - do not change the visible tool set
  - compare actual visible families and actual used tools against the candidate narrow family
- `active`
  - apply the `read_only_workspace` allowlist only for the approved prompt family when all gates pass
  - retry once with the broader deep tool surface if the narrowed run returns no usable assistant text

Default recommended rollout mode:

- `shadow`

## 5. Real-world validation plan

Real-world validation is required before and during rollout.

### A. OpenClaw dashboard

Validation sequence:

1. Run the approved prompt family in `off` and capture baseline `wave5` plus `/context detail` output.
2. Run the same prompts in `shadow` and confirm:
   - recommendation is `read_only_workspace`
   - visible families still show the broader path
   - actual used tools stay inside the narrow family on the clean runs
3. Run the same prompts in `active` only in a controlled environment and confirm:
   - visible tool count drops
   - `runtime_process` is hidden on the narrowed path
   - final answers remain usable
4. Intentionally validate one fallback case and confirm the broader tool surface is retried once and only once.

Dashboard prompt set:

- `check the repo status`
- `read this file`
- `list the files involved`
- control prompt: `what did we decide last time about Wave 1`
- control prompt: `explain the architectural tradeoffs here`

### B. Discord

Run the same approved prompt set through Discord after dashboard validation passes.

Required Discord checks:

- the same prompts receive the same Wave 5 recommendation behavior
- active gating does not cause channel-specific regressions
- protected deep control prompts remain broad and unchanged
- fallback behavior is still correct if a narrowed run fails

Discord should not be treated as optional because the first live reduction must prove it is not tied only to dashboard/webchat assumptions.

### C. Terminal / tool-path runs

Use direct inspection and tool-path runs to validate that:

- the candidate narrow family matches the actual tool catalog on the targeted turns
- visible families and contributor metrics align with the runtime reports
- there is no hidden mismatch between built-in tools and client/plugin tools on the targeted path

This is especially important because Wave 5 Phase 1 now measures both built-in and client-tool surfaces.

## 6. Metrics to compare

For each targeted prompt, compare `off`, `shadow`, and `active` where applicable.

Required metrics:

- exposed tool count
- exposed tool names
- capability-family counts
- visible capability families
- tool list chars
- tool schema chars
- top schema contributors
- used tool count
- used tool names
- fallback frequency
- output quality

Also compare when measurable:

- first-token latency
- prompt-evaluation duration

Metric interpretation for the first live pass:

- exposed tool count, family counts, tool list chars, and tool schema chars are the primary rollout gates
- first-token latency should be captured when the surface makes it observable, but should not block rollout if the measurement is noisy while the exposure reduction and output-quality signals are clean

Output-quality expectation:

- no notable degradation on the approved prompt family
- no regression on protected deep controls

## 7. Relationship to later JoOrchestrator control-plane work

Phase 2 should still be implemented in OpenClaw first.

Why:

- OpenClaw still owns the model-visible tool surface
- OpenClaw already owns the allowlist seam
- OpenClaw already owns the runtime fallback behavior
- Wave 5 Phase 1 diagnostics are already emitted in OpenClaw

How this fits the JoOrchestrator direction:

- OpenClaw Phase 2 proves the first live capability-family reduction safely
- the resulting family map, metrics, and gating evidence become the basis for later JoOrchestrator control-plane expansion
- JoOrchestrator can later consume or mirror these families for capability-profile selection, escalation policy, and model-tier decisions

What should not happen yet:

- moving the first live family gate into JoOrchestrator
- making JoOrchestrator the primary owner of model-visible tool construction in this phase
- widening the first live target beyond the already validated family

## 8. Risk analysis

### 1. Over-broad first live scope

Risk:

- treating all `read_only_workspace` turns as safe when only three exact prompt families are currently evidenced

Mitigation:

- keep the first live target on the exact current prompt family only

### 2. Hiding the wrong families

Risk:

- hiding families that are not actually present or not yet evidenced in the real targeted runtime surface

Mitigation:

- first live hiding should target the currently observed extra family: `runtime_process`
- if additional families appear on real shadow runs, stop and validate before expanding the hide set

### 3. Plugin/client tool drift across surfaces

Risk:

- dashboard, Discord, and terminal/tool-path runs may expose slightly different tool sets or client-tool aliases

Mitigation:

- use the shipped Wave 5 family diagnostics and `/context detail` on all three surfaces before and during rollout

### 4. Protected deep regression

Risk:

- memory-heavy, reasoning-heavy, subagent-root, or attachment turns accidentally narrow

Mitigation:

- keep the gating rules explicit and require all safety checks to pass before applying the family gate

### 5. False confidence from a mocked-only signal

Risk:

- relying only on the focused harness rather than real runtime surfaces

Mitigation:

- require dashboard, Discord, and terminal/tool-path validation before widening or treating active as generally safe

### 6. Fallback undercoverage

Risk:

- the narrowed family may succeed in most runs but still miss an edge case without a validated retry path

Mitigation:

- keep the single broader retry path from the already validated narrow deep behavior and verify it again under Wave 5 Phase 2

## 9. Recommended implementation order

1. Keep the existing Phase 1 family map and event schema stable.
2. Add a Phase 2 mode control for `off`, `shadow`, and `active` at the existing OpenClaw seam.
3. In `shadow`, compute the exact candidate `read_only_workspace` gate for the approved three-prompt family only.
4. Validate `shadow` on dashboard, Discord, and terminal/tool-path runs using the shipped Wave 5 metrics.
5. In `active`, apply the existing `read_only_workspace` allowlist only for that exact gated subset.
6. Reuse the narrow single-retry fallback to the broader deep tool surface when the narrowed run returns no usable assistant text.
7. Compare before/after exposure, family counts, fallback frequency, and output quality on the exact same prompt family.
8. Keep all out-of-scope prompts on the current broader path.
9. Only after real-world validation succeeds should any broader family rollout or JoOrchestrator control-plane expansion be considered.

## 10. Documentation updated

Added:

- `docs/debug/openclaw-custom-patches/WAVE5_TOOL_ROUTING_AND_CAPABILITY_GATING.md`
- `docs/debug/openclaw-custom-patches/WAVE5_PHASE2_PATCH_PLAN.md`

This Phase 2 planning pass now documents:

- the selected first live target
- the exact family to hide first
- the gating and fallback rules
- the `off` / `shadow` / `active` rollout behavior
- the required real-world validation plan
- the required metrics to compare
- the relationship to later JoOrchestrator control-plane work
- the risks and rollout order
