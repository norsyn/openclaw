# Wave 5 Implementation

## Status

Wave 5 Phase 1 and Phase 2 are now implemented.

The source-side managed-runtime propagation fix for `OPENCLAW_WAVE5_PHASE2_MODE` is also now implemented in:

- `src/daemon/service-env.ts`
- `src/daemon/service-env.test.ts`

However, a 2026-03-13 live managed-runtime redeploy and verification pass showed that Wave 5 gating still does not activate in the launchd-managed gateway process for the exact approved 3-prompt subset.

Current practical status:

- source implementation: present
- installed runtime deploy: updated
- LaunchAgent plist env block: correct
- live managed-runtime gating: still blocked

Detailed Phase 2 record:

- `docs/debug/openclaw-custom-patches/WAVE5_PHASE2_IMPLEMENTATION.md`

Scope has stayed intentionally narrow:

- no tool-system redesign
- no JoOrchestrator-first gating move
- no broad live tool narrowing beyond the exact approved Phase 2 subset
- no weakening of protected deep behavior
- no global tool removals
- no change to Wave 2 fast-turn behavior
- no change to Wave 3 policy decisions
- no change to Wave 4 live allowlist behavior

Phase 1 added three things:

- a conservative capability-family map for the current tool surface
- additive Wave 5 decision/outcome diagnostics on the existing reply path
- shadow-ready family recommendations for the approved high-confidence read-only inspection subset

Phase 2 adds one narrow live reduction:

- explicit `off` / `shadow` / `active` mode behavior for Wave 5
- active gating for the exact approved 3-prompt subset only
- `runtime_process` hidden through the `read_only_workspace` allowlist on that exact path
- reuse of the existing one-retry fallback to the broader deep tool surface when the narrowed run returns no usable assistant text

## What changed

### 1. Conservative capability-family model

Added:

- `src/agents/tool-capability-family.ts`
- `src/agents/tool-capability-family.test.ts`

Capability families introduced:

- `none`
- `read_only_workspace`
- `workspace_mutation`
- `runtime_process`
- `session_orchestration`
- `browser_web`
- `environment_control`
- `jo_memory`
- `jo_observability_admin`

What the module owns:

- conservative tool-name-to-family mapping
- coarse alias normalization for canonical tool names and current plugin-style aliases
- read-only workspace allowlist resolution for the first safe family
- family summaries for visible tool sets
- single-family detection for already-narrow tool allowlists

Conservative mapping choices in this phase:

- `jo_memory_*` maps to `jo_memory`
- `jo_orchestrator_*` maps to `jo_observability_admin`
- unknown/non-canonical Jo-facing tool names stay on the conservative operator/admin bucket rather than being over-fit into narrower families

### 2. Wave 5 decision/outcome diagnostics layer

Added:

- `src/auto-reply/reply/wave5-capability-routing.ts`
- `src/auto-reply/reply/wave5-capability-routing.test.ts`

Updated:

- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`

What changed in the runtime:

- Wave 5 now resolves after the existing Wave 2 classifier, Wave 3 policy layer, and Wave 4 deep-turn profile
- a `wave5` decision event is emitted before execution
- a `wave5` outcome event is emitted after execution
- Phase 1 introduced diagnosis-first recommendation behavior
- Phase 2 makes `active` apply the exact approved 3-prompt `read_only_workspace` allowlist while leaving `shadow` diagnosis-only

What the Wave 5 plan currently recommends:

- high-confidence `tool_deep`
- read-only inspection subset only
- prompt family currently aligned with the approved Wave 4 read-only inspection scope
- recommendation: `read_only_workspace`
- candidate reduction: `capability_family_gate`
- gating remains diagnostic-only in Phase 1 even when the mode is set

Wave 5 mode support:

- `OPENCLAW_WAVE5_PHASE2_MODE=off|shadow|active`
- `OPENCLAW_WAVE5_PHASE1_MODE=off|shadow|active` remains accepted as a compatibility fallback

Current behavior:

- default is `shadow`
- `shadow` computes the gate and emits diagnostics only
- `active` applies the exact approved 3-prompt `read_only_workspace` allowlist only when all gates pass
- `active` retries once with the broader deep tool surface if the narrowed run returns no usable assistant text

### 3. Tool exposure measurement now includes families and client/plugin tools

Updated:

- `src/config/sessions/types.ts`
- `src/agents/system-prompt-report.ts`
- `src/agents/system-prompt-report.test.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/auto-reply/reply/commands-context-report.ts`
- `src/auto-reply/reply/commands-context-report.test.ts`

What changed in the prompt/system report surface:

- tool entries now include `capabilityFamily`
- tool entries can record `source: "built-in" | "client"`
- the report now includes family counts for the exposed tool set
- the report now includes the highest-cost visible schema contributors
- client tools are now included in the prompt-report tool exposure accounting

This matters for Wave 5 because it makes the visible tool surface measurable across:

- built-in tool names
- client/plugin tool names
- family distribution
- top schema-heavy contributors

### 4. Existing read-only inspection boundary is reused rather than duplicated

Updated:

- `src/auto-reply/reply/deep-turn-profile.ts`

What changed there:

- the existing read-only `tool_deep` prompt check is now exported through `isReadOnlyToolDeepPrompt()`
- Wave 5 reuses that existing safe prompt-family boundary instead of inventing a parallel classifier

## Exact files changed

Code:

- `src/agents/tool-capability-family.ts`
- `src/agents/tool-capability-family.test.ts`
- `src/config/sessions/types.ts`
- `src/agents/system-prompt-report.ts`
- `src/agents/system-prompt-report.test.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/auto-reply/reply/deep-turn-profile.ts`
- `src/auto-reply/reply/wave5-capability-routing.ts`
- `src/auto-reply/reply/wave5-capability-routing.test.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner.ts`
- `src/auto-reply/reply/commands-context-report.ts`
- `src/auto-reply/reply/commands-context-report.test.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`

Docs:

- `docs/debug/openclaw-custom-patches/WAVE5_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE5_IMPLEMENTATION.md`
- `docs/debug/openclaw-custom-patches/WAVE5_PHASE2_IMPLEMENTATION.md`

## Diagnostics added

New Wave 5 event stream:

- `stream: "wave5"`

Decision-side fields include:

- current Wave 5 mode
- whether Phase 2 live gating applied
- selected capability family when already determinable
- capability family recommendation for the safe first family
- candidate reduction kind
- recommended tool allowlist for the family
- hidden capability families for the gated path
- whether the recommendation is shadow-only
- whether the recommendation is diagnosis-only
- additive Wave 5 reason codes

Outcome-side fields include:

- exposed tool count
- exposed tool names
- visible capability families
- capability-family counts
- tool list chars
- tool schema chars
- highest-cost visible schema contributors
- whether the run stayed diagnosis-only
- whether a later narrow family would have needed broader tools based on actual tool use
- whether the narrowed run fell back to the broader deep tool surface
- whether the final outcome produced usable assistant text

Existing report surface improvements:

- `/context list` and `/context detail` now show tool capability families
- `/context detail` now annotates top schema contributors with their capability family

## Behavior guarantees preserved

Still unchanged outside the exact Phase 2 subset:

- Wave 1 safeguards
- Wave 2 fast-turn classification and direct replies
- Wave 3 bounded policy decisions
- Wave 4 live tool allowlist behavior
- protected deep behavior
- subagent-root and internal-round protection
- memory-heavy and reasoning-heavy deep behavior
- JoMemory retrieval behavior
- actual model-visible tool set for ordinary runs outside the exact approved Phase 2 subset

Important boundary:

- Phase 2 applies a live allowlist only for the exact approved 3-prompt subset
- broader `read_only_workspace` rollout is still deferred

## Real-world validation hooks available

Wave 5 now supports real-world validation through:

- the `wave5` decision/outcome event stream
- `/context list`
- `/context detail`
- `systemPromptReport` persisted on sessions
- direct tool/plugin inspection paths already documented in the Wave 5 plan

This makes it possible to compare:

- ordinary turns
- approved read-only inspection turns
- protected deep turns
- current broad visible tool surface vs the applied Wave 5 family on the exact approved subset
- whether fallback to the broader deep tool surface occurred

## Managed-runtime deployment note

After the live activation failure root cause was traced to missing service-env forwarding, the deployment path was updated and re-run against the installed runtime used by launchd.

Verified in the deployed runtime:

- the installed dist contains the `OPENCLAW_WAVE5_PHASE2_MODE` forwarding logic
- the installed dist contains the focused rollout visibility marker `wave5_gate_resolved`
- the regenerated LaunchAgent plist contains:
  - `OPENCLAW_TURN_TIMING=1`
  - `OPENCLAW_WAVE4_PHASE2_MODE=off`
  - `OPENCLAW_WAVE5_PHASE2_MODE=active`

Live managed-runtime validation result:

- the exact approved 3-prompt subset still ran with the broad tool surface
- observed live values stayed at:
  - `tool_allowlist_count=0`
  - `tool_exposed_count=97`
  - `tool_list_chars=9385`
  - `tool_schema_chars=42103`
- the expected narrowed active-mode live values were not observed

That means the implementation is deployed but not yet live-effective in the managed gateway process.

## Tests run

Wave 5-specific tests added:

- `src/agents/tool-capability-family.test.ts`
- `src/auto-reply/reply/wave5-capability-routing.test.ts`

Wave 5-extended existing tests:

- `src/agents/system-prompt-report.test.ts`
- `src/auto-reply/reply/commands-context-report.test.ts`
- `src/auto-reply/reply/agent-runner.policy.test.ts`

Focused validation command set for this phase:

- Wave 5 tests
- Wave 4 validation tests
- Wave 3 policy tests
- Wave 2 fast-turn tests
- Wave 1 safeguard tests touched by the same runner/report surfaces

Focused Phase 2 result:

- 10 files passed
- 124 tests passed

## Known limitations

- the first live scope is still only the exact approved 3-prompt subset
- the family model is intentionally conservative and coarse; it is not a fine-grained capability graph
- this is not yet a general `read_only_workspace` rollout
- broader real-world validation is still required before any scope widening
- current conservative mapping groups broad Jo/plugin/admin surfaces under `jo_observability_admin`
- the implementation record assumes the existing dashboard, Discord, and terminal validation scripts documented in the plan; it does not create a new standalone Wave 5 operator CLI
- live managed-runtime activation is still blocked even after deploying the service-env forwarding fix; the installed runtime and LaunchAgent are correct, but the exact 3-prompt live subset still does not narrow the tool surface

## Recommended Phase 3 next steps

1. Keep the capability-family map and event shapes stable.
2. Resolve the remaining managed-runtime activation blocker before treating the launchd gateway as successfully migrated to active Wave 5 mode.
3. Re-run real `off` / `shadow` / `active` validation on dashboard, Discord, and terminal/tool-path runs after the managed-runtime blocker is cleared.
4. Keep default mode on `shadow` until the real-world validation set is clean.
5. Keep protected deep turns, memory-heavy turns, reasoning-heavy turns, subagent-root turns, and attachment turns on the current broader path.
6. Reassess any broader family rollout only after the exact approved subset proves safe in real runs.
