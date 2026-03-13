import { describe, expect, it } from "vitest";
import { buildWave5OutcomeEvent, resolveWave5CapabilityPlan } from "./wave5-capability-routing.js";

describe("wave5 capability routing", () => {
  it("recommends the read-only workspace family in shadow mode for the approved inspection subset", () => {
    const plan = resolveWave5CapabilityPlan({
      prompt: "check the repo status",
      turnOrigin: "user_root",
      selectedProfile: "deep",
      runProfile: { disableTools: false },
      deepTurnProfile: {
        profileVersion: "wave4-phase1",
        diagnosticsOnly: true,
        prompt: "check the repo status",
        promptPreview: "check the repo status",
        normalizedPrompt: "check the repo status",
        turnOrigin: "user_root",
        category: "tool_deep",
        confidence: "high",
        retrievalLikely: false,
        retrievalMode: "skip",
        toolExposureMode: "full",
        bootstrapContextMode: "full",
        skillsPromptMode: "full",
        reasonCodes: ["operational_intent_detected"],
        phase2Mode: "shadow",
        phase2CandidateReduction: undefined,
        phase2Applied: false,
        phase2ShadowOnly: false,
        phase2ReasonCodes: [],
      },
      hasAttachments: false,
      env: { OPENCLAW_WAVE5_PHASE2_MODE: "shadow" } as NodeJS.ProcessEnv,
    });

    expect(plan.capabilityFamilyRecommendation).toBe("read_only_workspace");
    expect(plan.candidateReduction).toBe("capability_family_gate");
    expect(plan.applied).toBe(false);
    expect(plan.phase2Applied).toBe(false);
    expect(plan.shadowOnly).toBe(true);
    expect(plan.gatingDiagnosticOnly).toBe(true);
    expect(plan.hiddenCapabilityFamilies).toEqual(["runtime_process"]);
    expect(plan.toolAllowlistRecommendation).toEqual([
      "read_file",
      "grep_search",
      "file_search",
      "list_dir",
    ]);
  });

  it("keeps protected deep behavior unchanged outside the approved subset", () => {
    const plan = resolveWave5CapabilityPlan({
      prompt: "what did we decide last time?",
      turnOrigin: "user_root",
      selectedProfile: "deep",
      runProfile: { disableTools: false },
      deepTurnProfile: {
        profileVersion: "wave4-phase1",
        diagnosticsOnly: true,
        prompt: "what did we decide last time?",
        promptPreview: "what did we decide last time",
        normalizedPrompt: "what did we decide last time",
        turnOrigin: "user_root",
        category: "memory_deep",
        confidence: "high",
        retrievalLikely: true,
        retrievalMode: "required",
        toolExposureMode: "none",
        bootstrapContextMode: "full",
        skillsPromptMode: "full",
        reasonCodes: ["continuity_detected", "memory_recall_detected"],
        phase2Mode: "shadow",
        phase2CandidateReduction: undefined,
        phase2Applied: false,
        phase2ShadowOnly: false,
        phase2ReasonCodes: [],
      },
      hasAttachments: false,
      env: { OPENCLAW_WAVE5_PHASE2_MODE: "shadow" } as NodeJS.ProcessEnv,
    });

    expect(plan.capabilityFamilyRecommendation).toBeUndefined();
    expect(plan.applied).toBe(false);
    expect(plan.reasonCodes).toContain("wave5_not_tool_deep");
  });

  it("applies the exact read-only allowlist in active mode for the approved subset", () => {
    const plan = resolveWave5CapabilityPlan({
      prompt: "read this file",
      turnOrigin: "user_root",
      selectedProfile: "deep",
      runProfile: { disableTools: false },
      deepTurnProfile: {
        profileVersion: "wave4-phase1",
        diagnosticsOnly: true,
        prompt: "read this file",
        promptPreview: "read this file",
        normalizedPrompt: "read this file",
        turnOrigin: "user_root",
        category: "tool_deep",
        confidence: "high",
        retrievalLikely: false,
        retrievalMode: "skip",
        toolExposureMode: "full",
        bootstrapContextMode: "full",
        skillsPromptMode: "full",
        reasonCodes: ["operational_intent_detected"],
        phase2Mode: "shadow",
        phase2CandidateReduction: undefined,
        phase2Applied: false,
        phase2ShadowOnly: false,
        phase2ReasonCodes: [],
      },
      hasAttachments: false,
      hasProtectedDeepBlocker: false,
      env: { OPENCLAW_WAVE5_PHASE2_MODE: "active" } as NodeJS.ProcessEnv,
    });

    expect(plan.capabilityFamilyRecommendation).toBe("read_only_workspace");
    expect(plan.applied).toBe(true);
    expect(plan.phase2Applied).toBe(true);
    expect(plan.shadowOnly).toBe(false);
    expect(plan.gatingDiagnosticOnly).toBe(false);
    expect(plan.hiddenCapabilityFamilies).toEqual(["runtime_process"]);
    expect(plan.toolAllowlistRecommendation).toEqual([
      "read_file",
      "grep_search",
      "file_search",
      "list_dir",
    ]);
  });

  it("keeps protected deep blockers off the live Wave 5 gate", () => {
    const plan = resolveWave5CapabilityPlan({
      prompt: "/check the repo status",
      turnOrigin: "user_root",
      selectedProfile: "deep",
      runProfile: { disableTools: false },
      deepTurnProfile: {
        profileVersion: "wave4-phase1",
        diagnosticsOnly: true,
        prompt: "/check the repo status",
        promptPreview: "/check the repo status",
        normalizedPrompt: "/check the repo status",
        turnOrigin: "user_root",
        category: "tool_deep",
        confidence: "high",
        retrievalLikely: false,
        retrievalMode: "skip",
        toolExposureMode: "full",
        bootstrapContextMode: "full",
        skillsPromptMode: "full",
        reasonCodes: ["operational_intent_detected"],
        phase2Mode: "shadow",
        phase2CandidateReduction: undefined,
        phase2Applied: false,
        phase2ShadowOnly: false,
        phase2ReasonCodes: [],
      },
      hasAttachments: false,
      hasProtectedDeepBlocker: true,
      env: { OPENCLAW_WAVE5_PHASE2_MODE: "active" } as NodeJS.ProcessEnv,
    });

    expect(plan.applied).toBe(false);
    expect(plan.phase2Applied).toBe(false);
    expect(plan.reasonCodes).toEqual(["wave5_protected_deep_blocker"]);
  });

  it("reports broader-tools fallback need when shadow diagnostics observe tools outside the candidate family", () => {
    const outcome = buildWave5OutcomeEvent({
      plan: {
        profileVersion: "wave5-phase2",
        prompt: "check the repo status",
        promptPreview: "check the repo status",
        normalizedPrompt: "check the repo status",
        turnOrigin: "user_root",
        mode: "shadow",
        capabilityFamilyRecommendation: "read_only_workspace",
        candidateReduction: "capability_family_gate",
        toolAllowlistRecommendation: ["read_file", "grep_search", "file_search", "list_dir"],
        applied: false,
        phase2Applied: false,
        shadowOnly: true,
        gatingDiagnosticOnly: true,
        hiddenCapabilityFamilies: ["runtime_process"],
        reasonCodes: ["wave5_phase1_diagnostics_only"],
      },
      usedToolNames: ["read_file", "exec"],
      usableTextResponse: true,
      phase2FallbackToFullDeep: false,
      systemPromptReport: {
        source: "run",
        generatedAt: Date.now(),
        systemPrompt: { chars: 100, projectContextChars: 40, nonProjectContextChars: 60 },
        injectedWorkspaceFiles: [],
        skills: { promptChars: 10, entries: [] },
        tools: {
          listChars: 20,
          schemaChars: 120,
          exposedCount: 2,
          familyCounts: [
            { family: "read_only_workspace", count: 1 },
            { family: "runtime_process", count: 1 },
          ],
          topSchemaContributors: [
            { name: "exec", schemaChars: 80, capabilityFamily: "runtime_process" },
          ],
          entries: [
            {
              name: "read_file",
              summaryChars: 10,
              schemaChars: 40,
              capabilityFamily: "read_only_workspace",
            },
            {
              name: "exec",
              summaryChars: 10,
              schemaChars: 80,
              capabilityFamily: "runtime_process",
            },
          ],
        },
      },
    });

    expect(outcome.fallbackToBroaderToolsWouldBeNeeded).toBe(true);
    expect(outcome.usableTextResponse).toBe(true);
    expect(outcome.phase2FallbackToFullDeep).toBe(false);
    expect(outcome.visibleCapabilityFamilies).toEqual(["read_only_workspace", "runtime_process"]);
  });
});
