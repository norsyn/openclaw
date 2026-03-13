# Runtime Stability Investigation

## 1. Gateway websocket lifecycle analysis

- The gateway WebSocket implementation already closes with explicit codes for normal handshake and auth failures in `src/gateway/server/ws-connection.ts` and `src/gateway/server/ws-connection/message-handler.ts`.
- The repeated client-observed `1006 abnormal closure` is therefore not primarily caused by an intentional gateway close frame. It is consistent with the socket dropping underneath the client after accept.
- The strongest runtime evidence comes from the live gateway stderr log in `~/.openclaw/logs/gateway.err.log`: repeated unhandled promise rejections coincide with the Phase 3 validation window and are followed by the gateway reloading plugins and reinitializing the service.
- A representative failure is:

```text
Unhandled promise rejection: ReferenceError: emitTurnTiming is not defined
  at run (/opt/homebrew/lib/node_modules/openclaw/dist/model-selection-CABoKLxu.js:13636:5)
```

- Inspecting the installed runtime bundle shows the failing code is inside the Ollama stream adapter, where `emitTurnTiming` is declared inside the `try` block but is also referenced from the `catch` block. That scope error converts any underlying model/request failure into an unhandled rejection in the gateway process.
- The current repo source at `src/agents/ollama-stream.ts` no longer has that exact bug shape, which means the live gateway was running a stale installed runtime bundle rather than the current repo build. That source/runtime drift is itself part of the operational problem.
- A second gateway-destabilizing error is present in the same stderr log:

```text
Uncaught exception: Error: ENOENT: no such file or directory, mkdir '/data/raw-traces'
  at appendRawTrace (.../Jo/packages/jotelemetry/dist/src/exporters/raw_trace.js:5:8)
```

- That exception originates from the Jo telemetry heartbeat integration and can also tear down the live process without a close frame.
- I added a temporary structured open-connection log in `src/gateway/server/ws-connection.ts` so the next live run records the connection metadata at accept time before any downstream failure.

## 2. Agent runner execution trace

- `agent.wait` is driven by lifecycle events in `src/gateway/server-methods/agent-job.ts`.
- It only resolves when the embedded run emits lifecycle `start` followed by lifecycle `end` or `error` from `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts`.
- The embedded run does emit those lifecycle events in the normal path, so the repeated `agent.wait` timeouts are better explained by the run never reaching `handleAgentEnd`, or the gateway dying before the terminal lifecycle event can be observed.
- The stderr evidence supports the latter: when the live runtime hits the Ollama stream error-path scope bug, the process throws an unhandled rejection instead of returning a structured model error through the run loop.
- That interrupts the agent-runner execution chain before the terminal lifecycle event can be recorded, which leaves `waitForAgentJob()` with no terminal snapshot and produces the observed timeout result.
- There is also evidence of queue pressure during the same period:

```text
[diagnostic] lane wait exceeded: lane=main waitedMs=46100 queueAhead=0
```

- That is consistent with the main execution lane waiting on stuck or restarted work, but it does not look like the first cause. It looks like fallout from the runtime faults.
- I added temporary structured logs in `src/agents/pi-embedded-runner/run/attempt.ts` for tool-registry initialization and system-prompt report creation so the next run can prove whether execution made it past prompt assembly before stalling.

## 3. Ollama streaming analysis

- The current repo source in `src/agents/ollama-stream.ts` is the most relevant runtime hotspot.
- The live installed bundle clearly contains a scope bug in the Ollama adapter error path: the `catch` block calls `emitTurnTiming(...)`, but the helper is declared inside the `try` block and is therefore out of scope when an error occurs.
- That means any underlying request failure to Ollama, including network interruption, empty body, non-OK HTTP response, or stream parsing failure, can be transformed into a `ReferenceError` that bypasses the intended structured stream error handling.
- That behavior explains all of the following Phase 3 symptoms together:
  - no usable assistant response
  - missing lifecycle terminal event
  - `agent.wait` timeout
  - client-side `1006` if the gateway process restarts or the request context collapses mid-stream
- The source repo has now been patched so `turnTimingEnabled`, `emitTurnTiming`, and `startedAt` are defined outside the `try` block and remain available in the `catch` path.
- I also added temporary structured request-start, request-complete, and request-error logs in `src/agents/ollama-stream.ts`.
- I added a regression test in `src/agents/ollama-stream.test.ts` that forces a fetch failure with `OPENCLAW_TURN_TIMING=1` and asserts that the adapter emits a normal stream `error` event rather than crashing the error path.

