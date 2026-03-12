import { beforeEach, describe, expect, it, vi } from "vitest";
import { onAgentEvent } from "../../infra/agent-events.js";
import { withStateDirEnv } from "../../test-helpers/state-dir-env.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

type EmbeddedRunParams = {
  onAgentEvent?: (evt: { stream?: string; data?: Record<string, unknown> }) => void;
};

type MockRunSpec = {
  finalText?: string;
  toolName?: string;
  retrievalResultCount?: number;
  retrievalDurationMs?: number;
  internalRoundCount?: number;
  toolExposureNames: string[];
  toolListChars: number;
  toolSchemaChars: number;
};

const state = vi.hoisted(() => ({
  runEmbeddedPiAgentMock: vi.fn(),
  runCliAgentMock: vi.fn(),
  runWithModelFallbackMock: vi.fn(),
}));

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: (params: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => state.runWithModelFallbackMock(params),
}));

vi.mock("../../agents/pi-embedded.js", async () => {
  const actual = await vi.importActual<typeof import("../../agents/pi-embedded.js")>(
    "../../agents/pi-embedded.js",
  );
  return {
    ...actual,
    queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
    runEmbeddedPiAgent: (params: unknown) => state.runEmbeddedPiAgentMock(params),
  };
});

vi.mock("../../agents/cli-runner.js", async () => {
  const actual = await vi.importActual<typeof import("../../agents/cli-runner.js")>(
    "../../agents/cli-runner.js",
  );
  return {
    ...actual,
    runCliAgent: (params: unknown) => state.runCliAgentMock(params),
  };
});

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

beforeEach(() => {
  delete process.env.OPENCLAW_RESPONSE_POLICY_MODE;
  delete process.env.OPENCLAW_RESPONSE_POLICY_RESET;
  delete process.env.OPENCLAW_WAVE4_PHASE2_MODE;
  state.runEmbeddedPiAgentMock.mockReset();
  state.runCliAgentMock.mockReset();
  state.runWithModelFallbackMock.mockReset();
  state.runWithModelFallbackMock.mockImplementation(
    async ({
      provider,
      model,
      run,
    }: {
      provider: string;
      model: string;
      run: typeof Function;
    }) => ({
      result: await Promise.resolve(run(provider, model)),
      provider,
      model,
      attempts: [],
    }),
  );
});

