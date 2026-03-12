import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDeepTurnPhase2Plan,
  buildDeepTurnPromptContributors,
  resolveDeepTurnPhase2Mode,
  resolveDeepTurnPhase2Plan,
  resolveDeepTurnExecutionProfile,
  resolveRootTurnOrigin,
} from "./deep-turn-profile.js";

beforeEach(() => {
  delete process.env.OPENCLAW_WAVE4_PHASE2_MODE;
});

describe("resolveDeepTurnExecutionProfile", () => {
  it("classifies recall-heavy prompts as memory_deep", () => {
    expect(
      resolveDeepTurnExecutionProfile({
        prompt: "what did we decide last time about Wave 1?",
        turnOrigin: "user_root",
      }),
    ).toMatchObject({
      category: "memory_deep",
      confidence: "high",
      retrievalLikely: true,
      retrievalMode: "required",
      toolExposureMode: "none",
    });
  });

  it("prefers tool_deep when operational and memory cues are both present", () => {
    expect(
      resolveDeepTurnExecutionProfile({
        prompt: "check the repo status from last time",
        turnOrigin: "user_root",
      }),
    ).toMatchObject({
      category: "tool_deep",
      confidence: "high",
      retrievalLikely: true,
      retrievalMode: "optional",
      toolExposureMode: "full",
    });
  });

  it("classifies operational prompts as tool_deep", () => {
    expect(
      resolveDeepTurnExecutionProfile({
        prompt: "read the repo status and inspect the failing build",
        turnOrigin: "user_root",
      }),
    ).toMatchObject({
      category: "tool_deep",
      retrievalLikely: false,
      retrievalMode: "skip",
      toolExposureMode: "full",
    });
  });

  it("falls back safely to reasoning_deep for ambiguous deep prompts", () => {
    expect(
      resolveDeepTurnExecutionProfile({
        prompt: "explain the architectural tradeoffs here",
        turnOrigin: "user_root",
      }),
    ).toMatchObject({
      category: "reasoning_deep",
      confidence: "low",
      retrievalLikely: false,
      retrievalMode: "optional",
      toolExposureMode: "none",
      reasonCodes: ["ambiguous_deep_fallback"],
    });
  });

  it("keeps phase 2 dormant on the base diagnosis profile until the execution seam applies it", () => {
    expect(
      resolveDeepTurnExecutionProfile({
        prompt: "check the repo status",
        turnOrigin: "user_root",
      }),
    ).toMatchObject({
      phase2Mode: "shadow",
      phase2Applied: false,
      phase2ShadowOnly: false,
      phase2CandidateReduction: undefined,
    });
  });
});

describe("resolveDeepTurnPhase2Mode", () => {
  it("defaults to shadow mode", () => {
    expect(resolveDeepTurnPhase2Mode()).toBe("shadow");
  });
});

