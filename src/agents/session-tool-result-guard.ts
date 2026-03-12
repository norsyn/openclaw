import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { SessionManager } from "@mariozechner/pi-coding-agent";
import type {
  PluginHookBeforeMessageWriteEvent,
  PluginHookBeforeMessageWriteResult,
} from "../plugins/types.js";
import { emitSessionTranscriptUpdate } from "../sessions/transcript-events.js";
import {
  HARD_MAX_TOOL_RESULT_CHARS,
  truncateToolResultMessage,
} from "./pi-embedded-runner/tool-result-truncation.js";
import { makeMissingToolResult, sanitizeToolCallInputs } from "./session-transcript-repair.js";
import { extractToolCallsFromAssistant, extractToolResultId } from "./tool-call-id.js";

const GUARD_TRUNCATION_SUFFIX =
  "\n\n⚠️ [Content truncated during persistence — original exceeded size limit. " +
  "Use offset/limit parameters or request specific sections for large content.]";

/**
 * Truncate oversized text content blocks in a tool result message.
 * Returns the original message if under the limit, or a new message with
 * truncated text blocks otherwise.
 */
function capToolResultSize(msg: AgentMessage): AgentMessage {
  if ((msg as { role?: string }).role !== "toolResult") {
    return msg;
  }
  return truncateToolResultMessage(msg, HARD_MAX_TOOL_RESULT_CHARS, {
    suffix: GUARD_TRUNCATION_SUFFIX,
    minKeepChars: 2_000,
  });
}

function trimNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizePersistedToolResultName(
  message: AgentMessage,
  fallbackName?: string,
): AgentMessage {
  if ((message as { role?: unknown }).role !== "toolResult") {
    return message;
  }
  const toolResult = message as Extract<AgentMessage, { role: "toolResult" }>;
  const rawToolName = (toolResult as { toolName?: unknown }).toolName;
  const normalizedToolName = trimNonEmptyString(rawToolName);
  if (normalizedToolName) {
    if (rawToolName === normalizedToolName) {
      return toolResult;
    }
    return { ...toolResult, toolName: normalizedToolName };
  }

  const normalizedFallback = trimNonEmptyString(fallbackName);
  if (normalizedFallback) {
    return { ...toolResult, toolName: normalizedFallback };
  }

  if (typeof rawToolName === "string") {
    return { ...toolResult, toolName: "unknown" };
  }
  return toolResult;
}

