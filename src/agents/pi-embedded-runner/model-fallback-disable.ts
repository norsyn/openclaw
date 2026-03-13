function isEnabled(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function normalizeProvider(provider?: string): string {
  return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}

export function isModelFallbackDisabledForRun(params: {
  provider?: string;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = params.env ?? process.env;
  if (isEnabled(env.OPENCLAW_DISABLE_MODEL_FALLBACK)) {
    return true;
  }
  return (
    normalizeProvider(params.provider) === "ollama" &&
    isEnabled(env.OPENCLAW_DISABLE_OLLAMA_MODEL_FALLBACK)
  );
}
