import { randomUUID } from "node:crypto";
import type { StreamFn } from "@mariozechner/pi-agent-core";
import type {
  AssistantMessage,
  StopReason,
  TextContent,
  ToolCall,
  Tool,
} from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { isNonSecretApiKeyMarker } from "./model-auth-markers.js";
import {
  buildAssistantMessage as buildStreamAssistantMessage,
  buildStreamErrorAssistantMessage,
  buildUsageWithNoCost,
} from "./stream-message-shared.js";

const log = createSubsystemLogger("ollama-stream");

export const OLLAMA_NATIVE_BASE_URL = "http://127.0.0.1:11434";

export function resolveOllamaBaseUrlForRun(params: {
  modelBaseUrl?: string;
  providerBaseUrl?: string;
}): string {
  const providerBaseUrl = params.providerBaseUrl?.trim();
  if (providerBaseUrl) {
    return providerBaseUrl;
  }
  const modelBaseUrl = params.modelBaseUrl?.trim();
  if (modelBaseUrl) {
    return modelBaseUrl;
  }
  return OLLAMA_NATIVE_BASE_URL;
}

// ── Ollama /api/chat request types ──────────────────────────────────────────

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  tools?: OllamaTool[];
  options?: Record<string, unknown>;
}

interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

const MAX_SAFE_INTEGER_ABS_STR = String(Number.MAX_SAFE_INTEGER);

function isAsciiDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function parseJsonNumberToken(
  input: string,
  start: number,
): { token: string; end: number; isInteger: boolean } | null {
  let idx = start;
  if (input[idx] === "-") {
    idx += 1;
  }
  if (idx >= input.length) {
    return null;
  }

  if (input[idx] === "0") {
    idx += 1;
  } else if (isAsciiDigit(input[idx]) && input[idx] !== "0") {
    while (isAsciiDigit(input[idx])) {
      idx += 1;
    }
  } else {
    return null;
  }

  let isInteger = true;
  if (input[idx] === ".") {
    isInteger = false;
    idx += 1;
    if (!isAsciiDigit(input[idx])) {
      return null;
    }
    while (isAsciiDigit(input[idx])) {
      idx += 1;
    }
  }

  if (input[idx] === "e" || input[idx] === "E") {
    isInteger = false;
    idx += 1;
    if (input[idx] === "+" || input[idx] === "-") {
      idx += 1;
    }
    if (!isAsciiDigit(input[idx])) {
      return null;
    }
    while (isAsciiDigit(input[idx])) {
      idx += 1;
    }
  }

  return {
    token: input.slice(start, idx),
    end: idx,
    isInteger,
  };
}

function isUnsafeIntegerLiteral(token: string): boolean {
  const digits = token[0] === "-" ? token.slice(1) : token;
  if (digits.length < MAX_SAFE_INTEGER_ABS_STR.length) {
    return false;
  }
  if (digits.length > MAX_SAFE_INTEGER_ABS_STR.length) {
    return true;
  }
  return digits > MAX_SAFE_INTEGER_ABS_STR;
}

function quoteUnsafeIntegerLiterals(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let idx = 0;

  while (idx < input.length) {
    const ch = input[idx] ?? "";
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      idx += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      idx += 1;
      continue;
    }

    if (ch === "-" || isAsciiDigit(ch)) {
      const parsed = parseJsonNumberToken(input, idx);
      if (parsed) {
        if (parsed.isInteger && isUnsafeIntegerLiteral(parsed.token)) {
          out += `"${parsed.token}"`;
        } else {
          out += parsed.token;
        }
        idx = parsed.end;
        continue;
      }
    }

    out += ch;
    idx += 1;
  }

  return out;
}

function parseJsonPreservingUnsafeIntegers(input: string): unknown {
  return JSON.parse(quoteUnsafeIntegerLiterals(input)) as unknown;
}

// ── Ollama /api/chat response types ─────────────────────────────────────────

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: "assistant";
    content: string;
    thinking?: string;
    reasoning?: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// ── Message conversion ──────────────────────────────────────────────────────

type InputContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return (content as InputContentPart[])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function extractOllamaImages(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return (content as InputContentPart[])
    .filter((part): part is { type: "image"; data: string } => part.type === "image")
    .map((part) => part.data);
}

