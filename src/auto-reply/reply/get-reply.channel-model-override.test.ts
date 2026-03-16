import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../templating.js";
import { registerGetReplyCommonMocks } from "./get-reply.test-mocks.js";

const mocks = vi.hoisted(() => ({
  resolveReplyDirectives: vi.fn(),
  initSessionState: vi.fn(),
}));

registerGetReplyCommonMocks();

vi.mock("../../link-understanding/apply.js", () => ({
  applyLinkUnderstanding: vi.fn(async () => undefined),
}));
vi.mock("../../media-understanding/apply.js", () => ({
  applyMediaUnderstanding: vi.fn(async () => undefined),
}));
vi.mock("./commands-core.js", () => ({
  emitResetCommandHooks: vi.fn(async () => undefined),
}));
vi.mock("./get-reply-directives.js", () => ({
  resolveReplyDirectives: (...args: unknown[]) => mocks.resolveReplyDirectives(...args),
}));
vi.mock("./get-reply-inline-actions.js", () => ({
  handleInlineActions: vi.fn(async () => ({ kind: "continue" })),
}));
vi.mock("./session.js", () => ({
  initSessionState: (...args: unknown[]) => mocks.initSessionState(...args),
}));

const { getReplyFromConfig } = await import("./get-reply.js");
const { resolveChannelModelOverride } = await import("../../channels/model-overrides.js");
const { resolveModelRefFromString } = await import("../../agents/model-selection.js");

function buildCtx(overrides: Partial<MsgContext> = {}): MsgContext {
  return {
    Provider: "discord",
    Surface: "discord",
    OriginatingChannel: "discord",
    ChatType: "group",
    Body: "hi",
    RawBody: "hi",
    CommandBody: "hi",
    SessionKey: "agent:main:discord:channel:1456350065223270435",
    From: "discord:user:42",
    To: "discord:channel:1456350065223270435",
    GroupChannel: "#general",
    GroupSubject: "#general",
    ...overrides,
  };
}

describe("getReplyFromConfig channel model override wiring", () => {
  beforeEach(() => {
    mocks.resolveReplyDirectives.mockReset();
    mocks.initSessionState.mockReset();
    vi.mocked(resolveChannelModelOverride).mockReset();
    vi.mocked(resolveModelRefFromString).mockReset();

    mocks.resolveReplyDirectives.mockResolvedValue({ kind: "reply", reply: { text: "ok" } });
    vi.mocked(resolveChannelModelOverride).mockReturnValue({
      channel: "discord",
      model: "openai-codex/gpt-5.3-codex",
      matchKey: "general",
      matchSource: "direct",
    });
    vi.mocked(resolveModelRefFromString).mockReturnValue({
      ref: { provider: "openai-codex", model: "gpt-5.3-codex" },
    });
    mocks.initSessionState.mockResolvedValue({
      sessionCtx: {},
      sessionEntry: {},
      previousSessionEntry: {},
      sessionStore: {},
      sessionKey: "agent:main:discord:channel:1456350065223270435",
      sessionId: "session-1",
      isNewSession: false,
      resetTriggered: false,
      systemSent: false,
      abortedLastRun: false,
      storePath: "/tmp/sessions.json",
      sessionScope: "per-chat",
      groupResolution: { id: "1456350065223270435", channel: "discord" },
      isGroup: true,
      triggerBodyNormalized: "hi",
      bodyStripped: "hi",
    });
  });

  it("uses the channel override hook on the live discord reply path", async () => {
    await getReplyFromConfig(buildCtx(), undefined, {} as never);

    expect(resolveChannelModelOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "discord",
        groupId: "1456350065223270435",
        groupChannel: "#general",
        groupSubject: "#general",
      }),
    );
    expect(mocks.resolveReplyDirectives).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai-codex",
        model: "gpt-5.3-codex",
      }),
    );
  });

  it("keeps explicit session overrides ahead of the channel fallback gate", async () => {
    mocks.initSessionState.mockResolvedValueOnce({
      sessionCtx: {},
      sessionEntry: {
        providerOverride: "anthropic",
        modelOverride: "claude-opus-4-5",
      },
      previousSessionEntry: {},
      sessionStore: {},
      sessionKey: "agent:main:discord:channel:1456350065223270435",
      sessionId: "session-1",
      isNewSession: false,
      resetTriggered: false,
      systemSent: false,
      abortedLastRun: false,
      storePath: "/tmp/sessions.json",
      sessionScope: "per-chat",
      groupResolution: { id: "1456350065223270435", channel: "discord" },
      isGroup: true,
      triggerBodyNormalized: "hi",
      bodyStripped: "hi",
    });

    await getReplyFromConfig(buildCtx(), undefined, {} as never);

    expect(resolveModelRefFromString).not.toHaveBeenCalled();
    expect(mocks.resolveReplyDirectives).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    );
  });
});
