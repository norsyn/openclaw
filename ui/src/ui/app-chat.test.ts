/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshChatAvatar, type ChatHost } from "./app-chat.ts";
import { resolvePreferredChatSessionKey } from "./app-render.helpers.ts";
import type { SessionsListResult } from "./types.ts";

function makeHost(overrides?: Partial<ChatHost>): ChatHost {
  return {
    client: null,
    chatMessages: [],
    chatStream: null,
    connected: true,
    chatMessage: "",
    chatAttachments: [],
    chatQueue: [],
    chatRunId: null,
    chatSending: false,
    lastError: null,
    sessionKey: "agent:main",
    basePath: "",
    hello: null,
    chatAvatarUrl: null,
    refreshSessionsAfterChat: new Set<string>(),
    ...overrides,
  };
}

type SessionRow = SessionsListResult["sessions"][number];

function row(overrides: Partial<SessionRow> & { key: string }): SessionRow {
  return { kind: "direct", updatedAt: 0, ...overrides };
}

function makeChatSelectionState(overrides: {
  sessionKey?: string;
  lastActiveSessionKey?: string;
  sessions?: SessionRow[];
  sessionDefaults?: { mainSessionKey?: string; mainKey?: string };
}) {
  return {
    sessionKey: overrides.sessionKey ?? "agent:main:main",
    settings: {
      lastActiveSessionKey: overrides.lastActiveSessionKey ?? "agent:main:main",
    },
    sessionsResult: overrides.sessions ? { sessions: overrides.sessions } : null,
    hello: overrides.sessionDefaults
      ? { snapshot: { sessionDefaults: overrides.sessionDefaults } }
      : null,
  } as never;
}

describe("refreshChatAvatar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a route-relative avatar endpoint before basePath bootstrap finishes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ avatarUrl: "/avatar/main" }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const host = makeHost({ basePath: "", sessionKey: "agent:main" });
    await refreshChatAvatar(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "avatar/main?meta=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.chatAvatarUrl).toBe("/avatar/main");
  });

  it("keeps mounted dashboard avatar endpoints under the normalized base path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const host = makeHost({ basePath: "/openclaw/", sessionKey: "agent:ops:main" });
    await refreshChatAvatar(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/avatar/ops?meta=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.chatAvatarUrl).toBeNull();
  });

  it("prefers the last active interactive session over a heartbeat-backed main session", () => {
    const state = makeChatSelectionState({
      sessionKey: "agent:main:main",
      lastActiveSessionKey: "agent:main:discord:channel:123",
      sessionDefaults: { mainSessionKey: "agent:main:main" },
      sessions: [
        row({
          key: "agent:main:main",
          displayName: "heartbeat",
          origin: { provider: "heartbeat" },
          updatedAt: 200,
        }),
        row({
          key: "agent:main:discord:channel:123",
          kind: "group",
          displayName: "discord:#general",
          origin: { provider: "discord", surface: "discord" },
          updatedAt: 100,
        }),
      ],
    });

    expect(resolvePreferredChatSessionKey(state)).toBe("agent:main:discord:channel:123");
  });

  it("falls back to the most recently updated non-heartbeat session when current and last active are heartbeat", () => {
    const state = makeChatSelectionState({
      sessionKey: "agent:main:main",
      lastActiveSessionKey: "agent:main:main",
      sessionDefaults: { mainSessionKey: "agent:main:main" },
      sessions: [
        row({
          key: "agent:main:main",
          displayName: "heartbeat",
          origin: { provider: "heartbeat" },
          updatedAt: 300,
        }),
        row({
          key: "agent:main:wave5-phase3:dashboard:active:test:1",
          displayName: "dashboard:test",
          origin: { provider: "webchat", surface: "webchat" },
          updatedAt: 250,
        }),
        row({
          key: "agent:main:discord:channel:123",
          kind: "group",
          displayName: "discord:#general",
          origin: { provider: "discord", surface: "discord" },
          updatedAt: 100,
        }),
      ],
    });

    expect(resolvePreferredChatSessionKey(state)).toBe(
      "agent:main:wave5-phase3:dashboard:active:test:1",
    );
  });
});