function isTurnTimingEnabled(): boolean {
  const raw = process.env.OPENCLAW_TURN_TIMING;
  if (typeof raw !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function stripRetrievedMemoryContextText(text: string): string {
  return text.replace(/^## Retrieved Memory Context\n(?:- .*\n?)+\n*/u, "");
}

function extractVisibleText(message: AgentMessage): string {
  if (typeof (message as { content?: unknown }).content === "string") {
    return (message as { content: string }).content;
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (
        !part ||
        typeof part !== "object" ||
        typeof (part as { text?: unknown }).text !== "string"
      ) {
        return "";
      }
      return (part as { text: string }).text;
    })
    .filter(Boolean)
    .join("\n");
}

function sanitizeVisibleTranscriptMessage(message: AgentMessage): AgentMessage {
  if (message.role !== "user" && message.role !== "assistant") {
    return message;
  }
  if (!Array.isArray((message as { content?: unknown }).content)) {
    return message;
  }
  let changed = false;
  const nextContent = (message as { content: unknown[] }).content.flatMap((part) => {
    if (
      !part ||
      typeof part !== "object" ||
      typeof (part as { text?: unknown }).text !== "string"
    ) {
      return [part];
    }
    const nextText = stripRetrievedMemoryContextText((part as { text: string }).text);
    if (nextText !== (part as { text: string }).text) {
      changed = true;
    }
    if (nextText.length === 0) {
      return [];
    }
    return [{ ...(part as Record<string, unknown>), text: nextText }];
  });
  return changed ? ({ ...message, content: nextContent } as AgentMessage) : message;
}

function applyEmptyOutputFallback(message: AgentMessage): {
  message: AgentMessage;
  fallbackUsed: boolean;
} {
  if (message.role !== "assistant") {
    return { message, fallbackUsed: false };
  }
  const visibleText = extractVisibleText(message).trim();
  const toolCalls = extractToolCallsFromAssistant(message);
  if (
    visibleText.length > 0 ||
    toolCalls.length > 0 ||
    (message as { stopReason?: string }).stopReason === "aborted"
  ) {
    return { message, fallbackUsed: false };
  }

  const fallbackText =
    "I hit an internal empty-output condition after processing your request. Please retry.";
  const nextMessage = {
    ...(message as Record<string, unknown>),
    content: [{ type: "text", text: fallbackText }],
    openclawSafeguard: {
      ...(message as { openclawSafeguard?: Record<string, unknown> }).openclawSafeguard,
      emptyOutputFallback: true,
    },
  } as AgentMessage;

  return { message: nextMessage, fallbackUsed: true };
}

export function installSessionToolResultGuard(
  sessionManager: SessionManager,
  opts?: {
    /**
     * Optional transform applied to any message before persistence.
     */
    transformMessageForPersistence?: (message: AgentMessage) => AgentMessage;
    /**
     * Optional, synchronous transform applied to toolResult messages *before* they are
     * persisted to the session transcript.
     */
    transformToolResultForPersistence?: (
      message: AgentMessage,
      meta: { toolCallId?: string; toolName?: string; isSynthetic?: boolean },
    ) => AgentMessage;
    /**
     * Whether to synthesize missing tool results to satisfy strict providers.
     * Defaults to true.
     */
    allowSyntheticToolResults?: boolean;
    /**
     * Optional set/list of tool names accepted for assistant toolCall/toolUse blocks.
     * When set, tool calls with unknown names are dropped before persistence.
     */
    allowedToolNames?: Iterable<string>;
    /**
     * Synchronous hook invoked before any message is written to the session JSONL.
     * If the hook returns { block: true }, the message is silently dropped.
     * If it returns { message }, the modified message is written instead.
     */
    beforeMessageWriteHook?: (
      event: PluginHookBeforeMessageWriteEvent,
    ) => PluginHookBeforeMessageWriteResult | undefined;
  },
): {
  flushPendingToolResults: () => void;
  getPendingIds: () => string[];
} {
  const originalAppend = sessionManager.appendMessage.bind(sessionManager);
  const pending = new Map<string, string | undefined>();
  const turnTimingEnabled = isTurnTimingEnabled();
  const emitTurnTiming = (stage: string, extra?: Record<string, unknown>) => {
    if (!turnTimingEnabled) {
      return;
    }
    try {
      console.log(
        `[openclaw.turn] ${JSON.stringify({ stage, sessionKey: opts?.sessionKey, surface: "transcript", ...extra })}`,
      );
    } catch {}
  };
  const persistMessage = (message: AgentMessage) => {
    const transformer = opts?.transformMessageForPersistence;
    const transformed = transformer ? transformer(message) : message;
    return sanitizeVisibleTranscriptMessage(transformed);
  };

  const persistToolResult = (
    message: AgentMessage,
    meta: { toolCallId?: string; toolName?: string; isSynthetic?: boolean },
  ) => {
    const transformer = opts?.transformToolResultForPersistence;
    return transformer ? transformer(message, meta) : message;
  };

  const allowSyntheticToolResults = opts?.allowSyntheticToolResults ?? true;
  const beforeWrite = opts?.beforeMessageWriteHook;

  /**
   * Run the before_message_write hook. Returns the (possibly modified) message,
   * or null if the message should be blocked.
   */
  const applyBeforeWriteHook = (msg: AgentMessage): AgentMessage | null => {
    if (!beforeWrite) {
      return msg;
    }
    const result = beforeWrite({ message: msg });
    if (result?.block) {
      return null;
    }
    if (result?.message) {
      return result.message;
    }
    return msg;
  };

  const flushPendingToolResults = () => {
    if (pending.size === 0) {
      return;
    }
    if (allowSyntheticToolResults) {
      for (const [id, name] of pending.entries()) {
        const synthetic = makeMissingToolResult({ toolCallId: id, toolName: name });
        const flushed = applyBeforeWriteHook(
          persistToolResult(persistMessage(synthetic), {
            toolCallId: id,
            toolName: name,
            isSynthetic: true,
          }),
        );
        if (flushed) {
          originalAppend(flushed as never);
        }
      }
    }
    pending.clear();
  };

  const guardedAppend = (message: AgentMessage) => {
    let nextMessage = message;
    const role = (message as { role?: unknown }).role;
    if (role === "assistant") {
      const sanitized = sanitizeToolCallInputs([message], {
        allowedToolNames: opts?.allowedToolNames,
      });
      if (sanitized.length === 0) {
        if (allowSyntheticToolResults && pending.size > 0) {
          flushPendingToolResults();
        }
        return undefined;
      }
      nextMessage = sanitized[0];
      const fallbackResult = applyEmptyOutputFallback(nextMessage);
      nextMessage = fallbackResult.message;
      if (fallbackResult.fallbackUsed) {
        emitTurnTiming("empty_output_detected", {
          provider: (nextMessage as { provider?: unknown }).provider,
          model: (nextMessage as { model?: unknown }).model,
          empty_output: true,
          output_length: 0,
        });
        emitTurnTiming("fallback_used", {
          provider: (nextMessage as { provider?: unknown }).provider,
          model: (nextMessage as { model?: unknown }).model,
          empty_output: true,
          fallback_used: true,
          output_length: extractVisibleText(nextMessage).trim().length,
        });
      }
    }
    const nextRole = (nextMessage as { role?: unknown }).role;

    if (nextRole === "toolResult") {
      const id = extractToolResultId(nextMessage as Extract<AgentMessage, { role: "toolResult" }>);
      const toolName = id ? pending.get(id) : undefined;
      if (id) {
        pending.delete(id);
      }
      const normalizedToolResult = normalizePersistedToolResultName(nextMessage, toolName);
      // Apply hard size cap before persistence to prevent oversized tool results
      // from consuming the entire context window on subsequent LLM calls.
      const capped = capToolResultSize(persistMessage(normalizedToolResult));
      const persisted = applyBeforeWriteHook(
        persistToolResult(capped, {
          toolCallId: id ?? undefined,
          toolName,
          isSynthetic: false,
        }),
      );
      if (!persisted) {
        return undefined;
      }
      return originalAppend(persisted as never);
    }

    // Skip tool call extraction for aborted/errored assistant messages.
    // When stopReason is "error" or "aborted", the tool_use blocks may be incomplete
    // and should not have synthetic tool_results created. Creating synthetic results
    // for incomplete tool calls causes API 400 errors:
    // "unexpected tool_use_id found in tool_result blocks"
    // This matches the behavior in repairToolUseResultPairing (session-transcript-repair.ts)
    const stopReason = (nextMessage as { stopReason?: string }).stopReason;
    const toolCalls =
      nextRole === "assistant" && stopReason !== "aborted" && stopReason !== "error"
        ? extractToolCallsFromAssistant(nextMessage as Extract<AgentMessage, { role: "assistant" }>)
        : [];

    if (allowSyntheticToolResults) {
      // If previous tool calls are still pending, flush before non-tool results.
      if (pending.size > 0 && (toolCalls.length === 0 || nextRole !== "assistant")) {
        flushPendingToolResults();
      }
      // If new tool calls arrive while older ones are pending, flush the old ones first.
      if (pending.size > 0 && toolCalls.length > 0) {
        flushPendingToolResults();
      }
    }

    const finalMessage = applyBeforeWriteHook(persistMessage(nextMessage));
    if (!finalMessage) {
      return undefined;
    }
    if (finalMessage.role === "assistant") {
      const outputLength = extractVisibleText(finalMessage).trim().length;
      emitTurnTiming("generation_complete", {
        provider: (finalMessage as { provider?: unknown }).provider,
        model: (finalMessage as { model?: unknown }).model,
        output_length: outputLength,
        empty_output: outputLength === 0,
        fallback_used: Boolean(
          (finalMessage as { openclawSafeguard?: { emptyOutputFallback?: boolean } })
            .openclawSafeguard?.emptyOutputFallback,
        ),
      });
    }
    const result = originalAppend(finalMessage as never);

    const sessionFile = (
      sessionManager as { getSessionFile?: () => string | null }
    ).getSessionFile?.();
    if (sessionFile) {
      emitSessionTranscriptUpdate(sessionFile);
    }

    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        pending.set(call.id, call.name);
      }
    }

    return result;
  };

  // Monkey-patch appendMessage with our guarded version.
  sessionManager.appendMessage = guardedAppend as SessionManager["appendMessage"];

  return {
    flushPendingToolResults,
    getPendingIds: () => Array.from(pending.keys()),
  };
}
