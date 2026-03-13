#!/usr/bin/env node

const args = process.argv.slice(2);

const readArg = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
};

const model = readArg("--model", "qwen3:14b");
const prompt = readArg("--prompt", "hi");
const baseUrl = readArg("--base-url", "http://127.0.0.1:11434").replace(/\/+$/, "");

const startedAt = Date.now();
const response = await fetch(`${baseUrl}/api/chat`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!response.ok || !response.body) {
  const body = await response.text().catch(() => "");
  throw new Error(`Direct Ollama probe failed (${response.status}): ${body}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let firstTokenAt;
let completedAt = startedAt;
let contentChars = 0;
let streamChunkCount = 0;
let incrementalTokensObserved = false;
let finalChunk = null;

outer: while (true) {
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
    const chunk = JSON.parse(trimmed);
    streamChunkCount += 1;
    const text = chunk.message?.content || chunk.message?.reasoning || "";
    if (text || chunk.message?.tool_calls?.length) {
      contentChars += text.length;
      if (!firstTokenAt) {
        firstTokenAt = Date.now();
      } else {
        incrementalTokensObserved = true;
      }
    }
    if (chunk.done) {
      finalChunk = chunk;
      completedAt = Date.now();
      break outer;
    }
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      model,
      prompt,
      baseUrl,
      requestStartedAt: new Date(startedAt).toISOString(),
      firstTokenAt: firstTokenAt ? new Date(firstTokenAt).toISOString() : null,
      completedAt: new Date(completedAt).toISOString(),
      firstTokenLatencyMs: firstTokenAt ? firstTokenAt - startedAt : null,
      completionLatencyMs: completedAt - startedAt,
      streamChunkCount,
      incrementalTokensObserved,
      contentChars,
      loadDurationMs:
        typeof finalChunk?.load_duration === "number"
          ? Math.round(finalChunk.load_duration / 1_000_000)
          : null,
      promptEvalCount: finalChunk?.prompt_eval_count ?? null,
      evalCount: finalChunk?.eval_count ?? null,
      promptEvalDurationMs:
        typeof finalChunk?.prompt_eval_duration === "number"
          ? Math.round(finalChunk.prompt_eval_duration / 1_000_000)
          : null,
      evalDurationMs:
        typeof finalChunk?.eval_duration === "number"
          ? Math.round(finalChunk.eval_duration / 1_000_000)
          : null,
    },
    null,
    2,
  )}\n`,
);
