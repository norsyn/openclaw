# Wave 5 Patch Plan

Wave 5 Phase 1 is now implemented.

This file remains the design rationale and rollout plan for the broader Wave 5 program.

Implementation record:

- `docs/debug/openclaw-custom-patches/WAVE5_IMPLEMENTATION.md`

Wave 5 now has two explicit design inputs that should be treated as complementary:

- the existing OpenClaw-side Wave 5 patch direction in this file
- `Jo/docs/research/jo_tool_exposure_orchestrator_gating_plan.md`

The reconciliation is straightforward:

- the OpenClaw-side plan defines the safest first implementation seam in the current runtime
- the Jo-side plan defines the longer-horizon architecture direction where JoOrchestrator becomes more of a control plane and capability gatekeeper

Wave 5 should preserve capability, not delete it.

The target state remains:

- all tools still exist
- all tools remain internally reachable
- only the right subset is visible to the active model for a given turn
- deterministic routing and fallback happen before broad model-visible tool exposure whenever possible
- JoOrchestrator can evolve into a stronger control plane later, but the first implementation must stay narrow, measurable, and grounded in the current OpenClaw runtime

## 1. Relationship between the two plans

These two plans are not redundant.

They overlap in intent, but they operate at different layers and different time horizons.

The current OpenClaw-side Wave 5 direction is:

- runtime-first
- narrow
- immediately implementable using seams that already exist
- focused on shaping the model-visible tool set after Wave 2, Wave 3, and Wave 4 have already classified the turn

The Jo tool exposure / orchestrator gating plan is:

- architecture-first
- broader in scope
- aimed at evolving JoOrchestrator into a smarter gatekeeper and control plane
- focused on capability-level routing, model-tier choice, deterministic pre-gating, async/delegation policy, and hiding low-level package plumbing from the main model over time

So the right reading is:

- they are complementary
- the OpenClaw Wave 5 plan should come first
- the JoOrchestrator gating direction should guide what the later end-state becomes, not replace the first safe runtime cut

Recommended order:

1. OpenClaw first: implement a narrow capability-family gate at the current tool exposure seam.
2. Validate that gate in real runtime surfaces: dashboard, Discord, and direct tool/API paths.
3. Only after the live reduction is proven safe should JoOrchestrator absorb more of the control-plane responsibilities.

Reason:

- OpenClaw already owns the model-visible tool surface today.
- OpenClaw already owns the `disableTools` and `toolNameAllowlist` seam.
- OpenClaw already owns the fallback behavior around narrowed runs.
- JoOrchestrator currently has real orchestration internals, but the plugin bridge still exposes a broad flat catalog to OpenClaw rather than acting as the primary gatekeeper.

So the plans fit together like this:

- OpenClaw Wave 5 = first live reduction path
- JoOrchestrator gating plan = later architectural consolidation path

## 2. Current tool exposure and orchestrator state

### What currently shapes the visible tool set

The current model-visible tool surface is shaped inside OpenClaw, not JoOrchestrator.

Primary seams:

- `src/auto-reply/reply/agent-runner-execution.ts`
  - Wave 2 classifier, Wave 3 policy selection, and Wave 4 deep-turn profiling all resolve before the embedded run call
  - the execution path already passes `disableTools` and `toolNameAllowlist`
- `src/agents/pi-embedded-runner/run.ts`
  - threads `disableTools` and `toolNameAllowlist` into the embedded attempt
- `src/agents/pi-embedded-runner/run/attempt.ts`
  - creates the built-in tool surface via `createOpenClawCodingTools()`
  - filters built-in tools by allowlist before prompt construction
  - filters client tools by allowlist before model exposure
- `src/agents/system-prompt.ts`
  - includes tool list text in the system prompt
- `src/agents/system-prompt-report.ts`
  - measures exposed tools, summary chars, schema chars, and tool list chars
- `src/auto-reply/reply/commands-context-report.ts`
  - already gives an operator-facing `/context detail` path for prompt and tool exposure inspection

That means the current runtime already has a real, measurable tool exposure seam.

### Current default tool surface in OpenClaw

Measured from the current default `createOpenClawCodingTools()` surface:

- 17 default coding tools
- about 18,406 schema chars total

Largest contributors:

- `message`: 8,992
- `browser`: 1,921
- `nodes`: 1,758
- `exec`: 1,086
- `process`: 961
- `canvas`: 661
- `edit`: 591
- `sessions_spawn`: 549

Immediate implication:

- the current surface is functionally rich but broad by default
- several high-cost tools are not needed on most repo/file inspection turns

### What JoOrchestrator is doing today