function createPolicyRun(params: { commandBody: string; runId: string; sessionKey?: string }) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "webchat",
    OriginatingTo: "session:1",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const followupRun = {
    prompt: params.commandBody,
    summaryLine: params.commandBody,
    enqueuedAt: Date.now(),
    run: {
      sessionId: "session",
      sessionKey: params.sessionKey ?? "main",
      messageProvider: "webchat",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;

  return runReplyAgent({
    commandBody: params.commandBody,
    followupRun,
    queueKey: params.sessionKey ?? "main",
    resolvedQueue,
    shouldSteer: false,
    shouldFollowup: false,
    isActive: false,
    isStreaming: false,
    opts: { runId: params.runId },
    typing,
    sessionKey: params.sessionKey ?? "main",
    sessionCtx,
    defaultModel: "anthropic/claude-opus-4-5",
    resolvedVerboseLevel: "off",
    isNewSession: false,
    blockStreamingEnabled: false,
    resolvedBlockStreamingBreak: "message_end",
    shouldInjectGroupIntro: false,
    typingMode: "instant",
  });
}

function buildSystemPromptReport(params: {
  toolExposureNames: string[];
  toolListChars: number;
  toolSchemaChars: number;
}) {
  return {
    source: "run",
    generatedAt: Date.now(),
    systemPrompt: { chars: 200, projectContextChars: 80, nonProjectContextChars: 120 },
    injectedWorkspaceFiles: [],
    bootstrap: {
      fileCount: 1,
      missingCount: 0,
      truncatedCount: 0,
      rawChars: 50,
      injectedChars: 50,
    },
    skills: { promptChars: 20, entries: [] },
    tools: {
      listChars: params.toolListChars,
      schemaChars: params.toolSchemaChars,
      exposedCount: params.toolExposureNames.length,
      entries: params.toolExposureNames.map((name) => ({
        name,
        summaryChars: 10,
        schemaChars: 20,
      })),
    },
  };
}

async function runScenario(params: {
  prompt: string;
  mode: "shadow" | "active";
  mockRuns: MockRunSpec[];
  sessionKey?: string;
}) {
  process.env.OPENCLAW_WAVE4_PHASE2_MODE = params.mode;
  const runId = `wave4-phase3-${params.mode}-${params.prompt.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const policyEvents: Array<Record<string, unknown>> = [];
  const wave4Events: Array<Record<string, unknown>> = [];
  const stop = onAgentEvent((evt) => {
    if (evt.runId !== runId) {
      return;
    }
    if (evt.stream === "policy") {
      policyEvents.push(evt.data);
      return;
    }
    if (evt.stream === "wave4") {
      wave4Events.push(evt.data);
    }
  });

  for (const spec of params.mockRuns) {
    state.runEmbeddedPiAgentMock.mockImplementationOnce(async (runParams: EmbeddedRunParams) => {
      if (spec.toolName) {
        runParams.onAgentEvent?.({ stream: "tool", data: { phase: "start", name: spec.toolName } });
      }
      if (spec.toolName === "jo_memory_search") {
        runParams.onAgentEvent?.({
          stream: "tool",
          data: {
            phase: "result",
            name: "jo_memory_search",
            durationMs: spec.retrievalDurationMs ?? 42,
            resultCount: spec.retrievalResultCount ?? 1,
          },
        });
      }
      if ((spec.internalRoundCount ?? 0) > 0) {
        for (let roundIndex = 1; roundIndex <= (spec.internalRoundCount ?? 0); roundIndex += 1) {
          runParams.onAgentEvent?.({
            stream: "wave4",
            data: { eventType: "internal_round", turnOrigin: "agent_internal_round", roundIndex },
          });
        }
      }
      return {
        payloads: spec.finalText ? [{ text: spec.finalText }] : [],
        meta: {
          systemPromptReport: buildSystemPromptReport({
            toolExposureNames: spec.toolExposureNames,
            toolListChars: spec.toolListChars,
            toolSchemaChars: spec.toolSchemaChars,
          }),
        },
      };
    });
  }

  const result = await withStateDirEnv("wave4-phase3-", async () =>
    createPolicyRun({ commandBody: params.prompt, runId, sessionKey: params.sessionKey }),
  );

  stop();

  return {
    result,
    policyDecision: policyEvents.find((event) => event.eventType === "decision") ?? {},
    policyOutcome: policyEvents.find((event) => event.eventType === "outcome") ?? {},
    wave4Decision: wave4Events.find((event) => event.eventType === "decision") ?? {},
    wave4Outcome: wave4Events.find((event) => event.eventType === "outcome") ?? {},
    runCalls: state.runEmbeddedPiAgentMock.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    ),
  };
}

const FULL_DEEP_TOOLS = ["read_file", "grep_search", "file_search", "list_dir", "exec", "process"];
const NARROW_TOOLS = ["read_file", "grep_search", "file_search", "list_dir"];

describe("Wave 4 Phase 3 validation", () => {
  it.each([
    {
      prompt: "check the repo status",
      finalText: "Repository status summary is available.",
      toolName: "read_file",
    },
    {
      prompt: "read this file",
      finalText: "File contents are summarized.",
      toolName: "read_file",
    },
    {
      prompt: "list the files involved",
      finalText: "The involved files are listed.",
      toolName: "list_dir",
    },
  ])(
    "keeps the shipped prompt scope shadow-only for $prompt",
    async ({ prompt, finalText, toolName }) => {
      const scenario = await runScenario({
        prompt,
        mode: "shadow",
        mockRuns: [
          {
            finalText,
            toolName,
            toolExposureNames: FULL_DEEP_TOOLS,
            toolListChars: 100,
            toolSchemaChars: 400,
          },
        ],
      });

      expect(scenario.result).toMatchObject({ text: finalText });
      expect(scenario.runCalls).toHaveLength(1);
      expect(scenario.runCalls[0]).toMatchObject({
        toolNameAllowlist: undefined,
        disableTools: false,
      });
      expect(scenario.policyDecision).toMatchObject({
        selectedProfile: "deep",
        overrideApplied: false,
      });
      expect(scenario.wave4Decision).toMatchObject({
        category: "tool_deep",
        confidence: "high",
        phase2Mode: "shadow",
        phase2CandidateReduction: "tool_allowlist_narrowing",
        phase2Applied: false,
        phase2ShadowOnly: true,
        toolAllowlistRecommendation: NARROW_TOOLS,
      });
      expect(scenario.wave4Outcome).toMatchObject({
        category: "tool_deep",
        toolExposureCount: 6,
        toolExposedNames: FULL_DEEP_TOOLS,
        toolUsedCount: 1,
        toolUsedNames: [toolName],
        phase2FallbackToFullDeep: false,
      });
      expect(typeof scenario.wave4Outcome.latencyMs).toBe("number");
      expect((scenario.wave4Outcome.latencyMs as number) >= 0).toBe(true);
    },
  );

  it.each([
    {
      prompt: "check the repo status",
      finalText: "Repository status summary is available.",
      toolName: "read_file",
    },
    {
      prompt: "read this file",
      finalText: "File contents are summarized.",
      toolName: "read_file",
    },
    {
      prompt: "list the files involved",
      finalText: "The involved files are listed.",
      toolName: "list_dir",
    },
  ])(
    "applies narrowed active exposure for shipped prompt scope $prompt",
    async ({ prompt, finalText, toolName }) => {
      const scenario = await runScenario({
        prompt,
        mode: "active",
        mockRuns: [
          {
            finalText,
            toolName,
            toolExposureNames: NARROW_TOOLS,
            toolListChars: 40,
            toolSchemaChars: 80,
          },
        ],
      });

      expect(scenario.result).toMatchObject({ text: finalText });
      expect(scenario.runCalls).toHaveLength(1);
      expect(scenario.runCalls[0]).toMatchObject({
        toolNameAllowlist: NARROW_TOOLS,
        disableTools: false,
      });
      expect(scenario.policyDecision).toMatchObject({
        selectedProfile: "deep",
        overrideApplied: false,
      });
      expect(scenario.wave4Decision).toMatchObject({
        category: "tool_deep",
        confidence: "high",
        phase2Mode: "active",
        phase2CandidateReduction: "tool_allowlist_narrowing",
        phase2Applied: true,
        phase2ShadowOnly: false,
      });
      expect(scenario.wave4Outcome).toMatchObject({
        category: "tool_deep",
        toolExposureCount: 4,
        toolExposedNames: NARROW_TOOLS,
        toolUsedCount: 1,
        toolUsedNames: [toolName],
        phase2FallbackToFullDeep: false,
      });
      expect(typeof scenario.wave4Outcome.latencyMs).toBe("number");
      expect((scenario.wave4Outcome.latencyMs as number) >= 0).toBe(true);
    },
  );

  it("falls back to the full deep tool set when the narrowed run returns no usable reply", async () => {
    const scenario = await runScenario({
      prompt: "list the files involved",
      mode: "active",
      mockRuns: [
        {
          toolExposureNames: NARROW_TOOLS,
          toolListChars: 40,
          toolSchemaChars: 80,
        },
        {
          finalText: "The involved files are listed after retry.",
          toolName: "list_dir",
          toolExposureNames: FULL_DEEP_TOOLS,
          toolListChars: 100,
          toolSchemaChars: 400,
        },
      ],
    });

    expect(scenario.result).toMatchObject({ text: "The involved files are listed after retry." });
    expect(scenario.runCalls).toHaveLength(2);
    expect(scenario.runCalls[0]).toMatchObject({ toolNameAllowlist: NARROW_TOOLS });
    expect(scenario.runCalls[1]).toMatchObject({ toolNameAllowlist: undefined });
    expect(scenario.wave4Outcome).toMatchObject({
      category: "tool_deep",
      toolExposureCount: 6,
      toolExposedNames: FULL_DEEP_TOOLS,
      toolUsedCount: 1,
      toolUsedNames: ["list_dir"],
      phase2FallbackToFullDeep: true,
    });
  });

  it.each([
    {
      prompt: "inspect the server logs",
      finalText: "Server log inspection summary.",
      expectedCategory: "tool_deep",
      expectedReason: "phase2_prompt_out_of_scope",
      toolName: "grep_search",
      retrievalUsed: false,
    },
    {
      prompt: "show the failing test output",
      finalText: "Failing test output summary.",
      expectedCategory: "tool_deep",
      expectedReason: "phase2_prompt_out_of_scope",
      toolName: "read_file",
      retrievalUsed: false,
    },
    {
      prompt: "what did we decide last time about Wave 1",
      finalText: "Wave 1 decision summary.",
      expectedCategory: "memory_deep",
      expectedReason: "phase2_not_tool_deep",
      toolName: "jo_memory_search",
      retrievalUsed: true,
    },
    {
      prompt: "explain the architectural tradeoffs here",
      finalText: "Architectural tradeoff summary.",
      expectedCategory: "reasoning_deep",
      expectedReason: "phase2_not_tool_deep",
      toolName: undefined,
      retrievalUsed: false,
    },
  ])(
    "keeps out-of-scope prompt on the full deep path for $prompt",
    async ({ prompt, finalText, expectedCategory, expectedReason, toolName, retrievalUsed }) => {
      const scenario = await runScenario({
        prompt,
        mode: "active",
        mockRuns: [
          {
            finalText,
            toolName,
            retrievalDurationMs: retrievalUsed ? 42 : undefined,
            retrievalResultCount: retrievalUsed ? 2 : undefined,
            toolExposureNames: FULL_DEEP_TOOLS,
            toolListChars: 100,
            toolSchemaChars: 400,
          },
        ],
      });

      expect(scenario.result).toMatchObject({ text: finalText });
      expect(scenario.runCalls).toHaveLength(1);
      expect(scenario.runCalls[0]).toMatchObject({
        toolNameAllowlist: undefined,
        disableTools: false,
      });
      expect(scenario.policyDecision).toMatchObject({
        selectedProfile: "deep",
        overrideApplied: false,
      });
      expect(scenario.wave4Decision).toMatchObject({
        category: expectedCategory,
        phase2Mode: "active",
        phase2Applied: false,
        phase2ReasonCodes: [expectedReason],
      });
      expect(scenario.wave4Outcome).toMatchObject({
        toolExposureCount: 6,
        toolExposedNames: FULL_DEEP_TOOLS,
        phase2FallbackToFullDeep: false,
        retrievalExecuted: retrievalUsed,
      });
      expect(scenario.wave4Outcome.toolUsedCount).toBe(toolName ? 1 : 0);
      expect(scenario.wave4Outcome.toolUsedNames).toEqual(toolName ? [toolName] : []);
    },
  );

  it("keeps subagent-root turns outside the active narrowing path", async () => {
    const scenario = await runScenario({
      prompt: "check the repo status",
      mode: "active",
      sessionKey: "agent:main:subagent:child",
      mockRuns: [
        {
          finalText: "Subagent repository status summary.",
          toolName: "read_file",
          toolExposureNames: FULL_DEEP_TOOLS,
          toolListChars: 100,
          toolSchemaChars: 400,
          internalRoundCount: 1,
        },
      ],
    });

    expect(scenario.result).toMatchObject({ text: "Subagent repository status summary." });
    expect(scenario.runCalls).toHaveLength(1);
    expect(scenario.runCalls[0]).toMatchObject({
      toolNameAllowlist: undefined,
      disableTools: false,
    });
    expect(scenario.policyDecision).toMatchObject({
      selectedProfile: "deep",
      overrideApplied: false,
    });
    expect(scenario.wave4Decision).toMatchObject({
      turnOrigin: "subagent_root",
      category: "tool_deep",
      phase2Applied: false,
      phase2ReasonCodes: ["phase2_non_user_root_turn"],
    });
    expect(scenario.wave4Outcome).toMatchObject({
      internalRoundCount: 1,
      toolExposureCount: 6,
      toolExposedNames: FULL_DEEP_TOOLS,
      phase2FallbackToFullDeep: false,
    });
  });
});
