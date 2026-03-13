# Wave 2 Patch Plan

## Wave 2 goals

Wave 2 should make trivial turns feel materially faster without removing the deeper Jo/OpenClaw behavior that is still needed for substantial turns.

The smallest safe goal is not a new architecture. It is a narrow fast-turn profile that:

- classifies clearly trivial prompts early
- reduces prompt payload for those turns
- suppresses retrieval for those turns unless the text clearly asks for recall or continuity
- suppresses unnecessary tool routing for those turns
- preserves the current deep path for normal and substantial turns

Wave 2 should remain compatible with the Wave 1 source-upstreamed fixes and should not disturb the current Jo integrations outside the fast-turn boundary.

## Proposed source targets

### A. Fast-turn classifier

Primary target:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)

Why this is the best insertion point:

- it already receives the final user-facing text as `commandBody`
- it sits above provider/model execution but below channel-specific ingestion
- it already threads run-level options such as `bootstrapContextMode` into `runEmbeddedPiAgent`
- it affects webchat and Discord through the shared reply-agent path rather than requiring per-channel duplication

Secondary type target:

- [src/auto-reply/types.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/types.ts)

Recommended implementation shape:

- heuristic-first, automatic classification
- no explicit user-facing mode switch for Wave 2 initial patch
- narrow positive classifier only, with false-negative bias

Recommended classifier shape:

- introduce a small helper, likely near the agent-runner path, that returns a run profile such as `deep` or `fast`
- classify as `fast` only for very short, obvious cases:
  - greetings
  - thanks / acknowledgements
  - simple confirmations
  - tiny follow-ups like `okay`, `got it`, `thanks`
  - short rewrite requests like `summarize this in one sentence`
  - short utility asks like `what time is it`
- force `deep` when any of the following appear:
  - memory/continuity phrases such as `last time`, `remember`, `recap`, `status`, `decision`, `follow up`
  - task-oriented verbs that often need tools or repo context
  - attachments/images or longer prompts
  - explicit request to search, inspect, run, check, trace, open, read, edit, fix, build, or debug

Lowest-risk recommendation:

- automatic heuristic classifier only for the initial Wave 2 patch
- keep configuration surface minimal, optionally one env/config kill switch later if needed

### B. Retrieval reduction

Primary Jo target:

- [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts)

Exact hook:

- `runPreResponseHook`
- existing helpers `isSubstantialTurn`, `isMeaningfulTurn`, `maybeSearch`, `buildInternalContextBlock`

Observation from current code:

- JoMemory already has a substantial-turn heuristic via `isSubstantialTurn`
- `runPreResponseHook` already branches for tool-backed intents and canonical todo handling before doing `maybeSearch`

Smallest safe Wave 2 plan:

- reuse the existing substantial-turn concept instead of inventing a separate retrieval system
- add a stricter fast-turn short-circuit before `maybeSearch`
- keep tool-backed intent detection and canonical todo logic intact

Recommended behavior:

- fast turns should skip deep retrieval entirely by default
- memory retrieval should still remain available when the prompt explicitly signals continuity or recall
- post-response capture can remain unchanged initially unless it is shown to add measurable latency on the synchronous path

### C. Tool-routing reduction

Primary targets:

- [src/auto-reply/reply/agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts)
- [src/agents/pi-embedded-runner/run/params.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/params.ts)
- [src/agents/pi-embedded-runner/run/attempt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts)
- [src/agents/pi-tools.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-tools.ts)

Why these are the right seams:

- `agent-runner-execution.ts` is where run-level options can be attached based on the final user prompt
- `run/params.ts` already carries `disableTools` and `bootstrapContextMode`
- `run/attempt.ts` is where tools are actually created and split into built-in and custom tools
- `pi-tools.ts` is the authoritative tool construction path

Recommended implementation shape:

- do not rely on prompt wording alone to discourage tool use
- prefer an execution-boundary reduction so the model never sees most tools on fast turns

Lowest-risk option:

- fast-turn profile should pass a reduced tool scope into the embedded runner
- first implementation can be extremely conservative:
  - for pure acknowledgements/greetings: disable tools entirely
  - for short utility turns: allow only a tiny explicit allowlist if needed

Why not prompt-only suppression:

- prompt-only suppression still leaves the full tool inventory visible in the system prompt and schema payloads
- that does little to reduce prompt size and still permits accidental tool routing

Why not broad routing refactor:

- unnecessary for Wave 2 initial pass
- existing `disableTools` plumbing already exists

Recommended follow-on refinement if needed:

- replace all-or-nothing `disableTools` with a tiny run-scoped allowlist in `run/params.ts` and `pi-tools.ts`
- use that allowlist to expose only benign essentials for fast turns

This is the cleanest way to prevent platform-wrong shell exploration for tiny prompts: do not expose shell or broad tool schemas in the first place on fast turns.

### D. Prompt/context reduction

Primary targets:

- [src/agents/pi-embedded-runner/run/attempt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/attempt.ts)
- [src/agents/system-prompt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.ts)
- [src/agents/bootstrap-files.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/bootstrap-files.ts)
- [src/agents/skills/workspace.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/skills/workspace.ts)
- [src/agents/system-prompt-report.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt-report.ts)
- [src/auto-reply/reply/commands-context-report.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/commands-context-report.ts)

Biggest known prompt contributors from current source:

- hardcoded full system prompt sections in `buildAgentSystemPrompt`
- injected workspace bootstrap files via `resolveBootstrapContextForRun`
- skills prompt via `resolveSkillsPromptForRun`
- tool inventory text and tool schemas
- runtime/project context captured in system prompt report

Important existing knobs already present:

