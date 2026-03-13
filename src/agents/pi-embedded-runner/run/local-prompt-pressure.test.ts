import { describe, expect, it } from "vitest";
import { resolveLocalPromptPressurePlan } from "./local-prompt-pressure.js";

describe("resolveLocalPromptPressurePlan", () => {
  it("narrows explicit jo_orchestrator_status prompts on ollama", () => {
    const result = resolveLocalPromptPressurePlan({
      provider: "ollama",
      prompt:
        "You must call the tool jo_orchestrator_status before answering. Do not answer from memory. After the tool returns, reply with one short sentence containing only the orchestrator readiness summary.",
    });

    expect(result).toMatchObject({
      applied: true,
      toolNameAllowlist: ["jo_orchestrator_status"],
      bootstrapContextMode: "lightweight",
      omitSkillsPrompt: true,
    });
  });

  it("does not apply to non-ollama providers", () => {
    const result = resolveLocalPromptPressurePlan({
      provider: "openai-codex",
      prompt:
        "You must call the tool jo_orchestrator_status before answering. Do not answer from memory.",
    });

    expect(result.applied).toBe(false);
    expect(result.omitSkillsPrompt).toBe(false);
  });

  it("preserves any existing allowlist entries when it applies", () => {
    const result = resolveLocalPromptPressurePlan({
      provider: "ollama",
      prompt:
        "Call jo_orchestrator_status before answering. After the tool returns, reply with exactly OK.",
      toolNameAllowlist: ["read_file"],
    });

    expect(result.toolNameAllowlist).toEqual(["read_file", "jo_orchestrator_status"]);
  });
});