JoOrchestrator today is a mix of real orchestration runtime and broad bridge/catalog exposure.

Evidence that it is a real orchestration runtime:

- `Jo/packages/joorchestrator/src/orchestrator.ts`
  - owns task store, planner, executor, verifier, policy engine, scheduler, memory manager, and cognitive loop
- `Jo/packages/joorchestrator/src/factory.ts`
  - resolves adapter mode, preflights, telemetry adapters, and runtime construction
- `Jo/packages/joorchestrator/src/router/router.ts`
  - does deterministic intent classification
- `Jo/packages/joorchestrator/src/runtime/brain/index.ts`
  - picks capabilities from the capability registry using deterministic rules plus experience evidence
- `Jo/packages/joorchestrator/src/runtime/capabilities/registry.ts`
  - defines capability metadata separate from tool names
- `Jo/packages/joorchestrator/src/runtime/tools/execution_wrapper.ts`
  - wraps tool execution with capability metadata, reliability state, verification, and async job linking

Evidence that it is still exposing a broad bridge/catalog surface into OpenClaw:

- `Jo/packages/joorchestrator/README.md`
  - lists a large OpenClaw plugin tool surface, including status, audit, telemetry, policy, identity, secrets, jobs, replay, lineage, sandbox, research, and todo tools
- `Jo/packages/joorchestrator/openclaw-plugin/openclaw.plugin.json`
  - exposes the plugin as a general OpenClaw tool bridge
- `Jo/packages/joorchestrator/openclaw-plugin/index.ts`
  - loads runtime exports and exposes many low-level package and runtime operations directly to OpenClaw
- `Jo/docs/tools/jo-orchestrator-operator-runbook.md`
  - assumes dashboard chat and direct tool calls can access a wide set of `jo_orchestrator_*` tools

So the current state is:

- internally, JoOrchestrator already contains control-plane-like logic
- externally, the OpenClaw plugin bridge still makes it behave like a broad tool catalog for the active model

### Bridge/catalog vs real control plane

Current assessment:

- internally: JoOrchestrator is already more than a bridge
- model-facing exposure: JoOrchestrator is still closer to a large bridge/catalog than to a strict control plane

Why:

- the capability registry exists
- deterministic routing exists
- policy and verification semantics exist
- but the model can still see many low-level `jo_orchestrator_*` tools directly instead of only capability-level entry points

### Where capability-family routing can be added without losing capability

Best first insertion point remains OpenClaw’s current exposure seam:

- classify turn using existing Wave 2, Wave 3, and Wave 4 stack
- map that turn to a capability family
- expose only the tool family needed for that turn
- keep deeper tools internally reachable through explicit escalation or later orchestrator-controlled execution

This preserves full capability because it narrows visibility, not existence.

## 3. Recommended Wave 5 architecture direction

### Architecture direction

Wave 5 should become capability-family routing plus scoped tool exposure.

That means:

- keep all tools and packages intact
- define capability families that describe what should be visible to the active model
- hide low-level plumbing unless the turn actually needs it
- treat JoOrchestrator as the eventual control plane for capability routing and escalation, but not as the first place to implement the live reduction

### Recommended capability families for the first planning baseline

- `none`
  - zero-tool fast/direct turns already handled by Wave 2
- `read_only_workspace`
  - repo/file inspection only
  - canonical examples: `read`, `read_file`, `grep_search`, `file_search`, `list_dir`
- `workspace_mutation`
  - edit/write/apply_patch class tools
- `runtime_process`
  - `exec`, `process`
- `session_orchestration`
  - `message`, `sessions_send`, `sessions_spawn`, `sessions_list`, `sessions_history`, `subagents`, `agents_list`
- `browser_web`
  - `browser`, web-fetch/web-search-style surfaces where enabled
- `environment_control`
  - `nodes`, `canvas`, `tts`, `gateway`, operator-grade runtime controls
- `jo_memory`
  - `jo_memory_search`, `jo_memory_get`, `jo_memory_capture`, `jo_memory_feedback`
- `jo_orchestrator_capability`
  - future capability-level orchestrator entry points rather than dozens of low-level package tools
- `jo_operator_observability`
  - audit, telemetry, identity, secrets, supply-chain, and admin/operator-grade probes that should not be broadly exposed on normal turns

### Recommended end-state layering

Layer A: deterministic intake and classification

- Wave 2, Wave 3, and Wave 4 continue to classify the turn
- deterministic pre-routing should handle clear admin, policy, identity, heartbeat, and runtime checks where possible

Layer B: capability-family selection

- choose which family is visible to the active model for this turn
- do not expose the whole tool universe by default

