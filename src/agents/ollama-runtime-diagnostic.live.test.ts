import path from "node:path";
import { describe, expect, it } from "vitest";
import { runOllamaRuntimeDiagnostic } from "../diagnostics/ollama-runtime-diagnostic.js";

const shouldRun =
  process.env.OPENCLAW_LIVE_TEST === "1" && process.env.OPENCLAW_RUNTIME_DIAGNOSTIC === "1";

describe.skipIf(!shouldRun)("ollama runtime diagnostic", () => {
  it("captures direct and runtime latency for a trivial prompt", async () => {
    const workspaceDir = path.resolve(process.cwd(), "../Jo");
    const result = await runOllamaRuntimeDiagnostic({
      prompt: "hi",
      workspaceDir,
    });

    expect(result.directProbe.provider).toBe("ollama");
    expect(result.directProbe.model.length).toBeGreaterThan(0);
    expect(result.directProbe.completionLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.runtimeTurn.turnLatencyBreakdown.policyResolutionMs).toBeGreaterThanOrEqual(0);
    expect(result.runtimeTurn.streaming.ollamaStreamingEnabled).toBe(true);
    expect(result.runtimeTurn.replyCountByKind.final).toBeGreaterThanOrEqual(1);
  }, 180_000);
});
