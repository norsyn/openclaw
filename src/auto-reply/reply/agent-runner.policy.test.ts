import { beforeEach, describe, expect, it, vi } from "vitest";
import { onAgentEvent } from "../../infra/agent-events.js";
import { withStateDirEnv } from "../../test-helpers/state-dir-env.js";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import {
  createEmptyResponsePolicyStateStore,
  writeResponsePolicyState,
} from "./response-policy-state.js";
import { createMockTypingController } from "./test-helpers.js";

type EmbeddedRunParams = {
  onAgentEvent?: (evt: { stream?: string; data?: Record<string, unknown> }) => void;
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

describe("runReplyAgent Wave 3 policy logging", () => {
  it("emits decision and outcome policy events for exact direct replies without changing routing", async () => {
    const runId = "policy-direct-run";
    const policyEvents: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "policy") {
        return;
      }
      policyEvents.push(evt.data);
    });

    const result = await createPolicyRun({ commandBody: "hi", runId });

    stop();

    expect(state.runEmbeddedPiAgentMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ text: "Hi! How can I help?" });
    expect(policyEvents).toHaveLength(2);
    expect(policyEvents[0]).toMatchObject({
      eventType: "decision",
      classifierProfile: "fast",
      selectedProfile: "direct",
      overrideApplied: false,
      prompt: "hi",
    });
    expect(policyEvents[1]).toMatchObject({
      eventType: "outcome",
      classifierProfile: "fast",
      selectedProfile: "direct",
      retrievalUsed: false,
      toolsUsed: false,
      fallbackTriggered: false,
      responseLength: "Hi! How can I help?".length,
    });
  });

  it("emits policy events for tool-backed deep prompts without changing deep execution", async () => {
    const runId = "policy-deep-run";
    const policyEvents: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "policy") {
        return;
      }
      policyEvents.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockImplementationOnce(async (params: EmbeddedRunParams) => {
      params.onAgentEvent?.({ stream: "tool", data: { phase: "start", name: "read_file" } });
      return {
        payloads: [{ text: "repo status summary" }],
        meta: {},
      };
    });

    const result = await createPolicyRun({ commandBody: "check the repo status", runId });

    stop();

    expect(state.runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      turnProfile: "default",
      disableTools: false,
      toolNameAllowlist: undefined,
    });
    expect(result).toMatchObject({ text: "repo status summary" });
    expect(policyEvents).toHaveLength(2);
    expect(policyEvents[0]).toMatchObject({
      eventType: "decision",
      classifierProfile: "deep",
      selectedProfile: "deep",
      overrideApplied: false,
      prompt: "check the repo status",
    });
    expect(policyEvents[1]).toMatchObject({
      eventType: "outcome",
      classifierProfile: "deep",
      selectedProfile: "deep",
      retrievalUsed: false,
      toolsUsed: true,
      toolNames: ["read_file"],
      fallbackTriggered: false,
      responseLength: "repo status summary".length,
    });
  });

  it("records JoMemory retrieval usage from existing tool events without altering the reply", async () => {
    const runId = "policy-memory-run";
    const policyEvents: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "policy") {
        return;
      }
      policyEvents.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockImplementationOnce(async (params: EmbeddedRunParams) => {
      params.onAgentEvent?.({
        stream: "tool",
        data: { phase: "start", name: "jo_memory_search" },
      });
      return {
        payloads: [{ text: "memory-backed answer" }],
        meta: {},
      };
    });

    const result = await createPolicyRun({
      commandBody: "what did we decide last time?",
      runId,
    });

    stop();

    expect(result).toMatchObject({ text: "memory-backed answer" });
    expect(policyEvents[1]).toMatchObject({
      eventType: "outcome",
      retrievalUsed: true,
      toolsUsed: true,
      toolNames: ["jo_memory_search"],
      responseLength: "memory-backed answer".length,
    });
  });

  it("emits Wave 4 diagnostics only for deep turns and keeps fast turns untouched", async () => {
    const runId = "wave4-fast-turn-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });

    const result = await createPolicyRun({ commandBody: "hi", runId });

    stop();

    expect(result).toMatchObject({ text: "Hi! How can I help?" });
    expect(wave4Events).toEqual([]);
  });

  it("classifies memory-deep turns and attaches prompt/retrieval diagnostics without changing routing", async () => {
    const runId = "wave4-memory-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockImplementationOnce(async (params: EmbeddedRunParams) => {
      params.onAgentEvent?.({
        stream: "tool",
        data: { phase: "start", name: "jo_memory_search" },
      });
      params.onAgentEvent?.({
        stream: "tool",
        data: { phase: "result", name: "jo_memory_search", durationMs: 42, resultCount: 2 },
      });
      params.onAgentEvent?.({
        stream: "wave4",
        data: { eventType: "internal_round", turnOrigin: "agent_internal_round", roundIndex: 1 },
      });
      return {
        payloads: [{ text: "memory-backed answer" }],
        meta: {
          systemPromptReport: {
            source: "run",
            generatedAt: Date.now(),
            systemPrompt: {
              chars: 100,
              projectContextChars: 40,
              nonProjectContextChars: 60,
            },
            injectedWorkspaceFiles: [],
            bootstrap: {
              fileCount: 1,
              missingCount: 0,
              truncatedCount: 0,
              rawChars: 50,
              injectedChars: 50,
            },
            skills: { promptChars: 12, entries: [] },
            tools: {
              listChars: 10,
              schemaChars: 20,
              exposedCount: 1,
              entries: [{ name: "jo_memory_search", summaryChars: 5, schemaChars: 20 }],
            },
          },
        },
      };
    });

    const result = await createPolicyRun({
      commandBody: "what did we decide last time?",
      runId,
    });

    stop();

    expect(result).toMatchObject({ text: "memory-backed answer" });
    expect(wave4Events).toHaveLength(2);
    expect(wave4Events[0]).toMatchObject({
      eventType: "decision",
      category: "memory_deep",
      retrievalMode: "required",
      turnOrigin: "user_root",
      diagnosticsOnly: true,
    });
    expect(wave4Events[1]).toMatchObject({
      eventType: "outcome",
      category: "memory_deep",
      retrievalRecommended: true,
      retrievalExecuted: true,
      retrievalLatencyMs: 42,
      retrievalResultCount: 2,
      toolExposureCount: 1,
      toolExposedNames: ["jo_memory_search"],
      toolUsedNames: ["jo_memory_search"],
      internalRoundCount: 1,
      promptContributors: {
        systemPromptChars: 100,
        projectContextChars: 40,
        skillsPromptChars: 12,
        toolListChars: 10,
        toolSchemaChars: 20,
        bootstrapFileCount: 1,
        bootstrapMissingCount: 0,
        bootstrapTruncatedCount: 0,
        bootstrapRawChars: 50,
        bootstrapInjectedChars: 50,
      },
    });
  });

  it("classifies operational prompts as tool_deep and ambiguous prompts as reasoning_deep", async () => {
    const toolRunId = "wave4-tool-run";
    const reasoningRunId = "wave4-reasoning-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.stream !== "wave4") {
        return;
      }
      if (evt.runId === toolRunId || evt.runId === reasoningRunId) {
        wave4Events.push({ ...evt.data, runId: evt.runId });
      }
    });

    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "tool-backed answer" }],
      meta: { systemPromptReport: undefined },
    });
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "reasoning answer" }],
      meta: { systemPromptReport: undefined },
    });

    await createPolicyRun({ commandBody: "check the repo status", runId: toolRunId });
    await createPolicyRun({
      commandBody: "explain the architectural tradeoffs here",
      runId: reasoningRunId,
    });

    stop();

    expect(wave4Events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: toolRunId,
          eventType: "decision",
          category: "tool_deep",
          retrievalMode: "skip",
        }),
        expect.objectContaining({
          runId: reasoningRunId,
          eventType: "decision",
          category: "reasoning_deep",
          confidence: "low",
          reasonCodes: ["ambiguous_deep_fallback"],
        }),
      ]),
    );
  });

  it("tags deep diagnostics with subagent_root for subagent sessions", async () => {
    const runId = "wave4-subagent-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "subagent answer" }],
      meta: {},
    });

    await createPolicyRun({
      commandBody: "what did we decide last time?",
      runId,
      sessionKey: "agent:main:subagent:child",
    });

    stop();

    expect(wave4Events[0]).toMatchObject({
      eventType: "decision",
      turnOrigin: "subagent_root",
    });
  });

  it("computes but does not apply phase 2 narrowing in shadow mode", async () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "shadow";
    const runId = "wave4-phase2-shadow-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "repo inspection answer" }],
      meta: {
        systemPromptReport: {
          source: "run",
          generatedAt: Date.now(),
          systemPrompt: { chars: 200, projectContextChars: 80, nonProjectContextChars: 120 },
          injectedWorkspaceFiles: [],
          bootstrap: {
            fileCount: 1,
            missingCount: 0,
            truncatedCount: 0,
            rawChars: 75,
            injectedChars: 75,
          },
          skills: { promptChars: 20, entries: [] },
          tools: {
            listChars: 100,
            schemaChars: 400,
            exposedCount: 6,
            entries: [
              { name: "read_file", summaryChars: 10, schemaChars: 20 },
              { name: "grep_search", summaryChars: 10, schemaChars: 20 },
              { name: "file_search", summaryChars: 10, schemaChars: 20 },
              { name: "list_dir", summaryChars: 10, schemaChars: 20 },
              { name: "exec", summaryChars: 10, schemaChars: 20 },
              { name: "process", summaryChars: 10, schemaChars: 20 },
            ],
          },
        },
      },
    });

    const result = await createPolicyRun({ commandBody: "check the repo status", runId });

    stop();

    expect(result).toMatchObject({ text: "repo inspection answer" });
    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      toolNameAllowlist: undefined,
      disableTools: false,
    });
    expect(wave4Events[0]).toMatchObject({
      eventType: "decision",
      category: "tool_deep",
      phase2Mode: "shadow",
      phase2CandidateReduction: "tool_allowlist_narrowing",
      phase2Applied: false,
      phase2ShadowOnly: true,
      toolAllowlistRecommendation: ["read_file", "grep_search", "file_search", "list_dir"],
    });
  });

  it("applies phase 2 narrowing only for the gated read-only tool-deep subset", async () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const runId = "wave4-phase2-active-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockImplementationOnce(async (params: EmbeddedRunParams) => {
      params.onAgentEvent?.({ stream: "tool", data: { phase: "start", name: "read_file" } });
      return {
        payloads: [{ text: "file answer" }],
        meta: {
          systemPromptReport: {
            source: "run",
            generatedAt: Date.now(),
            systemPrompt: { chars: 150, projectContextChars: 60, nonProjectContextChars: 90 },
            injectedWorkspaceFiles: [],
            bootstrap: {
              fileCount: 1,
              missingCount: 0,
              truncatedCount: 0,
              rawChars: 50,
              injectedChars: 50,
            },
            skills: { promptChars: 18, entries: [] },
            tools: {
              listChars: 40,
              schemaChars: 80,
              exposedCount: 4,
              entries: [
                { name: "read_file", summaryChars: 10, schemaChars: 20 },
                { name: "grep_search", summaryChars: 10, schemaChars: 20 },
                { name: "file_search", summaryChars: 10, schemaChars: 20 },
                { name: "list_dir", summaryChars: 10, schemaChars: 20 },
              ],
            },
          },
        },
      };
    });

    const result = await createPolicyRun({ commandBody: "read this file", runId });

    stop();

    expect(result).toMatchObject({ text: "file answer" });
    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      toolNameAllowlist: ["read_file", "grep_search", "file_search", "list_dir"],
      disableTools: false,
    });
    expect(wave4Events[0]).toMatchObject({
      eventType: "decision",
      category: "tool_deep",
      phase2Mode: "active",
      phase2CandidateReduction: "tool_allowlist_narrowing",
      phase2Applied: true,
      phase2ShadowOnly: false,
    });
    expect(wave4Events[1]).toMatchObject({
      eventType: "outcome",
      category: "tool_deep",
      toolExposureCount: 4,
      toolExposedNames: ["read_file", "grep_search", "file_search", "list_dir"],
      toolUsedNames: ["read_file"],
      phase2FallbackToFullDeep: false,
    });
  });

  it("keeps memory deep unchanged in active mode", async () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const runId = "wave4-phase2-memory-unchanged-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "memory answer" }],
      meta: {},
    });

    await createPolicyRun({ commandBody: "what did we decide last time about Wave 1", runId });

    stop();

    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      toolNameAllowlist: undefined,
    });
    expect(wave4Events[0]).toMatchObject({
      category: "memory_deep",
      phase2Mode: "active",
      phase2Applied: false,
    });
  });

  it("keeps reasoning deep unchanged in active mode", async () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const runId = "wave4-phase2-reasoning-unchanged-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "reasoning answer" }],
      meta: {},
    });

    await createPolicyRun({ commandBody: "explain the architectural tradeoffs here", runId });

    stop();

    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      toolNameAllowlist: undefined,
    });
    expect(wave4Events[0]).toMatchObject({
      category: "reasoning_deep",
      phase2Mode: "active",
      phase2Applied: false,
    });
  });

  it("keeps subagent tool-deep turns unchanged in active mode", async () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const runId = "wave4-phase2-subagent-unchanged-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock.mockResolvedValueOnce({
      payloads: [{ text: "subagent tool answer" }],
      meta: {},
    });

    await createPolicyRun({
      commandBody: "check the repo status",
      runId,
      sessionKey: "agent:main:subagent:child",
    });

    stop();

    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      toolNameAllowlist: undefined,
    });
    expect(wave4Events[0]).toMatchObject({
      turnOrigin: "subagent_root",
      phase2Applied: false,
      phase2ReasonCodes: ["phase2_non_user_root_turn"],
    });
  });

  it("falls back to full deep tools when the narrowed run produces no usable reply", async () => {
    process.env.OPENCLAW_WAVE4_PHASE2_MODE = "active";
    const runId = "wave4-phase2-fallback-run";
    const wave4Events: Array<Record<string, unknown>> = [];
    const stop = onAgentEvent((evt) => {
      if (evt.runId !== runId || evt.stream !== "wave4") {
        return;
      }
      wave4Events.push(evt.data);
    });
    state.runEmbeddedPiAgentMock
      .mockResolvedValueOnce({
        payloads: [],
        meta: {
          systemPromptReport: {
            source: "run",
            generatedAt: Date.now(),
            systemPrompt: { chars: 120, projectContextChars: 50, nonProjectContextChars: 70 },
            injectedWorkspaceFiles: [],
            bootstrap: {
              fileCount: 1,
              missingCount: 0,
              truncatedCount: 0,
              rawChars: 40,
              injectedChars: 40,
            },
            skills: { promptChars: 16, entries: [] },
            tools: {
              listChars: 40,
              schemaChars: 80,
              exposedCount: 4,
              entries: [
                { name: "read_file", summaryChars: 10, schemaChars: 20 },
                { name: "grep_search", summaryChars: 10, schemaChars: 20 },
                { name: "file_search", summaryChars: 10, schemaChars: 20 },
                { name: "list_dir", summaryChars: 10, schemaChars: 20 },
              ],
            },
          },
        },
      })
      .mockImplementationOnce(async (params: EmbeddedRunParams) => {
        params.onAgentEvent?.({ stream: "tool", data: { phase: "start", name: "read_file" } });
        return {
          payloads: [{ text: "full deep retry answer" }],
          meta: {
            systemPromptReport: {
              source: "run",
              generatedAt: Date.now(),
              systemPrompt: { chars: 220, projectContextChars: 90, nonProjectContextChars: 130 },
              injectedWorkspaceFiles: [],
              bootstrap: {
                fileCount: 1,
                missingCount: 0,
                truncatedCount: 0,
                rawChars: 80,
                injectedChars: 80,
              },
              skills: { promptChars: 20, entries: [] },
              tools: {
                listChars: 120,
                schemaChars: 420,
                exposedCount: 6,
                entries: [
                  { name: "read_file", summaryChars: 10, schemaChars: 20 },
                  { name: "grep_search", summaryChars: 10, schemaChars: 20 },
                  { name: "file_search", summaryChars: 10, schemaChars: 20 },
                  { name: "list_dir", summaryChars: 10, schemaChars: 20 },
                  { name: "exec", summaryChars: 10, schemaChars: 20 },
                  { name: "process", summaryChars: 10, schemaChars: 20 },
                ],
              },
            },
          },
        };
      });

    const result = await createPolicyRun({ commandBody: "list the files involved", runId });

    stop();

    expect(result).toMatchObject({ text: "full deep retry answer" });
    expect(state.runEmbeddedPiAgentMock).toHaveBeenCalledTimes(2);
    expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
      toolNameAllowlist: ["read_file", "grep_search", "file_search", "list_dir"],
    });
    expect(state.runEmbeddedPiAgentMock.mock.calls[1]?.[0]).toMatchObject({
      toolNameAllowlist: undefined,
    });
    expect(wave4Events[1]).toMatchObject({
      eventType: "outcome",
      phase2FallbackToFullDeep: true,
      toolExposureCount: 6,
      toolExposedNames: ["read_file", "grep_search", "file_search", "list_dir", "exec", "process"],
      toolUsedNames: ["read_file"],
    });
  });

  it("uses shadow mode by default to compute but not apply deep to fast overrides", async () => {
    await withStateDirEnv("policy-shadow-", async () => {
      const store = createEmptyResponsePolicyStateStore("shadow");
      store.entries["what can you do"] = {
        key: "what can you do",
        promptPreview: "what can you do",
        preferredProfile: "fast",
        evidence: {
          directSuccessCount: 0,
          fastSuccessCount: 0,
          deepSuccessCount: 5,
          noToolCount: 5,
          noRetrievalCount: 5,
          fallbackCount: 0,
          toolRequiredCount: 0,
          retrievalRequiredCount: 0,
          ambiguityCount: 0,
        },
        recent: {
          lastClassifierProfile: "deep",
          lastSelectedProfile: "deep",
          lastOverrideReasonCodes: [],
          lastFallbackTriggered: false,
          lastOverrideApplied: false,
          lastShadowOnly: true,
          lastPolicyMode: "shadow",
          lastUpdatedAt: 1,
        },
      };
      await writeResponsePolicyState(store);

      const runId = "policy-shadow-run";
      const policyEvents: Array<Record<string, unknown>> = [];
      const stop = onAgentEvent((evt) => {
        if (evt.runId !== runId || evt.stream !== "policy") {
          return;
        }
        policyEvents.push(evt.data);
      });
      state.runEmbeddedPiAgentMock.mockImplementationOnce(async () => ({
        payloads: [{ text: "deep reply" }],
        meta: {},
      }));

      const result = await createPolicyRun({ commandBody: "what can you do", runId });

      stop();

      expect(result).toMatchObject({ text: "deep reply" });
      expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
        turnProfile: "default",
        disableTools: false,
      });
      expect(policyEvents[0]).toMatchObject({
        policyMode: "shadow",
        shadowOnly: true,
        candidateProfile: "fast",
        selectedProfile: "deep",
        overrideApplied: false,
      });
    });
  });

  it("applies bounded deep to fast overrides in adaptive mode only when allowed", async () => {
    await withStateDirEnv("policy-adaptive-", async () => {
      process.env.OPENCLAW_RESPONSE_POLICY_MODE = "adaptive";
      const store = createEmptyResponsePolicyStateStore("adaptive");
      store.entries["how can you help"] = {
        key: "how can you help",
        promptPreview: "how can you help",
        preferredProfile: "fast",
        evidence: {
          directSuccessCount: 0,
          fastSuccessCount: 0,
          deepSuccessCount: 5,
          noToolCount: 5,
          noRetrievalCount: 5,
          fallbackCount: 0,
          toolRequiredCount: 0,
          retrievalRequiredCount: 0,
          ambiguityCount: 0,
        },
        recent: {
          lastClassifierProfile: "deep",
          lastSelectedProfile: "deep",
          lastOverrideReasonCodes: [],
          lastFallbackTriggered: false,
          lastOverrideApplied: false,
          lastShadowOnly: true,
          lastPolicyMode: "shadow",
          lastUpdatedAt: 1,
        },
      };
      await writeResponsePolicyState(store);

      const runId = "policy-adaptive-run";
      const policyEvents: Array<Record<string, unknown>> = [];
      const stop = onAgentEvent((evt) => {
        if (evt.runId !== runId || evt.stream !== "policy") {
          return;
        }
        policyEvents.push(evt.data);
      });
      state.runEmbeddedPiAgentMock.mockImplementationOnce(async () => ({
        payloads: [{ text: "fast reply" }],
        meta: {},
      }));

      const result = await createPolicyRun({ commandBody: "how can you help", runId });

      stop();

      expect(result).toMatchObject({ text: "fast reply" });
      expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
        turnProfile: "fast",
        disableTools: true,
      });
      expect(policyEvents[0]).toMatchObject({
        policyMode: "adaptive",
        shadowOnly: false,
        candidateProfile: "fast",
        selectedProfile: "fast",
        overrideApplied: true,
      });
    });
  });

  it("keeps unvalidated deep-to-fast families non-adaptive even in adaptive mode", async () => {
    await withStateDirEnv("policy-adaptive-unvalidated-", async () => {
      process.env.OPENCLAW_RESPONSE_POLICY_MODE = "adaptive";
      const store = createEmptyResponsePolicyStateStore("adaptive");
      store.entries["who are you"] = {
        key: "who are you",
        promptPreview: "who are you",
        preferredProfile: "fast",
        evidence: {
          directSuccessCount: 0,
          fastSuccessCount: 0,
          deepSuccessCount: 9,
          noToolCount: 9,
          noRetrievalCount: 9,
          fallbackCount: 0,
          toolRequiredCount: 0,
          retrievalRequiredCount: 0,
          ambiguityCount: 0,
        },
        recent: {
          lastClassifierProfile: "deep",
          lastSelectedProfile: "deep",
          lastOverrideReasonCodes: [],
          lastFallbackTriggered: false,
          lastOverrideApplied: false,
          lastShadowOnly: true,
          lastPolicyMode: "shadow",
          lastUpdatedAt: 1,
        },
      };
      await writeResponsePolicyState(store);

      const runId = "policy-adaptive-unvalidated-run";
      const policyEvents: Array<Record<string, unknown>> = [];
      const stop = onAgentEvent((evt) => {
        if (evt.runId !== runId || evt.stream !== "policy") {
          return;
        }
        policyEvents.push(evt.data);
      });
      state.runEmbeddedPiAgentMock.mockImplementationOnce(async () => ({
        payloads: [{ text: "deep reply" }],
        meta: {},
      }));

      const result = await createPolicyRun({ commandBody: "who are you", runId });

      stop();

      expect(result).toMatchObject({ text: "deep reply" });
      expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
        turnProfile: "default",
        disableTools: false,
      });
      expect(policyEvents[0]).toMatchObject({
        policyMode: "adaptive",
        selectedProfile: "deep",
        overrideApplied: false,
      });
      expect(policyEvents[0]?.candidateProfile).toBeUndefined();
      expect(policyEvents[0]?.overrideReasonCodes).toContain("insufficient_evidence");
    });
  });

  it("does not allow hard blockers to be promoted even with adaptive state", async () => {
    await withStateDirEnv("policy-blocker-", async () => {
      process.env.OPENCLAW_RESPONSE_POLICY_MODE = "adaptive";
      const store = createEmptyResponsePolicyStateStore("adaptive");
      store.entries["who are you"] = {
        key: "who are you",
        promptPreview: "who are you",
        preferredProfile: "fast",
        evidence: {
          directSuccessCount: 0,
          fastSuccessCount: 0,
          deepSuccessCount: 5,
          noToolCount: 5,
          noRetrievalCount: 5,
          fallbackCount: 0,
          toolRequiredCount: 0,
          retrievalRequiredCount: 0,
          ambiguityCount: 0,
        },
        recent: {
          lastClassifierProfile: "deep",
          lastSelectedProfile: "deep",
          lastOverrideReasonCodes: [],
          lastFallbackTriggered: false,
          lastOverrideApplied: false,
          lastShadowOnly: true,
          lastPolicyMode: "shadow",
          lastUpdatedAt: 1,
        },
      };
      await writeResponsePolicyState(store);

      const runId = "policy-blocker-run";
      const policyEvents: Array<Record<string, unknown>> = [];
      const stop = onAgentEvent((evt) => {
        if (evt.runId !== runId || evt.stream !== "policy") {
          return;
        }
        policyEvents.push(evt.data);
      });
      state.runEmbeddedPiAgentMock.mockImplementationOnce(async () => ({
        payloads: [{ text: "deep reply" }],
        meta: {},
      }));

      const result = await createPolicyRun({ commandBody: "/who are you", runId });

      stop();

      expect(result).toMatchObject({ text: "deep reply" });
      expect(state.runEmbeddedPiAgentMock.mock.calls[0]?.[0]).toMatchObject({
        turnProfile: "default",
        disableTools: false,
      });
      expect(policyEvents[0]).toMatchObject({
        policyMode: "adaptive",
        selectedProfile: "deep",
        overrideApplied: false,
      });
      expect(policyEvents[0]?.overrideReasonCodes).toContain("slash_command");
    });
  });
});