Layer C: capability-level public entry points

- model sees capability-level surfaces appropriate to the turn
- low-level package plumbing is hidden unless specifically needed

Layer D: internal execution and escalation

- deeper OpenClaw or Jo tools remain reachable internally
- JoOrchestrator can later choose model tier, async mode, subagent allowance, and escalation path behind those capability-level entry points

### Reconciliation note between the two plans

The OpenClaw Wave 5 plan and the Jo tool exposure / orchestrator gating plan align on the same end-state:

- scoped tool visibility
- preserved internal capability
- less model-visible plumbing
- more intentional routing and fallback

They differ only in first implementation location:

- first implementation: OpenClaw exposure seam
- later control-plane expansion: JoOrchestrator capability routing and escalation policy

## 4. What should happen in OpenClaw first

The first implementation should remain in OpenClaw.

### Why OpenClaw first

- OpenClaw currently owns the model-visible tool set.
- OpenClaw already has `disableTools` and `toolNameAllowlist`.
- OpenClaw already measures exposed tool counts and schema chars.
- OpenClaw already owns the fallback path when a narrowed run underperforms.

### First implementation scope

Phase 1 is now implemented as analysis, mapping, diagnostics, and shadow-ready gating hooks only.

Phase 2 should apply one narrow live reduction only:

- high-confidence read-only inspection turns
- map to `read_only_workspace`
- hide `message`, `browser`, `nodes`, `exec`, `process`, session tools, and operator-grade Jo/plugin tools for that subset

Keep unchanged in the first implementation:

- zero-tool Wave 2 fast turns
- protected deep turns
- memory-heavy turns
- low-confidence reasoning turns
- subagent-root and internal-round turns
- attachments
- JoMemory retrieval semantics
- JoOrchestrator internals

### OpenClaw-first rollout work

1. confirm capability-family mapping against the real current tool surface
2. normalize canonical built-in names and client-tool aliases into the same family map
3. add Wave 5 shadow diagnostics only
4. run shadow comparisons on real dashboard/Discord/terminal paths
5. enable one active reduction only for the read-only inspection subset
6. validate fallback and prompt/tool exposure metrics in real runs

## 5. What should later move into JoOrchestrator

JoOrchestrator should later own more of the control-plane logic, but only after OpenClaw proves the first live reduction safely.

### Good later candidates for JoOrchestrator ownership

- capability-profile selection
  - choose between memory, coding, policy, research, evaluation, ops, runtime-status, and similar families
- model-tier selection
  - local-first vs larger/remote model choice based on task class and latency sensitivity
- deterministic pre-gating
  - control, identity, policy, secrets, heartbeat, runtime job, and similar checks before broad LLM exposure
- sync vs async routing
  - whether work becomes a runtime job, background research run, replay run, or direct synchronous turn
- escalation policy
  - when low-level tools or broader tool families become reachable
- subagent policy
  - whether subagents are allowed at all for a given turn class

### What should stay internal-only or not broadly model-visible

These should generally not be in the broad default tool set for ordinary turns:

- raw audit probes
- secrets and identity preflight surfaces
- supply-chain and policy admin surfaces
- runtime job administration surfaces
- lineage/replay/operator probes
- low-level package plumbing where a capability-level entry point can hide the details

That does not mean deletion.

It means:

- keep them reachable internally
- expose them only when the turn class, operator context, or escalation policy calls for them

### JoOrchestrator end-state

JoOrchestrator should evolve from:

- real orchestration runtime plus broad plugin bridge

toward:

- real orchestration runtime plus narrower capability-level public surfaces plus explicit escalation rules

## 6. Real-world validation plan

Wave 5 planning must include real-world validation, not just repo analysis.

### Validation surfaces

1. OpenClaw dashboard turns
2. Discord turns
3. direct terminal and tool/API paths
4. shadow vs active runtime comparisons
5. prompt/tool exposure metrics and fallback behavior in real runs

### Phase 1 validation: analysis and measurement only

Before any live reduction:

- use `/context detail` to capture current prompt and tool exposure on target prompts
- capture exposed tool names, counts, list chars, schema chars, and top schema contributors
- confirm which prompts currently use which tools in live runs

Target prompt families for baseline:

- `check the repo status`
- `read this file`
- `list the files involved`
- one memory-heavy control prompt
- one reasoning-heavy control prompt
- one operator/admin-style prompt

### Dashboard validation

Existing dashboard-facing validation surfaces already exist in Jo docs and scripts.

Useful paths:

