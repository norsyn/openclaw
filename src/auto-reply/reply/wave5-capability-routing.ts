import {
  type ToolCapabilityFamily,
  resolveCapabilityFamilyAllowlist,
  resolveSingleCapabilityFamily,
} from "../../agents/tool-capability-family.js";
import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { TurnOrigin } from "../types.js";
import { isReadOnlyToolDeepPrompt, type DeepTurnExecutionProfile } from "./deep-turn-profile.js";
import { normalizeResponsePolicyPrompt } from "./response-policy-rules.js";

export type Wave5Phase2Mode = "off" | "shadow" | "active";

export type Wave5CandidateReduction = "capability_family_gate";

export type Wave5CapabilityPlan = {
  profileVersion: "wave5-phase2";
  prompt: string;
  promptPreview: string;
  normalizedPrompt: string;
  turnOrigin: Exclude<TurnOrigin, "agent_internal_round">;
  mode: Wave5Phase2Mode;
  selectedCapabilityFamily?: ToolCapabilityFamily;
  capabilityFamilyRecommendation?: ToolCapabilityFamily;
  candidateReduction?: Wave5CandidateReduction;
  toolAllowlistRecommendation?: string[];
  applied: boolean;
  phase2Applied: boolean;
  shadowOnly: boolean;
  gatingDiagnosticOnly: boolean;
  hiddenCapabilityFamilies: ToolCapabilityFamily[];
  reasonCodes: string[];
};

export type Wave5CapabilityDecisionEvent = Wave5CapabilityPlan & {
  eventType: "decision";
};

export type Wave5CapabilityOutcome = {
  exposedToolCount: number;
  exposedToolNames: string[];
  visibleCapabilityFamilies: ToolCapabilityFamily[];
  toolFamilyCounts: Array<{ family: ToolCapabilityFamily; count: number }>;
  toolListChars: number;
  toolSchemaChars: number;
  topSchemaContributors: Array<{
    name: string;
    schemaChars: number;
    capabilityFamily: ToolCapabilityFamily;
  }>;
  gatingDiagnosticOnly: boolean;
  fallbackToBroaderToolsWouldBeNeeded: boolean;
  usableTextResponse: boolean;
  phase2FallbackToFullDeep: boolean;
};

export type Wave5CapabilityOutcomeEvent = Wave5CapabilityPlan &
  Wave5CapabilityOutcome & {
    eventType: "outcome";
  };

type TurnRunProfile = {
  disableTools: boolean;
  toolNameAllowlist?: string[];
};

function buildPromptPreview(normalizedPrompt: string): string {
  return normalizedPrompt.slice(0, 80);
}

export function resolveWave5Phase2Mode(env: NodeJS.ProcessEnv = process.env): Wave5Phase2Mode {
  const raw =
    env.OPENCLAW_WAVE5_PHASE2_MODE?.trim().toLowerCase() ??
    env.OPENCLAW_WAVE5_PHASE1_MODE?.trim().toLowerCase();
  if (raw === "off" || raw === "shadow" || raw === "active") {
    return raw;
  }
  return "shadow";
}

function resolveSelectedCapabilityFamily(input: {
  selectedProfile: "direct" | "fast" | "deep";
  runProfile: TurnRunProfile;
}): ToolCapabilityFamily | undefined {
  if (input.selectedProfile === "direct" || input.runProfile.disableTools) {
    return "none";
  }
  if (input.runProfile.toolNameAllowlist?.length) {
    return resolveSingleCapabilityFamily(input.runProfile.toolNameAllowlist);
  }
  return undefined;
}