- `PromptMode = "full" | "minimal" | "none"` in [system-prompt.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt.ts)
- `bootstrapContextMode = "full" | "lightweight"` in [bootstrap-files.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/bootstrap-files.ts)
- skills prompt char limiting in [workspace.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/skills/workspace.ts)
- system prompt reporting in [system-prompt-report.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt-report.ts)

Smallest safe Wave 2 prompt plan:

- for fast turns, reuse existing `bootstrapContextMode: "lightweight"`
- add a new fast-turn prompt profile that reuses `PromptMode` semantics rather than inventing a separate prompt builder
- keep deep turns on `full`

Essential vs optional on fast turns:

- essential:
  - identity/safety
  - minimal runtime identity
  - enough channel reply behavior to answer correctly
- optional on fast turns:
  - large workspace bootstrap files
  - large skills prompt blocks
  - broad tool list and tool schemas
  - rich workspace/project context blocks

### E. Mode boundary

Recommended mode boundary:

- hybrid internally, automatic externally

Specifically:

- automatic classifier chooses `fast` vs `deep`
- no new user-facing mode switch in the initial Wave 2 patch
- deep behavior remains the default whenever classification is uncertain

Why this is lowest risk:

- avoids forcing users to understand modes
- keeps the patch surface small
- preserves current Jo behavior unless a turn is clearly trivial
- still gives a clean internal abstraction for future tuning

## Expected latency wins

Wave 2 should primarily improve latency by removing unnecessary work before the model starts generating.

Expected wins for trivial turns:

- lower prompt assembly time due to reduced bootstrap context
- lower token load due to smaller system prompt and smaller tool schema payload
- lower chance of tool-call detours
- lower chance of deep retrieval before the first token
- better perceived first-token latency and total latency for greetings, acknowledgements, and tiny follow-ups

Largest likely contributors to perceived improvement:

1. hiding most or all tools for fast turns
2. using lightweight bootstrap context for fast turns
3. skipping deep retrieval for fast turns

## Risks

Main risks:

- false positives classify a real task as fast and make the model too shallow
- blanket tool disabling breaks short prompts that still legitimately need one safe utility tool
- prompt reduction cuts too much channel-specific behavior and harms reply correctness
- Wave 2 logic diverges from JoMemory heuristics instead of reusing them, creating two competing notions of turn depth

Risk controls:

- bias classifier toward false negatives, not false positives
- treat continuity/memory/task phrases as automatic deep-turn overrides
- keep deep mode as default fallback whenever uncertain
- reuse existing controls (`bootstrapContextMode`, prompt-mode semantics, existing JoMemory heuristics) instead of creating parallel systems
- capture before/after context metrics using the existing `/context` reporting path and `systemPromptReport`

## Recommended implementation order

1. Add a tiny internal fast-turn classifier at the shared reply-agent boundary in [agent-runner-execution.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/agent-runner-execution.ts).
2. Thread a run-scoped fast-turn profile into the embedded runner using the existing options path in [types.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/types.ts) and [run/params.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/pi-embedded-runner/run/params.ts).
3. Apply prompt/context reductions first:
   - `bootstrapContextMode: "lightweight"`
   - reduced prompt mode for fast turns
   - optional suppression or truncation of skills prompt for fast turns
4. Apply tool reduction second:
   - first pass can use all-or-nothing `disableTools` for the safest trivial subset
   - if needed, follow with a tiny fast-turn allowlist in `pi-tools.ts`
5. Reuse JoMemory heuristics to skip retrieval on fast turns unless continuity signals are present, centered on [jomemory.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/Jo/packages/joorchestrator/src/runtime/memory/jomemory.ts).
6. Add focused tests and before/after measurement using the existing context report path.

## Metrics to capture before and after

Capture these before any Wave 2 code lands:

- first-token latency for a warm trivial prompt
- total latency for a warm trivial prompt
- prompt assembly time where measurable
- system prompt chars and project-context chars from `systemPromptReport`
- injected bootstrap chars from `systemPromptReport`
- skills prompt chars from `systemPromptReport`
- tool list chars and tool schema chars from `systemPromptReport`
- whether retrieval ran on a trivial prompt
- whether any tool call ran on a trivial prompt

Useful built-in measurement/report sources already present:

- [commands-context-report.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/auto-reply/reply/commands-context-report.ts)
- [system-prompt-report.ts](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/src/agents/system-prompt-report.ts)
- existing Wave 1 timing hooks where operationally available

Recommended test prompt set for baseline and comparison:

- `hi`
- `hello`
- `thanks`
- `okay`
- `what time is it`
- `summarize this in one sentence`
- one clear deep-memory prompt such as `what did we decide last time about X?`
- one tool-needing prompt such as `check the repo status`

## Update notes

Wave 2 should be maintained as an additive patch on top of Wave 1, not a rewrite.

If Wave 2 is implemented later, the maintenance docs should be updated in the same directory to record:

- the exact classifier rules added
- which fast-turn reductions are active
- any new tests added
- before/after latency measurements for the baseline prompt set
- whether the patch uses blanket tool disablement or a reduced allowlist

## Implementation status

Wave 2 is now implemented.

Implementation record:

- [docs/debug/openclaw-custom-patches/WAVE2_IMPLEMENTATION.md](/Users/jo-runtime/.openclaw/workspaces/jo/04_build/openclaw-upstream/docs/debug/openclaw-custom-patches/WAVE2_IMPLEMENTATION.md)

This plan remains useful as the design rationale and target map. The implementation record above is the source of truth for:

- what was actually shipped
- exact files changed
- before/after measurements
- test results
- known limitations
- maintenance/update notes
