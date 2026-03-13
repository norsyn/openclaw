# Wave 3 Implementation

## Status

Wave 3 Phase 1 and Phase 2 are now implemented.

This file remains the top-level Wave 3 record. The detailed Phase 2 implementation record is here:

- [docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_PHASE2_IMPLEMENTATION.md)

Phase 1 was implemented as a behavior-neutral scaffold.

Scope stayed intentionally narrow:

- no policy overrides
- no profile promotion or demotion
- no prompt-size changes
- no JoMemory logic changes
- no tool-routing changes
- no user-visible routing changes
- no new user-facing controls

## What changed

### 1. Standalone response policy module

Added:

- [src/auto-reply/reply/response-policy.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.ts)

This module now owns:

- response policy profile types
- classifier snapshot shape
- Phase 1 policy decision resolver
- structured decision and outcome event builders
- response-length measurement helper for final payloads

Phase 1 behavior:

- returns the existing classifier result unchanged
- marks `direct` only for exact deterministic direct-reply cases that already existed before this patch
- records `overrideApplied: false` for all turns

### 2. Policy layer wiring at the required insertion point

Updated:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

What changed there:

- the existing Wave 2 classifier still resolves the base run profile first
- the new response policy layer is called immediately after that classifier result is known
- a structured policy decision event is emitted on the existing agent-event bus
- runtime facts needed for the later outcome event are tracked additively:
  - whether `jo_memory_search` ran
  - which tool names were used

What did not change there:

- Wave 2 classifier rules
- direct reply eligibility
- fast/deep routing decisions
- prompt construction behavior
- tool exposure behavior

### 3. Policy outcome logging in the shared reply path

Updated:

- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)

What changed there:

- a structured policy outcome event is emitted after the run returns in the shared reply path
- the outcome event is emitted for:
  - direct final replies
  - empty final payload paths
  - normal final payload paths

Outcome fields captured:

- prompt
- classifier snapshot
- selected profile
- latency
- retrieval used
- tools used
- tool names
- fallback triggered
- response length

What did not change there:

- fallback behavior
- payload assembly
- response usage decoration
- user-visible reply content

## Exact files changed

Code:

- [src/auto-reply/reply/response-policy.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.ts)
- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- [src/auto-reply/reply/agent-runner.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.ts)
- [src/auto-reply/reply/response-policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.test.ts)
- [src/auto-reply/reply/agent-runner.policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.policy.test.ts)

Docs:

- [docs/debug/openclaw-custom-patches/WAVE3_PATCH_PLAN.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_PATCH_PLAN.md)
- [docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_IMPLEMENTATION.md)

## Behavior-neutral guarantee

This Phase 1 patch is additive only.

Explicitly unchanged:

- Wave 1 safeguards
- Wave 2 classifier decisions
- direct / fast / deep routing behavior
- JoMemory retrieval logic
- tool routing and tool schemas
- deep reasoning behavior
- prompt construction and prompt-size behavior

The response policy layer currently observes and records. It does not adapt.

## Log/event schema added

Existing path reused:

- `emitAgentEvent(...)` in [src/infra/agent-events.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/infra/agent-events.ts)

New stream used:

- `stream: "policy"`

### Decision event

```ts
{
  eventType: "decision";
  policyVersion: "wave3-phase1";
  prompt: string;
  hasAttachments: boolean;
  isSlashCommand: boolean;
  classifier: {
    mode: "fast" | "deep";
    disableTools: boolean;
    toolNameAllowlist?: string[];
    directReplyEligible: boolean;
  };
  classifierProfile: "fast" | "deep";
  selectedProfile: "direct" | "fast" | "deep";
  overrideApplied: false;
  overrideReasonCodes: [];
}
```

### Outcome event

```ts
{
  eventType: "outcome";
  policyVersion: "wave3-phase1";
  prompt: string;
  hasAttachments: boolean;
  isSlashCommand: boolean;
  classifier: {
    mode: "fast" | "deep";
    disableTools: boolean;
    toolNameAllowlist?: string[];
    directReplyEligible: boolean;
  };
  classifierProfile: "fast" | "deep";
  selectedProfile: "direct" | "fast" | "deep";
  overrideApplied: false;
  overrideReasonCodes: [];
  latencyMs: number;
  retrievalUsed: boolean;
  toolsUsed: boolean;
  toolNames: string[];
  fallbackTriggered: boolean;
  responseLength: number;
}
```

## Tests added

Added:

- [src/auto-reply/reply/response-policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/response-policy.test.ts)
  - proves Phase 1 pass-through behavior for fast and deep classifier outputs
  - proves direct eligibility is recorded without being treated as an override
  - proves structured decision/outcome event shapes
- added [src/auto-reply/reply/agent-runner.policy.test.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner.policy.test.ts)
  - proves exact direct reply routing is unchanged
  - proves tool-backed deep routing is unchanged
  - proves JoMemory retrieval usage is recorded from existing tool events without altering reply behavior

## Known limitations

- Phase 1 policy events are emitted on the existing in-process agent-event bus. They are structured and subscriber-friendly, but they are not persisted as a standalone storage record yet.
- `retrievalUsed` is currently derived from existing tool events and specifically tracks `jo_memory_search` usage. This is sufficient for current architecture but should be re-checked if retrieval plumbing changes later.
- Phase 1 records `direct` as a selected profile only for already-existing deterministic direct replies. It does not introduce any new direct-routing decisions.

## Phase 2 status

Phase 2 now builds on the Phase 1 seam with:

- bounded override resolution
- hard deep blockers
- lightweight local persistence under `OPENCLAW_STATE_DIR`
- `off`, `shadow`, and `adaptive` modes
- outcome-driven evidence updates and reversible demotion logic

Shadow verification findings are recorded here:

- [docs/debug/openclaw-custom-patches/WAVE3_SHADOW_VERIFICATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_SHADOW_VERIFICATION.md)

Controlled adaptive rollout findings are recorded here:

- [docs/debug/openclaw-custom-patches/WAVE3_ADAPTIVE_ROLLOUT.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE3_ADAPTIVE_ROLLOUT.md)

Current live adaptive scope is intentionally limited to:

- `what can you do`
- `how can you help`

The key architectural boundary remains intact:

- Wave 2 remains the unchanged base classifier
- Wave 3 evolves above it without rewriting it
