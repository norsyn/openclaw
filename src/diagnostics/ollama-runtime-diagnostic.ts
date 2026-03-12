import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  findNormalizedProviderValue,
  resolveDefaultModelForAgent,
} from "../agents/model-selection.js";
import { OLLAMA_NATIVE_BASE_URL, parseNdjsonStream } from "../agents/ollama-stream.js";
import { dispatchInboundMessage } from "../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../auto-reply/reply/reply-dispatcher.js";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { loadConfig } from "../config/io.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";

type TurnTimingEvent = Record<string, unknown> & {
  stage?: string;
  ts?: number;
  latency_ms?: number;
};

type DirectOllamaProbe = {
  provider: string;
  model: string;
  baseUrl: string;
  requestStartedAt: string;
  firstTokenAt?: string;
  completedAt: string;
  firstTokenLatencyMs?: number;
  completionLatencyMs: number;
  contentChars: number;
  streamChunkCount: number;
  incrementalTokensObserved: boolean;
  modelLoadDurationMs?: number;
  promptEvalCount?: number;
  evalCount?: number;
  promptEvalDurationMs?: number;
  evalDurationMs?: number;
};

type RuntimeTurnDiagnostic = {
  runId: string;
  sessionKey: string;
  workspaceDir: string;
  replyKinds: Array<"tool" | "block" | "final">;
  replyCountByKind: Record<"tool" | "block" | "final", number>;
  partialReplyCount: number;
  reasoningStreamCount: number;
  assistantMessageStarts: number;
  toolStarts: string[];
  modelSelection?: {
    provider: string;
    model: string;
    thinkLevel?: string;
  };
  stageEvents: TurnTimingEvent[];
  turnLatencyBreakdown: {
    sessionStartupMs: number;
    promptAssemblyMs: number;
    memoryRetrievalMs: number;
    policyResolutionMs: number;
    llmRequestMs: number;
    firstTokenLatencyMs: number;
    generationMs: number;
  };
  detailedStageTimings: {
    wave3PolicyMs: number;
    wave4ClassificationMs: number;
    skillsPromptLoadMs: number;
    projectContextLoadMs: number;
    toolSchemaGenerationMs: number;
    systemPromptAssemblyMs: number;
    sessionStartupMs: number;
    llmDispatchMs: number;
    modelRequestTotalMs: number;
  };
  promptSize: {
    totalPromptTokens?: number;
    systemPromptTokensApprox?: number;
    projectContextTokensApprox?: number;
    skillsPromptTokensApprox?: number;
    toolSchemaTokensApprox?: number;
    memoryTokens: number;
    systemPromptChars?: number;
    projectContextChars?: number;
    skillsPromptChars?: number;
    toolSchemaChars?: number;
    toolExposedCount?: number;
    bootstrapInjectedChars?: number;
  };
  streaming: {
    ollamaStreamingEnabled: boolean;
    runtimeEmittedIncrementalReplies: boolean;
    dashboardPathBuffersFinalOnly: boolean;
    providerObservedIncrementalTokens: boolean;
    providerStreamChunkCount?: number;
  };
  modelLoad: {
    loadDurationMs?: number;
    likelyColdLoad: boolean;
    promptEvalCount?: number;
    evalCount?: number;
  };
  overhead: {
    joMemoryExecuted: boolean;
    toolDiscoveryRan: boolean;
    toolSchemaExpansionRan: boolean;
    policyRan: boolean;
    internalRoundsObserved: number;
  };
};

export type OllamaRuntimeDiagnosticResult = {
  prompt: string;
  directProbe: DirectOllamaProbe;
  runtimeTurn: RuntimeTurnDiagnostic;
};

function estimateTokensFromChars(chars: number | undefined): number | undefined {
  if (typeof chars !== "number" || !Number.isFinite(chars) || chars <= 0) {
    return chars === 0 ? 0 : undefined;
  }
  return Math.max(1, Math.round(chars / 4));
}

function resolveOllamaChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const normalizedBase = trimmed.replace(/\/v1$/i, "");
  const apiBase = normalizedBase || OLLAMA_NATIVE_BASE_URL;
  return `${apiBase}/api/chat`;
}

function resolveWorkspaceDirFromInput(input?: string): string {
  if (input && input.trim()) {
    return path.resolve(input);
  }
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../Jo");
}

function captureTurnTimingLogs<T>(
  run: () => Promise<T>,
): Promise<{ result: T; events: TurnTimingEvent[] }> {
  const events: TurnTimingEvent[] = [];
  const prefix = "[openclaw.turn] ";
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const line = args.map((value) => String(value)).join(" ");
    if (line.startsWith(prefix)) {
      try {
        events.push(JSON.parse(line.slice(prefix.length)) as TurnTimingEvent);
        return;
      } catch {}
    }
    originalLog(...args);
  };
  return run()
    .then((result) => ({ result, events }))
    .finally(() => {
      console.log = originalLog;
    });
}

function firstStage(events: TurnTimingEvent[], stage: string): TurnTimingEvent | undefined {
  return events.find((event) => event.stage === stage);
}

function latencyForStage(events: TurnTimingEvent[], stage: string): number {
  const event = firstStage(events, stage);
  const value = event?.latency_ms;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function timestampForStage(events: TurnTimingEvent[], stage: string): number | undefined {
  const event = firstStage(events, stage);
  return typeof event?.ts === "number" && Number.isFinite(event.ts) ? event.ts : undefined;
}

function createRuntimeContext(prompt: string, sessionKey: string, runId: string) {
  return {
    Body: prompt,
    BodyForAgent: prompt,
    BodyForCommands: prompt,
    RawBody: prompt,
    CommandBody: prompt,
    SessionKey: sessionKey,
    Provider: INTERNAL_MESSAGE_CHANNEL,
    Surface: INTERNAL_MESSAGE_CHANNEL,
    OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
    ChatType: "direct" as const,
    CommandAuthorized: true,
    MessageSid: runId,
  };
}

function resolveDefaultOllamaTarget(cfg: OpenClawConfig): {
  provider: string;
  model: string;
  baseUrl: string;
} {
  const ref = resolveDefaultModelForAgent({ cfg, agentId: undefined });
  const providerConfig = findNormalizedProviderValue(cfg.models?.providers, ref.provider);
  const baseUrl =
    providerConfig &&
    typeof providerConfig === "object" &&
    typeof providerConfig.baseUrl === "string"
      ? providerConfig.baseUrl
      : OLLAMA_NATIVE_BASE_URL;
  if (ref.provider !== "ollama") {
    throw new Error(`Default model is ${ref.provider}/${ref.model}, not an Ollama model.`);
  }
  return {
    provider: ref.provider,
    model: ref.model,
    baseUrl,
  };
}

async function runDirectOllamaProbe(input: {
  provider: string;
  model: string;
  baseUrl: string;
  prompt: string;
}): Promise<DirectOllamaProbe> {
  const startedAt = Date.now();
  const response = await fetch(resolveOllamaChatUrl(input.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      messages: [{ role: "user", content: input.prompt }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "unknown error");
    throw new Error(`Direct Ollama probe failed (${response.status}): ${body}`);
  }
  if (!response.body) {
    throw new Error("Direct Ollama probe returned an empty response body.");
  }

  const reader = response.body.getReader();
  let firstTokenAt: number | undefined;
  let completedAt = startedAt;
  let contentChars = 0;
  let streamChunkCount = 0;
  let incrementalTokensObserved = false;
  let promptEvalCount: number | undefined;
  let evalCount: number | undefined;
  let promptEvalDurationMs: number | undefined;
  let evalDurationMs: number | undefined;
  let modelLoadDurationMs: number | undefined;

  for await (const chunk of parseNdjsonStream(reader)) {
    streamChunkCount += 1;
    const hasVisibleChunk = Boolean(
      chunk.message?.content || chunk.message?.reasoning || chunk.message?.tool_calls?.length,
    );
    if (hasVisibleChunk) {
      contentChars += (chunk.message?.content ?? chunk.message?.reasoning ?? "").length;
      if (!firstTokenAt) {
        firstTokenAt = Date.now();
      } else {
        incrementalTokensObserved = true;
      }
    }
    if (chunk.done) {
      completedAt = Date.now();
      promptEvalCount = chunk.prompt_eval_count;
      evalCount = chunk.eval_count;
      promptEvalDurationMs =
        typeof chunk.prompt_eval_duration === "number"
          ? Math.round(chunk.prompt_eval_duration / 1_000_000)
          : undefined;
      evalDurationMs =
        typeof chunk.eval_duration === "number"
          ? Math.round(chunk.eval_duration / 1_000_000)
          : undefined;
      modelLoadDurationMs =
        typeof chunk.load_duration === "number"
          ? Math.round(chunk.load_duration / 1_000_000)
          : undefined;
      break;
    }
  }

  return {
    provider: input.provider,
    model: input.model,
    baseUrl: input.baseUrl,
    requestStartedAt: new Date(startedAt).toISOString(),
    firstTokenAt: firstTokenAt ? new Date(firstTokenAt).toISOString() : undefined,
    completedAt: new Date(completedAt).toISOString(),
    firstTokenLatencyMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
    completionLatencyMs: completedAt - startedAt,
    contentChars,
    streamChunkCount,
    incrementalTokensObserved,
    modelLoadDurationMs,
    promptEvalCount,
    evalCount,
    promptEvalDurationMs,
    evalDurationMs,
  };
}

async function runRuntimeTurn(input: {
  cfg: OpenClawConfig;
  workspaceDir: string;
  prompt: string;
}): Promise<RuntimeTurnDiagnostic> {
  const sessionKey = `diagnostic:ollama:${Date.now()}`;
  const runId = `diag-ollama-${Date.now()}`;
  const replyKinds: Array<"tool" | "block" | "final"> = [];
  const partialReplies: ReplyPayload[] = [];
  const reasoningPayloads: Array<{ text?: string }> = [];
  const toolStarts: string[] = [];
  let assistantMessageStarts = 0;
  let modelSelection:
    | {
        provider: string;
        model: string;
        thinkLevel?: string;
      }
    | undefined;

  const cwdBefore = process.cwd();
  process.chdir(input.workspaceDir);
  try {
    const captured = await captureTurnTimingLogs(async () => {
      const dispatcher = createReplyDispatcher({
        deliver: async (_payload, info) => {
          replyKinds.push(info.kind);
        },
      });

      await dispatchInboundMessage({
        ctx: createRuntimeContext(input.prompt, sessionKey, runId),
        cfg: input.cfg,
        dispatcher,
        replyOptions: {
          runId,
          onPartialReply: async (payload) => {
            partialReplies.push(payload);
          },
          onReasoningStream: async (payload) => {
            reasoningPayloads.push(payload);
          },
          onAssistantMessageStart: async () => {
            assistantMessageStarts += 1;
          },
          onToolStart: async (info) => {
            if (typeof info?.name === "string" && info.name.trim()) {
              toolStarts.push(info.name);
            }
          },
          onModelSelected: async (selection) => {
            modelSelection = {
              provider: selection.provider,
              model: selection.model,
              thinkLevel: selection.thinkLevel,
            };
          },
        },
      });
    });

    const events = captured.events;
    const wave3PolicyMs = latencyForStage(events, "wave3_policy_end");
    const wave4ClassificationMs = latencyForStage(events, "wave4_classification_end");
    const skillsPromptLoadMs = latencyForStage(events, "skills_prompt_load_end");
    const projectContextLoadMs = latencyForStage(events, "project_context_load_end");
    const toolSchemaGenerationMs = latencyForStage(events, "tool_schema_generation_end");
    const systemPromptAssemblyMs = latencyForStage(events, "system_prompt_assembly_end");
    const sessionStartupMs = latencyForStage(events, "session_startup_end");
    const modelRequestTotalMs = latencyForStage(events, "model_request_complete");
    const modelRequestStartTs = timestampForStage(events, "model_request_start");
    const llmDispatchStartTs = timestampForStage(events, "llm_dispatch_start");
    const firstTokenLatencyMs = latencyForStage(events, "first_token");
    const llmDispatchMs =
      typeof llmDispatchStartTs === "number" && typeof modelRequestStartTs === "number"
        ? Math.max(0, modelRequestStartTs - llmDispatchStartTs)
        : 0;
    const generationMs =
      typeof modelRequestTotalMs === "number" && typeof firstTokenLatencyMs === "number"
        ? Math.max(0, modelRequestTotalMs - firstTokenLatencyMs)
        : 0;

    const promptStage = firstStage(events, "system_prompt_assembly_end");
    const streamingStage = firstStage(events, "streaming_observation");

    return {
      runId,
      sessionKey,
      workspaceDir: input.workspaceDir,
      replyKinds,
      replyCountByKind: {
        tool: replyKinds.filter((kind) => kind === "tool").length,
        block: replyKinds.filter((kind) => kind === "block").length,
        final: replyKinds.filter((kind) => kind === "final").length,
      },
      partialReplyCount: partialReplies.length,
      reasoningStreamCount: reasoningPayloads.length,
      assistantMessageStarts,
      toolStarts,
      modelSelection,
      stageEvents: events,
      turnLatencyBreakdown: {
        sessionStartupMs,
        promptAssemblyMs:
          skillsPromptLoadMs +
          projectContextLoadMs +
          toolSchemaGenerationMs +
          systemPromptAssemblyMs,
        memoryRetrievalMs: 0,
        policyResolutionMs: wave3PolicyMs + wave4ClassificationMs,
        llmRequestMs: llmDispatchMs,
        firstTokenLatencyMs,
        generationMs,
      },
      detailedStageTimings: {
        wave3PolicyMs,
        wave4ClassificationMs,
        skillsPromptLoadMs,
        projectContextLoadMs,
        toolSchemaGenerationMs,
        systemPromptAssemblyMs,
        sessionStartupMs,
        llmDispatchMs,
        modelRequestTotalMs,
      },
      promptSize: {
        totalPromptTokens:
          typeof streamingStage?.prompt_eval_count === "number"
            ? streamingStage.prompt_eval_count
            : undefined,
        systemPromptTokensApprox: estimateTokensFromChars(
          typeof promptStage?.system_prompt_chars === "number"
            ? promptStage.system_prompt_chars
            : undefined,
        ),
        projectContextTokensApprox: estimateTokensFromChars(
          typeof promptStage?.project_context_chars === "number"
            ? promptStage.project_context_chars
            : undefined,
        ),
        skillsPromptTokensApprox: estimateTokensFromChars(
          typeof promptStage?.skills_prompt_chars === "number"
            ? promptStage.skills_prompt_chars
            : undefined,
        ),
        toolSchemaTokensApprox: estimateTokensFromChars(
          typeof promptStage?.tool_schema_chars === "number"
            ? promptStage.tool_schema_chars
            : undefined,
        ),
        memoryTokens: toolStarts.includes("jo_memory_search") ? undefined : 0,
        systemPromptChars:
          typeof promptStage?.system_prompt_chars === "number"
            ? promptStage.system_prompt_chars
            : undefined,
        projectContextChars:
          typeof promptStage?.project_context_chars === "number"
            ? promptStage.project_context_chars
            : undefined,
        skillsPromptChars:
          typeof promptStage?.skills_prompt_chars === "number"
            ? promptStage.skills_prompt_chars
            : undefined,
        toolSchemaChars:
          typeof promptStage?.tool_schema_chars === "number"
            ? promptStage.tool_schema_chars
            : undefined,
        toolExposedCount:
          typeof promptStage?.tool_exposed_count === "number"
            ? promptStage.tool_exposed_count
            : undefined,
        bootstrapInjectedChars:
          typeof promptStage?.bootstrap_injected_chars === "number"
            ? promptStage.bootstrap_injected_chars
            : undefined,
      },
      streaming: {
        ollamaStreamingEnabled: true,
        runtimeEmittedIncrementalReplies:
          partialReplies.length > 0 ||
          replyKinds.some((kind) => kind === "block" || kind === "tool"),
        dashboardPathBuffersFinalOnly: true,
        providerObservedIncrementalTokens: Boolean(streamingStage?.did_receive_incremental_tokens),
        providerStreamChunkCount:
          typeof streamingStage?.stream_chunks_total === "number"
            ? streamingStage.stream_chunks_total
            : undefined,
      },
      modelLoad: {
        loadDurationMs:
          typeof streamingStage?.load_duration_ms === "number"
            ? streamingStage.load_duration_ms
            : undefined,
        likelyColdLoad:
          typeof streamingStage?.load_duration_ms === "number" &&
          streamingStage.load_duration_ms > 1_000,
        promptEvalCount:
          typeof streamingStage?.prompt_eval_count === "number"
            ? streamingStage.prompt_eval_count
            : undefined,
        evalCount:
          typeof streamingStage?.eval_count === "number" ? streamingStage.eval_count : undefined,
      },
      overhead: {
        joMemoryExecuted: toolStarts.includes("jo_memory_search"),
        toolDiscoveryRan: Boolean(firstStage(events, "tool_schema_generation_end")),
        toolSchemaExpansionRan: Boolean(firstStage(events, "tool_schema_generation_end")),
        policyRan: Boolean(firstStage(events, "wave3_policy_end")),
        internalRoundsObserved: 0,
      },
    };
  } finally {
    process.chdir(cwdBefore);
  }
}

export async function runOllamaRuntimeDiagnostic(input?: {
  prompt?: string;
  workspaceDir?: string;
}): Promise<OllamaRuntimeDiagnosticResult> {
  const prompt = input?.prompt?.trim() || "hi";
  const workspaceDir = resolveWorkspaceDirFromInput(input?.workspaceDir);
  const cfg = loadConfig();
  const target = resolveDefaultOllamaTarget(cfg);
  const previousTurnTiming = process.env.OPENCLAW_TURN_TIMING;
  process.env.OPENCLAW_TURN_TIMING = "1";
  try {
    const directProbe = await runDirectOllamaProbe({
      provider: target.provider,
      model: target.model,
      baseUrl: target.baseUrl,
      prompt,
    });
    const runtimeTurn = await runRuntimeTurn({
      cfg,
      workspaceDir,
      prompt,
    });
    return {
      prompt,
      directProbe,
      runtimeTurn,
    };
  } finally {
    if (typeof previousTurnTiming === "string") {
      process.env.OPENCLAW_TURN_TIMING = previousTurnTiming;
    } else {
      delete process.env.OPENCLAW_TURN_TIMING;
    }
  }
}

export async function runOllamaRuntimeDiagnosticFromCli(args: string[]): Promise<void> {
  const readArg = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    if (index === -1) {
      return undefined;
    }
    return args[index + 1];
  };
  const prompt = readArg("--prompt") ?? "hi";
  const workspaceDir = readArg("--workspace");
  const result = await runOllamaRuntimeDiagnostic({ prompt, workspaceDir });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runOllamaRuntimeDiagnosticFromCli(process.argv.slice(2));
}