## 4. Tool system initialization results

- Tool registry initialization happens in `src/agents/pi-embedded-runner/run/attempt.ts` via `createOpenClawCodingTools(...)`, followed by client-tool adaptation and allowlist filtering.
- There is no direct evidence from the repo source that tool initialization is silently throwing in the common path.
- The Phase 3 stderr log does not show tool-registry exceptions. Instead, it shows the model request path and external plugin errors.
- The tool system therefore looks secondary, not primary, for this incident.
- However, because the Phase 3 runs often failed before persistence completed, tool exposure data was missing downstream. To make this visible in the next pass, I added a temporary structured `runtime stability tool registry initialized` log after tool assembly with:
  - exposed tool count
  - client tool count
  - tool allowlist count
  - provider/model identity

## 5. systemPromptReport persistence behavior

- `systemPromptReport` is built eagerly in `src/agents/pi-embedded-runner/run/attempt.ts` before session startup and prompt dispatch.
- The builder in `src/agents/system-prompt-report.ts` is deterministic and does not do I/O. There is no sign that serialization itself is failing.
- Persistence happens later through the session update path in `src/auto-reply/reply/session-usage.ts` and `src/auto-reply/reply/agent-runner.ts`.
- That means the report can be successfully constructed but still never appear in `sessions.usage` if the run fails or the gateway process restarts before the usage/session patch is written.
- This matches the Phase 3 behavior exactly: the prompt report was missing across `off`, `shadow`, and `active`, but the failure was cross-mode and tied to runtime faults rather than Wave 5 gating.
- The stderr log supports this ordering: the runtime faults occur during the same runs that later show no `contextWeight` payload.
- I added a temporary structured `runtime stability system prompt report created` log in `src/agents/pi-embedded-runner/run/attempt.ts` so the next validation pass can distinguish:
  - report never created
  - report created but not persisted
  - report persisted and later unreadable

## 6. Root cause hypothesis

- Primary root cause: the live gateway was running an installed OpenClaw bundle with a stale Ollama stream error-path bug. When Ollama request handling throws, the adapter hits `ReferenceError: emitTurnTiming is not defined`, which converts a recoverable model-stream failure into an unhandled runtime rejection.
- Likely user-visible effect of that primary bug:
  - the agent run fails before it can emit a terminal lifecycle event
  - `agent.wait` times out
  - session usage and `systemPromptReport` persistence often never happen
  - the client sees `1006` because the socket drops without a close frame during process instability or restart
- Secondary root cause: the Jo telemetry heartbeat path can also crash the live runtime with `ENOENT: mkdir '/data/raw-traces'` when the external telemetry/export directory is invalid for the running environment.
- Contributing factors:
  - the live gateway is using the globally installed runtime, not a rebuilt package from the current repo source
  - the default live Ollama model has a relatively small configured context window (`16384`), which increases the chance of slow or fragile turns under large tool/system-prompt loads
  - archive ingest failures from the Jo plugin stack are noisy but do not appear to be the primary trigger for the `1006`/timeout pattern

## 7. Recommended fix plan

1. Rebuild and redeploy the live gateway from the current repo source instead of continuing to test the stale installed bundle. The current source no longer matches the failing installed chunk.
2. Ship the Ollama adapter fix in `src/agents/ollama-stream.ts` and verify the installed runtime no longer throws `emitTurnTiming is not defined` under forced request failure.
3. Keep the temporary runtime-stability logs enabled for the next validation pass so the exact failure stage is visible in plain logs:
   - WebSocket open metadata
   - tool registry initialized
   - system prompt report created
   - Ollama request start/complete/error
4. In the Jo repo, fix the telemetry exporter/input so it does not throw on `/data/raw-traces` when that path is absent. That extension-side uncaught exception can independently destabilize the gateway.
5. Re-run the Phase 3 matrix only after both runtime crash sources are addressed. The success criteria for the rerun should be:
   - no unhandled promise rejection in gateway stderr
   - no uncaught exception from Jo telemetry heartbeat
   - `agent.wait` returns terminal `ok` or structured `error` instead of timeout
   - `sessions.usage(includeContextWeight=true)` returns a populated `systemPromptReport`
   - dashboard and terminal surfaces show the same lifecycle completion behavior
