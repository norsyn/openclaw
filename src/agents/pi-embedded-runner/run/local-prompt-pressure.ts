import type { EmbeddedTurnProfile } from "./params.js";

export type LocalPromptPressurePlan = {
  applied: boolean;
  toolNameAllowlist?: string[];
  bootstrapContextMode?: "full" | "lightweight";
  omitSkillsPrompt: boolean;
  reasonCodes: string[];
};

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeProvider(provider?: string): string {
  return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}

function isExplicitJoOrchestratorStatusPrompt(normalizedPrompt: string): boolean {
  return (
    normalizedPrompt.includes("jo_orchestrator_status") &&
    (normalizedPrompt.includes("before answering") ||
      normalizedPrompt.includes("do not answer from memory") ||
      normalizedPrompt.includes("after the tool returns"))
  );
}

export function resolveLocalPromptPressurePlan(params: {
  provider?: string;
  prompt: string;
  turnProfile?: EmbeddedTurnProfile;
  toolNameAllowlist?: string[];
}): LocalPromptPressurePlan {
  if (params.turnProfile === "fast") {
    return {
      applied: false,
      omitSkillsPrompt: false,
      reasonCodes: ["fast_turn_profile"],
    };
  }

  if (normalizeProvider(params.provider) !== "ollama") {
    return {
      applied: false,
      omitSkillsPrompt: false,
      reasonCodes: ["non_ollama_provider"],
    };
  }

  const normalizedPrompt = normalizePrompt(params.prompt);
  if (!isExplicitJoOrchestratorStatusPrompt(normalizedPrompt)) {
    return {
      applied: false,
      omitSkillsPrompt: false,
      reasonCodes: ["prompt_not_explicit_single_tool_status"],
    };
  }

  const allowlist = Array.from(
    new Set([...(params.toolNameAllowlist ?? []), "jo_orchestrator_status"]),
  );

  return {
    applied: true,
    toolNameAllowlist: allowlist,
    bootstrapContextMode: "lightweight",
    omitSkillsPrompt: true,
    reasonCodes: [
      "ollama_single_tool_prompt",
      "allowlist_jo_orchestrator_status",
      "lightweight_bootstrap_context",
      "omit_skills_prompt",
    ],
  };
}