export function resolveWave5CapabilityPlan(input: {
  prompt: string;
  turnOrigin: Exclude<TurnOrigin, "agent_internal_round">;
  selectedProfile: "direct" | "fast" | "deep";
  runProfile: TurnRunProfile;
  deepTurnProfile?: DeepTurnExecutionProfile;
  hasAttachments: boolean;
  hasProtectedDeepBlocker?: boolean;
  env?: NodeJS.ProcessEnv;
}): Wave5CapabilityPlan {
  const normalizedPrompt = normalizeResponsePolicyPrompt(input.prompt);
  const mode = resolveWave5Phase2Mode(input.env);
  const selectedCapabilityFamily = resolveSelectedCapabilityFamily({
    selectedProfile: input.selectedProfile,
    runProfile: input.runProfile,
  });

  const basePlan: Wave5CapabilityPlan = {
    profileVersion: "wave5-phase2",
    prompt: input.prompt,
    promptPreview: buildPromptPreview(normalizedPrompt),
    normalizedPrompt,
    turnOrigin: input.turnOrigin,
    mode,
    selectedCapabilityFamily,
    capabilityFamilyRecommendation: undefined,
    candidateReduction: undefined,
    toolAllowlistRecommendation: undefined,
    applied: false,
    phase2Applied: false,
    shadowOnly: false,
    gatingDiagnosticOnly: false,
    hiddenCapabilityFamilies: [],
    reasonCodes: [],
  };

  if (mode === "off") {
    return {
      ...basePlan,
      reasonCodes: ["wave5_mode_off"],
    };
  }

  if (input.selectedProfile !== "deep") {
    return {
      ...basePlan,
      reasonCodes: ["wave5_non_deep_selected_profile"],
    };
  }

  if (!input.deepTurnProfile) {
    return {
      ...basePlan,
      reasonCodes: ["wave5_missing_deep_turn_profile"],
    };
  }

  if (input.deepTurnProfile.category !== "tool_deep") {
    return {
      ...basePlan,
      reasonCodes: ["wave5_not_tool_deep"],
    };
  }

  if (input.deepTurnProfile.confidence !== "high") {
    return {
      ...basePlan,
      reasonCodes: ["wave5_low_confidence"],
    };
  }

  if (input.hasProtectedDeepBlocker) {
    return {
      ...basePlan,
      reasonCodes: ["wave5_protected_deep_blocker"],
    };
  }

  if (!isReadOnlyToolDeepPrompt(normalizedPrompt)) {
    return {
      ...basePlan,
      reasonCodes: ["wave5_prompt_out_of_scope"],
    };
  }

  if (input.deepTurnProfile.retrievalLikely || input.deepTurnProfile.retrievalMode !== "skip") {
    return {
      ...basePlan,
      reasonCodes: ["wave5_retrieval_not_skippable"],
    };
  }

  if (input.turnOrigin === "subagent_root") {
    return {
      ...basePlan,
      reasonCodes: ["wave5_non_user_root_turn"],
    };
  }

  if (input.hasAttachments) {
    return {
      ...basePlan,
      reasonCodes: ["wave5_has_attachments"],
    };
  }

  const toolAllowlistRecommendation = resolveCapabilityFamilyAllowlist("read_only_workspace") ?? [];
  return {
    ...basePlan,
    capabilityFamilyRecommendation: "read_only_workspace",
    candidateReduction: "capability_family_gate",
    toolAllowlistRecommendation,
    applied: mode === "active",
    phase2Applied: mode === "active",
    shadowOnly: mode === "shadow",
    gatingDiagnosticOnly: mode !== "active",
    hiddenCapabilityFamilies: ["runtime_process"],
    reasonCodes: [
      "wave5_read_only_inspection_candidate",
      "wave5_capability_family_read_only_workspace",
      mode === "active" ? "wave5_phase2_active_mode" : "wave5_shadow_mode",
    ],
  };
}

export function buildWave5DecisionEvent(plan: Wave5CapabilityPlan): Wave5CapabilityDecisionEvent {
  return {
    eventType: "decision",
    ...plan,
  };
}

export function buildWave5OutcomeEvent(input: {
  plan: Wave5CapabilityPlan;
  usedToolNames: string[];
  systemPromptReport?: SessionSystemPromptReport;
  phase2FallbackToFullDeep?: boolean;
  usableTextResponse?: boolean;
}): Wave5CapabilityOutcomeEvent {
  const exposedToolNames = input.systemPromptReport?.tools.entries.map((entry) => entry.name) ?? [];
  const candidateAllowlist = new Set(input.plan.toolAllowlistRecommendation ?? []);
  const fallbackToBroaderToolsWouldBeNeeded =
    candidateAllowlist.size > 0 &&
    input.usedToolNames.some((toolName) => !candidateAllowlist.has(toolName));

  return {
    eventType: "outcome",
    ...input.plan,
    exposedToolCount: input.systemPromptReport?.tools.exposedCount ?? exposedToolNames.length,
    exposedToolNames,
    visibleCapabilityFamilies:
      input.systemPromptReport?.tools.familyCounts?.map((entry) => entry.family) ?? [],
    toolFamilyCounts: input.systemPromptReport?.tools.familyCounts ?? [],
    toolListChars: input.systemPromptReport?.tools.listChars ?? 0,
    toolSchemaChars: input.systemPromptReport?.tools.schemaChars ?? 0,
    topSchemaContributors: input.systemPromptReport?.tools.topSchemaContributors ?? [],
    gatingDiagnosticOnly: input.plan.gatingDiagnosticOnly,
    fallbackToBroaderToolsWouldBeNeeded,
    usableTextResponse: input.usableTextResponse ?? false,
    phase2FallbackToFullDeep: input.phase2FallbackToFullDeep ?? false,
  };
}