function extractToolCalls(content: unknown): OllamaToolCall[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const parts = content as InputContentPart[];
  const result: OllamaToolCall[] = [];
  for (const part of parts) {
    if (part.type === "toolCall") {
      result.push({ function: { name: part.name, arguments: part.arguments } });
    } else if (part.type === "tool_use") {
      result.push({ function: { name: part.name, arguments: part.input } });
    }
  }
  return result;
}

export function convertToOllamaMessages(
  messages: Array<{ role: string; content: unknown }>,
  system?: string,
): OllamaChatMessage[] {
  const result: OllamaChatMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    const { role } = msg;

    if (role === "user") {
      const text = extractTextContent(msg.content);
      const images = extractOllamaImages(msg.content);
      result.push({
        role: "user",
        content: text,
        ...(images.length > 0 ? { images } : {}),
      });
    } else if (role === "assistant") {
      const text = extractTextContent(msg.content);
      const toolCalls = extractToolCalls(msg.content);
      result.push({
        role: "assistant",
        content: text,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else if (role === "tool" || role === "toolResult") {
      // SDK uses "toolResult" (camelCase) for tool result messages.
      // Ollama API expects "tool" role with tool_name per the native spec.
      const text = extractTextContent(msg.content);
      const toolName =
        typeof (msg as { toolName?: unknown }).toolName === "string"
          ? (msg as { toolName?: string }).toolName
          : undefined;
      result.push({
        role: "tool",
        content: text,
        ...(toolName ? { tool_name: toolName } : {}),
      });
    }
  }

  return result;
}

// ── Tool extraction ─────────────────────────────────────────────────────────

function extractOllamaTools(tools: Tool[] | undefined): OllamaTool[] {
  if (!tools || !Array.isArray(tools)) {
    return [];
  }
  const result: OllamaTool[] = [];
  for (const tool of tools) {
    if (typeof tool.name !== "string" || !tool.name) {
      continue;
    }
    result.push({
      type: "function",
      function: {
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : "",
        parameters: (tool.parameters ?? {}) as Record<string, unknown>,
      },
    });
  }
  return result;
}

// ── Response conversion ─────────────────────────────────────────────────────

export function buildAssistantMessage(
  response: OllamaChatResponse,
  modelInfo: { api: string; provider: string; id: string },
): AssistantMessage {
  const content: (TextContent | ToolCall)[] = [];

  // Ollama-native reasoning models may emit their answer in `thinking` or
  // `reasoning` with an empty `content`. Fall back so replies are not dropped.
  const text =
    response.message.content || response.message.thinking || response.message.reasoning || "";
  if (text) {
    content.push({ type: "text", text });
  }

  const toolCalls = response.message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      content.push({
        type: "toolCall",
        id: `ollama_call_${randomUUID()}`,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    }
  }

  const turnTimingEnabled = (() => {
    const raw = process.env.OPENCLAW_TURN_TIMING;
    if (typeof raw !== "string") {
      return false;
    }
    return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
  })();
  const emitTurnTiming = (stage: string, extra?: Record<string, unknown>) => {
    if (!turnTimingEnabled) {
      return;
    }
    try {
      console.log(
        `[openclaw.turn] ${JSON.stringify({ ts: Date.now(), stage, surface: "model", provider: modelInfo.provider, model: modelInfo.id, ...extra })}`,
      );
    } catch {}
  };
  const hasVisibleText = content.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0,
  );
  if (!hasVisibleText && (!toolCalls || toolCalls.length === 0)) {
    emitTurnTiming("empty_output_detected", {
      empty_output: true,
      output_length: 0,
    });
    const fallbackText =
      "I hit an internal empty-output condition after processing your request. Please retry.";
    content.push({ type: "text", text: fallbackText });
    emitTurnTiming("fallback_used", {
      empty_output: true,
      fallback_used: true,
      output_length: fallbackText.length,
    });
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const stopReason: StopReason = hasToolCalls ? "toolUse" : "stop";
  const message = buildStreamAssistantMessage({
    model: modelInfo,
    content,
    stopReason,
    usage: buildUsageWithNoCost({
      input: response.prompt_eval_count ?? 0,
      output: response.eval_count ?? 0,
    }),
  });

  const outputLength = content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim().length;
  emitTurnTiming("generation_complete", {
    empty_output: outputLength === 0,
    fallback_used: Boolean(
      (message as AssistantMessage & { openclawSafeguard?: { emptyOutputFallback?: boolean } })
        .openclawSafeguard?.emptyOutputFallback,
    ),
    output_length: outputLength,
  });

  return message;
}

// ── NDJSON streaming parser ─────────────────────────────────────────────────

export async function* parseNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<OllamaChatResponse> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        yield parseJsonPreservingUnsafeIntegers(trimmed) as OllamaChatResponse;
      } catch {
        log.warn(`Skipping malformed NDJSON line: ${trimmed.slice(0, 120)}`);
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield parseJsonPreservingUnsafeIntegers(buffer.trim()) as OllamaChatResponse;
    } catch {
      log.warn(`Skipping malformed trailing data: ${buffer.trim().slice(0, 120)}`);
    }
  }
}

