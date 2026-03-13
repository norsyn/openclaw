import type { SessionSystemPromptReport } from "../../config/sessions/types.js";
import type { TurnOrigin } from "../types.js";
import {
  hasResponsePolicyContinuityCue,
  hasResponsePolicyOperationalCue,
  normalizeResponsePolicyPrompt,
} from "./response-policy-rules.js";

export type DeepTurnCategory = "memory_deep" | "tool_deep" | "reasoning_deep";

export type DeepTurnConfidence = "high" | "low";

export type DeepTurnRetrievalMode = "required" | "optional" | "skip";

export type DeepTurnToolExposureMode = "full" | "allowlist" | "none";

export type DeepTurnSkillsPromptMode = "full" | "omit";

export type DeepTurnPhase2Mode = "off" | "shadow" | "active";

export type DeepTurnPhase2Reduction = "tool_allowlist_narrowing";

export type DeepTurnExecutionProfile = {
  profileVersion: "wave4-phase1";
  diagnosticsOnly: true;
  prompt: string;
  promptPreview: string;
  normalizedPrompt: string;
  turnOrigin: Exclude<TurnOrigin, "agent_internal_round">;
  category: DeepTurnCategory;
  confidence: DeepTurnConfidence;
  retrievalLikely: boolean;
  retrievalMode: DeepTurnRetrievalMode;
  toolExposureMode: DeepTurnToolExposureMode;
  toolAllowlistRecommendation?: string[];
  bootstrapContextMode: "full" | "lightweight";
  skillsPromptMode: DeepTurnSkillsPromptMode;
  reasonCodes: string[];
  phase2Mode: DeepTurnPhase2Mode;
  phase2CandidateReduction?: DeepTurnPhase2Reduction;
  phase2Applied: boolean;
  phase2ShadowOnly: boolean;
  phase2ReasonCodes: string[];
};

export type DeepTurnPromptContributors = {
  systemPromptChars: number;
  projectContextChars: number;
  skillsPromptChars: number;
  toolListChars: number;
  toolSchemaChars: number;
  bootstrapFileCount?: number;
  bootstrapMissingCount?: number;
  bootstrapTruncatedCount?: number;
  bootstrapRawChars?: number;
  bootstrapInjectedChars?: number;
};

export type DeepTurnDecisionEvent = DeepTurnExecutionProfile & {
  eventType: "decision";
};

export type DeepTurnOutcome = {
  latencyMs: number;
  retrievalRecommended: boolean;
  retrievalExecuted: boolean;
  retrievalLatencyMs?: number;
  retrievalResultCount?: number;
  toolExposureCount: number;
  toolExposedNames: string[];
  toolsUsed: boolean;
  toolUsedCount: number;
  toolUsedNames: string[];
  internalRoundCount: number;
  phase2FallbackToFullDeep: boolean;
  promptContributors?: DeepTurnPromptContributors;
};

export type DeepTurnOutcomeEvent = DeepTurnExecutionProfile &
  DeepTurnOutcome & {
    eventType: "outcome";
  };

const MEMORY_RECALL_PATTERNS = [
  /\bwhat did we decide\b/i,
  /\bwhat did we discuss\b/i,
  /\bwhat happened last time\b/i,
  /\bremember\b/i,
  /\blast time\b/i,
  /\brecap\b/i,
  /\bprevious\b/i,
  /\bearlier\b/i,
  /\bhistory\b/i,
  /\bcontinuity\b/i,
  /\bdecision\b/i,
  /\bdiscussed\b/i,
  /\brecall\b/i,
];

const WAVE4_PHASE2_ALLOWLIST = ["read_file", "grep_search", "file_search", "list_dir"];

const WAVE4_PHASE2_TOOL_DEEP_PROMPTS = new Set([
  "check the repo status",
  "read this file",
  "list the files involved",
]);

export function isReadOnlyToolDeepPrompt(normalizedPrompt: string): boolean {
  return WAVE4_PHASE2_TOOL_DEEP_PROMPTS.has(normalizedPrompt);
}

