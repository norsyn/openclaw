import { describe, expect, it } from "vitest";
import { isModelFallbackDisabledForRun } from "./model-fallback-disable.js";

describe("isModelFallbackDisabledForRun", () => {
  it("honors the global disable flag", () => {
    expect(
      isModelFallbackDisabledForRun({
        provider: "openai-codex",
        env: { OPENCLAW_DISABLE_MODEL_FALLBACK: "1" } as NodeJS.ProcessEnv,
      }),
    ).toBe(true);
  });

  it("can disable only ollama fallback", () => {
    expect(
      isModelFallbackDisabledForRun({
        provider: "ollama",
        env: { OPENCLAW_DISABLE_OLLAMA_MODEL_FALLBACK: "true" } as NodeJS.ProcessEnv,
      }),
    ).toBe(true);
    expect(
      isModelFallbackDisabledForRun({
        provider: "openai-codex",
        env: { OPENCLAW_DISABLE_OLLAMA_MODEL_FALLBACK: "true" } as NodeJS.ProcessEnv,
      }),
    ).toBe(false);
  });
});