describe("resolveDeepTurnPhase2Plan", () => {
  it("computes but does not apply the read-only tool-deep allowlist in shadow mode", () => {
    const profile = resolveDeepTurnExecutionProfile({
      prompt: "check the repo status",
      turnOrigin: "user_root",
    });

    expect(
      resolveDeepTurnPhase2Plan({
        profile,
        turnOrigin: "user_root",
        hasAttachments: false,
        hasProtectedDeepBlocker: false,
      }),
    ).toMatchObject({
      mode: "shadow",
      candidateReduction: "tool_allowlist_narrowing",
      applied: false,
      shadowOnly: true,
      toolAllowlist: ["read_file", "grep_search", "file_search", "list_dir"],
    });
  });

  it("applies the read-only tool-deep allowlist in active mode", () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const profile = resolveDeepTurnExecutionProfile({
      prompt: "read this file",
      turnOrigin: "user_root",
    });

    expect(
      applyDeepTurnPhase2Plan({
        profile,
        plan: resolveDeepTurnPhase2Plan({
          profile,
          turnOrigin: "user_root",
          hasAttachments: false,
          hasProtectedDeepBlocker: false,
        }),
      }),
    ).toMatchObject({
      phase2Mode: "active",
      phase2CandidateReduction: "tool_allowlist_narrowing",
      phase2Applied: true,
      phase2ShadowOnly: false,
      toolExposureMode: "allowlist",
      toolAllowlistRecommendation: ["read_file", "grep_search", "file_search", "list_dir"],
    });
  });

  it("keeps memory and reasoning deep prompts unchanged", () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const memoryProfile = resolveDeepTurnExecutionProfile({
      prompt: "what did we decide last time about Wave 1?",
      turnOrigin: "user_root",
    });
    const reasoningProfile = resolveDeepTurnExecutionProfile({
      prompt: "explain the architectural tradeoffs here",
      turnOrigin: "user_root",
    });

    expect(
      resolveDeepTurnPhase2Plan({
        profile: memoryProfile,
        turnOrigin: "user_root",
        hasAttachments: false,
        hasProtectedDeepBlocker: false,
      }),
    ).toMatchObject({ applied: false, reasonCodes: ["phase2_not_tool_deep"] });
    expect(
      resolveDeepTurnPhase2Plan({
        profile: reasoningProfile,
        turnOrigin: "user_root",
        hasAttachments: false,
        hasProtectedDeepBlocker: false,
      }),
    ).toMatchObject({ applied: false, reasonCodes: ["phase2_not_tool_deep"] });
  });

  it("keeps subagent and internal-round turns unchanged", () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const profile = resolveDeepTurnExecutionProfile({
      prompt: "list the files involved",
      turnOrigin: "user_root",
    });

    expect(
      resolveDeepTurnPhase2Plan({
        profile,
        turnOrigin: "subagent_root",
        hasAttachments: false,
        hasProtectedDeepBlocker: false,
      }),
    ).toMatchObject({ applied: false, reasonCodes: ["phase2_non_user_root_turn"] });
    expect(
      resolveDeepTurnPhase2Plan({
        profile,
        turnOrigin: "agent_internal_round",
        hasAttachments: false,
        hasProtectedDeepBlocker: false,
      }),
    ).toMatchObject({ applied: false, reasonCodes: ["phase2_non_user_root_turn"] });
  });
});

describe("resolveRootTurnOrigin", () => {
  it("prefers explicit origin tags", () => {
    expect(resolveRootTurnOrigin({ turnOrigin: "queued_user_followup" })).toBe(
      "queued_user_followup",
    );
  });

  it("defaults subagent sessions to subagent_root", () => {
    expect(resolveRootTurnOrigin({ isSubagentSession: true })).toBe("subagent_root");
  });

  it("defaults normal sessions to user_root", () => {
    expect(resolveRootTurnOrigin({ isSubagentSession: false })).toBe("user_root");
  });
});

describe("buildDeepTurnPromptContributors", () => {
  it("maps the existing system prompt report into Wave 4 contributor diagnostics", () => {
    expect(
      buildDeepTurnPromptContributors({
        source: "run",
        generatedAt: 0,
        systemPrompt: { chars: 100, projectContextChars: 40, nonProjectContextChars: 60 },
        injectedWorkspaceFiles: [],
        bootstrap: {
          fileCount: 2,
          missingCount: 0,
          truncatedCount: 1,
          rawChars: 200,
          injectedChars: 120,
        },
        skills: { promptChars: 15, entries: [] },
        tools: { listChars: 10, schemaChars: 20, exposedCount: 3, entries: [] },
      }),
    ).toEqual({
      systemPromptChars: 100,
      projectContextChars: 40,
      skillsPromptChars: 15,
      toolListChars: 10,
      toolSchemaChars: 20,
      bootstrapFileCount: 2,
      bootstrapMissingCount: 0,
      bootstrapTruncatedCount: 1,
      bootstrapRawChars: 200,
      bootstrapInjectedChars: 120,
    });
  });
});
