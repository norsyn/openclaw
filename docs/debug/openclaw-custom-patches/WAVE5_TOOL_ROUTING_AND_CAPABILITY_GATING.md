# Wave 5 Tool Routing and Capability Gating

## Purpose

Wave 5 reduces prompt bloat, first-token latency, and accidental tool detours by ensuring the model sees only the tools a given turn is likely to need.

This is a routing and capability-shaping layer, not a redesign of the tool system.

Wave 5 builds on the existing stack:

- Wave 1: safety and transcript safeguards
- Wave 2: fast-turn routing
- Wave 3: bounded adaptive response policy
- Wave 4: deep-turn diagnostics and selective deep-turn narrowing

The goal is to stop the model from paying the cost of a large always-on tool surface when the turn only needs a small subset of capabilities.

---

# Problem Statement

Production diagnostics showed that trivial and some deep turns were still carrying a very large tool envelope.

Observed issues included:

- high tool counts
- large tool-schema bytes
- oversized request bodies
- long prompt-evaluation times before first token
- unnecessary exposure of tools unrelated to the current turn

This harms both:

- latency
- routing quality

The problem is not just "too many tools exist." The problem is that too many tools are exposed to the model for a given turn.

---

# Wave 5 Goal

Introduce a capability-gating layer that determines which tools should be visible for the current turn.

It should:

1. reduce exposed tool count
2. reduce tool schema bytes
3. preserve correctness and fallback safety
4. remain explainable and testable

---

# Scope Boundaries

Wave 5 should not:

- redesign the entire tool framework
- remove tools globally
- change Jo package ownership boundaries
- weaken deep-mode safety
- force cloud routing

Wave 5 should:

- shape visible tool capability per turn
- reuse existing routing/policy/deep-profile work where possible
- add conservative fallback behavior

---

# Tool Exposure Tiers

## Tier 1 — No Tools

Used for turns that clearly do not need tools.

Examples:

- greeting
- acknowledgement
- exact short reply
- simple conversational response

Expected behavior:

- expose zero tools
- rely on deterministic or model-only response path

---

## Tier 2 — Narrow Allowlist

Used for turns where a small, high-confidence subset of tools is sufficient.

Examples:

- read-only repo/file inspection
- simple file search
- directory listing
- narrow diagnostic inspection

Expected behavior:

- expose only the minimal required tools
- preserve fallback to a broader set if the narrow set proves insufficient

---

## Tier 3 — Full Deep Tool Surface

Used for turns where broad tool flexibility is still required.

Examples:

- operational tasks
- editing/fixing/building/running
- ambiguous tool-heavy prompts
- protected deep prompts

Expected behavior:

- preserve current full deep tool surface
- use only when narrowing is not yet safe

---

# Capability Gating Inputs

Wave 5 should base tool exposure on signals already present in the system where possible:

- Wave 2 turn classification
- Wave 3 policy decision/profile
- Wave 4 deep-turn category
- turn origin
- prompt cues
- protected-deep blockers
- observed tool-use history where already available

The capability gate should not create a second competing routing system.

---

# Architecture Shape

The capability gate should sit after routing/profile selection and before final tool construction.

High-level flow:

user prompt
→ Wave 2 classifier
→ Wave 3 policy layer
→ Wave 4 deep-turn profile
→ Wave 5 capability gate
→ final visible tool set
→ model call

This ensures that capability gating is downstream of the existing decision layers.

---

# First Implementation Principle

Wave 5 should start narrow.

Recommended order:

1. identify highest-cost always-on tools/tool schemas
2. group tools into coarse capability families
3. gate trivial turns to zero tools
4. gate specific high-confidence deep/tool turns to narrow allowlists
5. measure before widening scope

---

# Capability Families

Wave 5 should consider grouping tools into clear families such as:

- conversation/meta
- file read/search/list
- repo inspection
- shell/process/runtime ops
- browser/web
- Jo orchestrator async/research/task tools
- messaging/output/archive tools

The exact grouping should be implementation-driven and conservative.

The key requirement is that high-cost families not needed for a turn should remain hidden.

---

# Safety Rules

Wave 5 must preserve these rules:

1. If uncertain, prefer the broader safe path.
2. Protected deep prompts must keep required capabilities.
3. Narrow allowlists must have a fallback path.
4. No tool family should be hidden if the turn clearly requires it.
5. Internal turns and user-visible turns may need different gating later, but Phase 1 should not overcomplicate that.

---

# Measurement Requirements

Wave 5 should measure:

- exposed tool count
- exposed tool names
- tool list chars
- tool schema chars
- used tool count
- used tool names
- first-token latency
- prompt-evaluation duration
- fallback-to-full-tool-surface frequency

This must be compared before and after gating.

---

# Relationship to Jo Packages

Wave 5 should remain primarily an OpenClaw runtime concern.

However, future integration may make sense for:

- telemetry aggregation in JoTelemetry
- longer-horizon capability usage analysis
- Jo-side analytics on orchestration/tool families

But the first implementation should not move runtime tool gating into Jo packages unless there is a very clear architectural benefit.

---

# Phase Plan

## Phase 1

Diagnosis and capability-family mapping.

## Phase 2

Implement one or two high-confidence gating reductions.

## Phase 3

Validate, measure, and decide whether to widen scope.

---

# Success Criteria

Wave 5 is successful if:

- trivial turns stop carrying unnecessary tool schemas
- selected deep turns expose fewer tools without regressions
- prompt-evaluation time drops for targeted categories
- fallback keeps quality intact
- the gating rules remain explainable

---

# Non-Goals

Wave 5 does not attempt to:

- solve all remaining deep-turn latency at once
- redesign provider routing
- replace Wave 2, Wave 3, or Wave 4
- create unrestricted dynamic tool learning

---

# Maintenance

Future updates should preserve:

- routing before capability shaping
- conservative defaults
- measurable before/after comparisons
- clear separation between OpenClaw runtime behavior and Jo package behavior