- `pnpm openclaw:chat:tool-debug`
- `pnpm openclaw:chat:tool-smoke`
- `pnpm openclaw:extensions:refresh:chat`
- dashboard prompts documented in `Jo/docs/tools/jo-orchestrator-operator-runbook.md`

Wave 5 dashboard validation should explicitly verify:

- shadow mode emits the expected Wave 5 decision/outcome fields
- active mode reduces the visible tool set only for the targeted prompt family
- tool calls still succeed when the narrowed family is sufficient
- fallback to the full tool surface happens exactly once when needed
- final assistant output remains usable

### Discord validation

Discord should be a real validation surface, not a postscript.

Recommended sequence:

1. validate dashboard first
2. run the same approved prompt family through a Discord session
3. compare shadow vs active behavior for the same prompts
4. confirm no plugin-load regressions and no channel-specific routing regressions

Discord checks should verify:

- tool exposure changes are the same as dashboard for the targeted family
- reply quality remains stable
- no unexpected operator/admin surfaces appear
- fallback behavior remains intact

### Direct terminal / API validation

Useful direct paths already exist:

- `openclaw plugins info jo-orchestrator`
- `openclaw tools call ...`
- `pnpm --filter joorchestrator openclaw:plugin:smoke`
- gateway-backed chat tool debug/smoke scripts from the Jo root package

Wave 5 terminal/API validation should verify:

- which tools are physically available vs model-visible
- whether capability-family mapping matches the actual registered tool catalog
- whether shadow diagnostics and active behavior agree with chat-facing runs

### Shadow vs active comparisons

Wave 5 should use the same conservative rollout posture as Wave 4:

- `off`
- `shadow`
- `active`

Required comparisons per targeted prompt:

- exposed tool count
- exposed tool names
- tool list chars
- tool schema chars
- used tool names
- fallback occurrence
- usable final output yes/no

### Real fallback validation

Real runs must validate fallback explicitly.

For at least one targeted prompt in active mode:

- induce or observe a narrowed run that returns no usable text
- confirm one retry with the broader tool surface
- confirm the final outcome event records fallback clearly
- confirm the final answer is usable

### Suggested staged rollout

Phase 1: analysis + capability-family mapping

- no code behavior changes
- finalize family map
- measure real tool exposure and current tool use on target prompts

Phase 2: one narrow live gating reduction

- read-only inspection family only
- dashboard and direct tool/API shadow validation first
- active mode only after shadow data is clean

Phase 3: real-world validation in dashboard, Discord, and terminal

- run the same prompt set across surfaces
- compare shadow vs active
- verify fallback, tool counts, tool names, and prompt exposure metrics

Later phase: orchestrator/control-plane expansion

- capability-level public surfaces
- model-tier selection
- async/delegation policy
- broader deterministic routing before LLM exposure

## 7. Risks and unknowns

Primary risks:

- narrowing the wrong prompts and hiding tools that are actually needed
- drift between canonical OpenClaw tools, client-tool aliases, and plugin tool names
- assuming JoOrchestrator is already the control plane for model-visible exposure when OpenClaw still owns that seam
- exposing operator/admin/package-plumbing tools too broadly during ordinary turns
- building a second router instead of extending the current decision stack
- failing to validate on real dashboard and Discord paths before widening scope

Important unknowns to validate next:

- how often current live turns actually need the broad `message` / `browser` / `nodes` / `exec` / `process` family outside explicitly operational prompts
- whether the current deployed target turns expose more canonical tools, more client tools, or a mixed catalog
- how many `jo_orchestrator_*` tools are broadly visible in ordinary chat-facing sessions today versus only in operator workflows
- whether first-token latency is consistently measurable across the surfaces we care about, or whether tool/schema reduction should remain the main rollout gate initially

Key safety posture:

- if uncertain, keep the current broader surface
- prove the first narrow reduction in real runs before moving routing deeper into JoOrchestrator

## 8. Documentation updated

Updated:

- `docs/debug/openclaw-custom-patches/WAVE5_PATCH_PLAN.md`
- `docs/debug/openclaw-custom-patches/WAVE5_IMPLEMENTATION.md`

This revision now explicitly:

- compares the existing Wave 5 direction with `Jo/docs/research/jo_tool_exposure_orchestrator_gating_plan.md`
- explains why they are complementary rather than competing
- identifies what should remain in OpenClaw first
- identifies what can later move into JoOrchestrator as a stronger control plane
- adds a real-world validation plan covering dashboard, Discord, terminal/tool paths, shadow vs active comparisons, prompt/tool exposure metrics, and fallback behavior
- records that Phase 1 shipped as capability-family mapping plus additive diagnostics without broad live narrowing