function withPhase2Defaults(
  profile: Omit<
    DeepTurnExecutionProfile,
    | "phase2Mode"
    | "phase2CandidateReduction"
    | "phase2Applied"
    | "phase2ShadowOnly"
    | "phase2ReasonCodes"
  >,
): DeepTurnExecutionProfile {
  return {
    ...profile,
    phase2Mode: resolveDeepTurnPhase2Mode(),
    phase2CandidateReduction: undefined,
    phase2Applied: false,
    phase2ShadowOnly: false,
    phase2ReasonCodes: [],
  };
}

function hasMemoryRecallCue(normalizedPrompt: string): boolean {
  return MEMORY_RECALL_PATTERNS.some((pattern) => pattern.test(normalizedPrompt));
}

function buildPromptPreview(normalizedPrompt: string): string {
  return normalizedPrompt.slice(0, 80);
}

export function resolveRootTurnOrigin(params: {
  turnOrigin?: Exclude<TurnOrigin, "agent_internal_round">;
  isSubagentSession?: boolean;
}): Exclude<TurnOrigin, "agent_internal_round"> {
  if (params.turnOrigin) {
    return params.turnOrigin;
  }
  return params.isSubagentSession ? "subagent_root" : "user_root";
}

export function resolveDeepTurnPhase2Mode(
  env: NodeJS.ProcessEnv = process.env,
): DeepTurnPhase2Mode {
  const raw = env.OPENCLAW_WAVE4_PHASE2_MODE?.trim().toLowerCase();
  if (raw === "off" || raw === "active" || raw === "shadow") {
    return raw;
  }
  return "shadow";
}

export type DeepTurnPhase2Plan = {
  mode: DeepTurnPhase2Mode;
  candidateReduction?: DeepTurnPhase2Reduction;
  toolAllowlist?: string[];
  applied: boolean;
  shadowOnly: boolean;
  reasonCodes: string[];
};

export function resolveDeepTurnPhase2Plan(input: {
  profile: Pick<
    DeepTurnExecutionProfile,
    "category" | "confidence" | "retrievalLikely" | "retrievalMode" | "normalizedPrompt"
  >;
  turnOrigin: TurnOrigin;
  hasAttachments: boolean;
  hasProtectedDeepBlocker: boolean;
  env?: NodeJS.ProcessEnv;
}): DeepTurnPhase2Plan {
  const mode = resolveDeepTurnPhase2Mode(input.env);
  if (mode === "off") {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_mode_off"],
    };
  }
  if (input.profile.category !== "tool_deep") {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_not_tool_deep"],
    };
  }
  if (input.profile.confidence !== "high") {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_low_confidence"],
    };
  }
  if (!isReadOnlyToolDeepPrompt(input.profile.normalizedPrompt)) {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_prompt_out_of_scope"],
    };
  }
  if (input.profile.retrievalLikely || input.profile.retrievalMode !== "skip") {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_retrieval_not_skippable"],
    };
  }
  if (input.turnOrigin === "subagent_root" || input.turnOrigin === "agent_internal_round") {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_non_user_root_turn"],
    };
  }
  if (input.hasAttachments) {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_has_attachments"],
    };
  }
  if (input.hasProtectedDeepBlocker) {
    return {
      mode,
      applied: false,
      shadowOnly: false,
      reasonCodes: ["phase2_protected_deep_blocker"],
    };
  }
  return {
    mode,
    candidateReduction: "tool_allowlist_narrowing",
    toolAllowlist: [...WAVE4_PHASE2_ALLOWLIST],
    applied: mode === "active",
    shadowOnly: mode === "shadow",
    reasonCodes: [
      "phase2_tool_deep_candidate",
      "phase2_read_only_inspection_scope",
      mode === "active" ? "phase2_active_mode" : "phase2_shadow_mode",
    ],
  };
}

export function applyDeepTurnPhase2Plan(input: {
  profile: DeepTurnExecutionProfile;
  plan: DeepTurnPhase2Plan;
}): DeepTurnExecutionProfile {
  return {
    ...input.profile,
    toolExposureMode:
      input.plan.applied && input.plan.toolAllowlist?.length
        ? "allowlist"
        : input.profile.toolExposureMode,
    toolAllowlistRecommendation: input.plan.toolAllowlist?.length
      ? [...input.plan.toolAllowlist]
      : input.profile.toolAllowlistRecommendation,
    phase2Mode: input.plan.mode,
    phase2CandidateReduction: input.plan.candidateReduction,
    phase2Applied: input.plan.applied,
    phase2ShadowOnly: input.plan.shadowOnly,
    phase2ReasonCodes: [...input.plan.reasonCodes],
  };
}