// ── Main StreamFn factory ───────────────────────────────────────────────────

function resolveOllamaChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const normalizedBase = trimmed.replace(/\/v1$/i, "");
  const apiBase = normalizedBase || OLLAMA_NATIVE_BASE_URL;
  return `${apiBase}/api/chat`;
}

function resolveOllamaModelHeaders(model: {
  headers?: unknown;
}): Record<string, string> | undefined {
  if (!model.headers || typeof model.headers !== "object" || Array.isArray(model.headers)) {
    return undefined;
  }
  return model.headers as Record<string, string>;
}

export function createOllamaStreamFn(
  baseUrl: string,
  defaultHeaders?: Record<string, string>,
): StreamFn {
  const chatUrl = resolveOllamaChatUrl(baseUrl);

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const turnTimingEnabled = (() => {
      const raw = process.env.OPENCLAW_TURN_TIMING;
      if (typeof raw !== "string") {
        return false;
      }
      return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
    })();
    const emitTurnTiming = (stage: string, extra?: Record<string, unknown>) => {
      if (!turnTimingEnabled) {
        return;
      }
      try {
        console.log(
          `[openclaw.turn] ${JSON.stringify({ ts: Date.now(), stage, surface: "model", provider: model.provider, model: model.id, ...extra })}`,
        );
      } catch {}
    };
    const startedAt = Date.now();

    const run = async () => {
      try {
        emitTurnTiming("model_request_start", {
          message_count: Array.isArray(context.messages) ? context.messages.length : 0,
        });
        log.info("runtime stability ollama request start", {
          provider: model.provider,
          model: model.id,
          chatUrl,
          messageCount: Array.isArray(context.messages) ? context.messages.length : 0,
          hasSystemPrompt:
            typeof context.systemPrompt === "string" && context.systemPrompt.length > 0,
          toolCount: Array.isArray(context.tools) ? context.tools.length : 0,
        });

        const ollamaMessages = convertToOllamaMessages(
          context.messages ?? [],
          context.systemPrompt,
        );

        const ollamaTools = extractOllamaTools(context.tools);

        // Ollama defaults to num_ctx=4096 which is too small for large
        // system prompts + many tool definitions. Use model's contextWindow.
        const ollamaOptions: Record<string, unknown> = { num_ctx: model.contextWindow ?? 65536 };
        if (typeof options?.temperature === "number") {
          ollamaOptions.temperature = options.temperature;
        }
        if (typeof options?.maxTokens === "number") {
          ollamaOptions.num_predict = options.maxTokens;
        }

        const body: OllamaChatRequest = {
          model: model.id,
          messages: ollamaMessages,
          stream: true,
          ...(ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
          options: ollamaOptions,
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...defaultHeaders,
          ...options?.headers,
        };
        if (
          options?.apiKey &&
          (!headers.Authorization || !isNonSecretApiKeyMarker(options.apiKey))
        ) {
          headers.Authorization = `Bearer ${options.apiKey}`;
        }

        const response = await fetch(chatUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: options?.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "unknown error");
          throw new Error(`Ollama API error ${response.status}: ${errorText}`);
        }

        if (!response.body) {
          throw new Error("Ollama API returned empty response body");
        }

        const reader = response.body.getReader();
        let accumulatedContent = "";
        let fallbackContent = "";
        let sawContent = false;
        const accumulatedToolCalls: OllamaToolCall[] = [];
        let finalResponse: OllamaChatResponse | undefined;
        let firstTokenLogged = false;
        let streamChunksTotal = 0;
        let contentChunkCount = 0;
        let reasoningChunkCount = 0;

        for await (const chunk of parseNdjsonStream(reader)) {
          streamChunksTotal += 1;
          if (
            !firstTokenLogged &&
            (chunk.message?.content ||
              chunk.message?.reasoning ||
              chunk.message?.tool_calls?.length)
          ) {
            firstTokenLogged = true;
            emitTurnTiming("first_token", {
              latency_ms: Date.now() - startedAt,
            });
          }
          if (chunk.message?.content) {
            sawContent = true;
            accumulatedContent += chunk.message.content;
            contentChunkCount += 1;
          } else if (!sawContent && chunk.message?.thinking) {
            fallbackContent += chunk.message.thinking;
            reasoningChunkCount += 1;
          } else if (!sawContent && chunk.message?.reasoning) {
            // Preserve compatibility with variants that emit the answer via reasoning.
            fallbackContent += chunk.message.reasoning;
            reasoningChunkCount += 1;
          }

          // Ollama sends tool_calls in intermediate (done:false) chunks,
          // NOT in the final done:true chunk. Collect from all chunks.
          if (chunk.message?.tool_calls) {
            accumulatedToolCalls.push(...chunk.message.tool_calls);
          }

          if (chunk.done) {
            finalResponse = chunk;
            break;
          }
        }

        if (!finalResponse) {
          throw new Error("Ollama API stream ended without a final response");
        }

        finalResponse.message.content = accumulatedContent || fallbackContent;
        if (accumulatedToolCalls.length > 0) {
          finalResponse.message.tool_calls = accumulatedToolCalls;
        }

        const requestCompletedAt = Date.now();
        emitTurnTiming("model_request_complete", {
          latency_ms: requestCompletedAt - startedAt,
        });
        log.info("runtime stability ollama request complete", {
          provider: model.provider,
          model: model.id,
          latencyMs: requestCompletedAt - startedAt,
          streamChunksTotal,
          contentChunkCount,
          reasoningChunkCount,
          evalCount: finalResponse.eval_count,
          promptEvalCount: finalResponse.prompt_eval_count,
        });
        emitTurnTiming("streaming_observation", {
          stream_enabled: true,
          stream_chunks_total: streamChunksTotal,
          content_chunk_count: contentChunkCount,
          reasoning_chunk_count: reasoningChunkCount,
          did_receive_incremental_tokens: contentChunkCount + reasoningChunkCount > 1,
          load_duration_ms:
            typeof finalResponse.load_duration === "number"
              ? Math.round(finalResponse.load_duration / 1_000_000)
              : undefined,
          prompt_eval_count: finalResponse.prompt_eval_count,
          eval_count: finalResponse.eval_count,
          prompt_eval_duration_ms:
            typeof finalResponse.prompt_eval_duration === "number"
              ? Math.round(finalResponse.prompt_eval_duration / 1_000_000)
              : undefined,
          eval_duration_ms:
            typeof finalResponse.eval_duration === "number"
              ? Math.round(finalResponse.eval_duration / 1_000_000)
              : undefined,
        });

        const assistantMessage = buildAssistantMessage(finalResponse, {
          api: model.api,
          provider: model.provider,
          id: model.id,
        });

        const reason: Extract<StopReason, "stop" | "length" | "toolUse"> =
          assistantMessage.stopReason === "toolUse" ? "toolUse" : "stop";

        stream.push({
          type: "done",
          reason,
          message: assistantMessage,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        emitTurnTiming("model_request_error", {
          latency_ms: Date.now() - startedAt,
          error: errorMessage,
          aborted: err instanceof Error && err.name === "AbortError",
          timeout_like: /timeout/i.test(errorMessage),
          retry_policy: "none",
        });
        log.warn("runtime stability ollama request error", {
          provider: model.provider,
          model: model.id,
          chatUrl,
          latencyMs: Date.now() - startedAt,
          aborted: err instanceof Error && err.name === "AbortError",
          timeoutLike: /timeout/i.test(errorMessage),
          error: errorMessage,
        });
        stream.push({
          type: "error",
          reason: "error",
          error: buildStreamErrorAssistantMessage({
            model,
            errorMessage,
          }),
        });
      } finally {
        stream.end();
      }
    };

    queueMicrotask(() => void run());
    return stream;
  };
}

export function createConfiguredOllamaStreamFn(params: {
  model: { baseUrl?: string; headers?: unknown };
  providerBaseUrl?: string;
}): StreamFn {
  const modelBaseUrl = typeof params.model.baseUrl === "string" ? params.model.baseUrl : undefined;
  return createOllamaStreamFn(
    resolveOllamaBaseUrlForRun({
      modelBaseUrl,
      providerBaseUrl: params.providerBaseUrl,
    }),
    resolveOllamaModelHeaders(params.model),
  );
}
