import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveChannelModelOverride } from "./model-overrides.js";

describe("resolveChannelModelOverride", () => {
  const cases = [
    {
      name: "matches parent group id when topic suffix is present",
      input: {
        cfg: {
          channels: {
            modelByChannel: {
              telegram: {
                "-100123": "openai/gpt-4.1",
              },
            },
          },
        } as unknown as OpenClawConfig,
        channel: "telegram",
        groupId: "-100123:topic:99",
      },
      expected: { model: "openai/gpt-4.1", matchKey: "-100123" },
    },
    {
      name: "prefers topic-specific match over parent group id",
      input: {
        cfg: {
          channels: {
            modelByChannel: {
              telegram: {
                "-100123": "openai/gpt-4.1",
                "-100123:topic:99": "anthropic/claude-sonnet-4-6",
              },
            },
          },
        } as unknown as OpenClawConfig,
        channel: "telegram",
        groupId: "-100123:topic:99",
      },
      expected: { model: "anthropic/claude-sonnet-4-6", matchKey: "-100123:topic:99" },
    },
    {
      name: "falls back to parent session key when thread id does not match",
      input: {
        cfg: {
          channels: {
            modelByChannel: {
              discord: {
                "123": "openai/gpt-4.1",
              },
            },
          },
        } as unknown as OpenClawConfig,
        channel: "discord",
        groupId: "999",
        parentSessionKey: "agent:main:discord:channel:123:thread:456",
      },
      expected: { model: "openai/gpt-4.1", matchKey: "123" },
    },
    {
      name: "uses GPT front-door fallback for webchat when no explicit override exists",
      input: {
        cfg: {} as unknown as OpenClawConfig,
        channel: "webchat",
      },
      expected: { model: "openai/gpt-4.1", matchKey: "interactive:webchat" },
    },
    {
      name: "uses GPT front-door fallback for discord general when no explicit override exists",
      input: {
        cfg: {} as unknown as OpenClawConfig,
        channel: "discord",
        groupChannel: "#general",
      },
      expected: { model: "openai/gpt-4.1", matchKey: "general" },
    },
    {
      name: "uses configured Codex cloud fallback for discord general when OpenAI direct is not configured",
      input: {
        cfg: {
          agents: {
            defaults: {
              model: {
                primary: "ollama/qwen3:14b",
                fallbacks: ["openai-codex/gpt-5.3-codex"],
              },
            },
          },
        } as unknown as OpenClawConfig,
        channel: "discord",
        groupSubject: "#general",
      },
      expected: { model: "openai-codex/gpt-5.3-codex", matchKey: "general" },
    },
    {
      name: "explicit discord channel override beats interactive fallback",
      input: {
        cfg: {
          channels: {
            modelByChannel: {
              discord: {
                general: "ollama/qwen3:14b",
              },
            },
          },
          agents: {
            defaults: {
              model: {
                primary: "ollama/qwen3:14b",
                fallbacks: ["openai-codex/gpt-5.3-codex"],
              },
            },
          },
        } as unknown as OpenClawConfig,
        channel: "discord",
        groupChannel: "#general",
      },
      expected: { model: "ollama/qwen3:14b", matchKey: "general" },
    },
    {
      name: "keeps non-target discord channels on existing routing",
      input: {
        cfg: {
          agents: {
            defaults: {
              model: {
                primary: "ollama/qwen3:14b",
                fallbacks: ["openai-codex/gpt-5.3-codex"],
              },
            },
          },
        } as unknown as OpenClawConfig,
        channel: "discord",
        groupChannel: "#ops",
      },
      expected: null,
    },
  ] as const;

  for (const testCase of cases) {
    it(testCase.name, () => {
      const resolved = resolveChannelModelOverride(testCase.input);
      if (testCase.expected === null) {
        expect(resolved).toBeNull();
        return;
      }
      expect(resolved?.model).toBe(testCase.expected.model);
      expect(resolved?.matchKey).toBe(testCase.expected.matchKey);
    });
  }
});