export function resolveDeepTurnExecutionProfile(input: {
  prompt: string;
  turnOrigin: Exclude<TurnOrigin, "agent_internal_round">;
}): DeepTurnExecutionProfile {
  const normalizedPrompt = normalizeResponsePolicyPrompt(input.prompt);
  const memoryCue =
    hasMemoryRecallCue(normalizedPrompt) || hasResponsePolicyContinuityCue(normalizedPrompt);
  const toolCue = hasResponsePolicyOperationalCue(normalizedPrompt);

  if (toolCue) {
    return withPhase2Defaults({
      profileVersion: "wave4-phase1",
      diagnosticsOnly: true,
      prompt: input.prompt,
      promptPreview: buildPromptPreview(normalizedPrompt),
      normalizedPrompt,
      turnOrigin: input.turnOrigin,
      category: "tool_deep",
      confidence: "high",
      retrievalLikely: memoryCue,
      retrievalMode: memoryCue ? "optional" : "skip",
      toolExposureMode: "full",
      bootstrapContextMode: "full",
      skillsPromptMode: "full",
      reasonCodes: memoryCue
        ? ["operational_intent_detected", "continuity_detected", "retrieval_likely"]
        : ["operational_intent_detected"],
    });
  }

  if (memoryCue) {
    return withPhase2Defaults({
      profileVersion: "wave4-phase1",
      diagnosticsOnly: true,
      prompt: input.prompt,
      promptPreview: buildPromptPreview(normalizedPrompt),
      normalizedPrompt,
      turnOrigin: input.turnOrigin,
      category: "memory_deep",
      confidence: "high",
      retrievalLikely: true,
      retrievalMode: "required",
      toolExposureMode: "none",
      bootstrapContextMode: "full",
      skillsPromptMode: "full",
      reasonCodes: ["continuity_detected", "memory_recall_detected"],
    });
  }

  return withPhase2Defaults({
    profileVersion: "wave4-phase1",
    diagnosticsOnly: true,
    prompt: input.prompt,
    promptPreview: buildPromptPreview(normalizedPrompt),
    normalizedPrompt,
    turnOrigin: input.turnOrigin,
    category: "reasoning_deep",
    confidence: "low",
    retrievalLikely: false,
    retrievalMode: "optional",
    toolExposureMode: "none",
    bootstrapContextMode: "full",
    skillsPromptMode: "full",
    reasonCodes: ["ambiguous_deep_fallback"],
  });
}

export function buildDeepTurnPromptContributors(
  report: SessionSystemPromptReport | undefined,
): DeepTurnPromptContributors | undefined {
  if (!report) {
    return undefined;
  }
  return {
    systemPromptChars: report.systemPrompt.chars,
    projectContextChars: report.systemPrompt.projectContextChars,
    skillsPromptChars: report.skills.promptChars,
    toolListChars: report.tools.listChars,
    toolSchemaChars: report.tools.schemaChars,
    bootstrapFileCount: report.bootstrap?.fileCount,
    bootstrapMissingCount: report.bootstrap?.missingCount,
    bootstrapTruncatedCount: report.bootstrap?.truncatedCount,
    bootstrapRawChars: report.bootstrap?.rawChars,
    bootstrapInjectedChars: report.bootstrap?.injectedChars,
  };
}

export function buildDeepTurnDecisionEvent(
  profile: DeepTurnExecutionProfile,
): DeepTurnDecisionEvent {
  return {
    eventType: "decision",
    ...profile,
  };
}

export function buildDeepTurnOutcomeEvent(input: {
  profile: DeepTurnExecutionProfile;
  outcome: DeepTurnOutcome;
}): DeepTurnOutcomeEvent {
  return {
    eventType: "outcome",
    ...input.profile,
    ...input.outcome,
  };
}
