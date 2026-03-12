import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withStateDirEnv } from "../../test-helpers/state-dir-env.js";
import {
  RESPONSE_POLICY_STATE_MAX_ENTRIES,
  createEmptyResponsePolicyStateStore,
  loadResponsePolicyState,
  resolveResponsePolicyStatePath,
  writeResponsePolicyState,
} from "./response-policy-state.js";

describe("response-policy-state", () => {
  it("defaults to shadow mode for first rollout", async () => {
    await withStateDirEnv("response-policy-state-", async () => {
      delete process.env.OPENCLAW_RESPONSE_POLICY_MODE;
      const store = await loadResponsePolicyState();
      expect(store.mode).toBe("shadow");
      expect(store.entries).toEqual({});
    });
  });

  it("loads empty state when the file is corrupt", async () => {
    await withStateDirEnv("response-policy-state-", async () => {
      const filePath = resolveResponsePolicyStatePath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, "{not json}\n", "utf-8");

      const store = await loadResponsePolicyState();
      expect(store.entries).toEqual({});
      expect(store.mode).toBe("shadow");
    });
  });

  it("persists state under OPENCLAW_STATE_DIR and resets via env flag", async () => {
    await withStateDirEnv("response-policy-state-", async () => {
      const store = createEmptyResponsePolicyStateStore("adaptive");
      store.updatedAt = 1;
      store.entries.alpha = {
        key: "alpha",
        promptPreview: "alpha",
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

      const loaded = await loadResponsePolicyState();
      expect(loaded.entries.alpha?.preferredProfile).toBe("fast");

      process.env.OPENCLAW_RESPONSE_POLICY_RESET = "1";
      const resetLoaded = await loadResponsePolicyState();
      expect(resetLoaded.entries).toEqual({});
      delete process.env.OPENCLAW_RESPONSE_POLICY_RESET;
    });
  });

  it("prunes least recently updated entries first", async () => {
    await withStateDirEnv("response-policy-state-", async () => {
      const store = createEmptyResponsePolicyStateStore("shadow");
      for (let index = 0; index < RESPONSE_POLICY_STATE_MAX_ENTRIES + 2; index += 1) {
        const key = `key-${index}`;
        store.entries[key] = {
          key,
          promptPreview: key,
          evidence: {
            directSuccessCount: 0,
            fastSuccessCount: 0,
            deepSuccessCount: 0,
            noToolCount: 0,
            noRetrievalCount: 0,
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
            lastShadowOnly: false,
            lastPolicyMode: "shadow",
            lastUpdatedAt: index,
          },
        };
      }
      await writeResponsePolicyState(store);

      const loaded = await loadResponsePolicyState();
      expect(Object.keys(loaded.entries)).toHaveLength(RESPONSE_POLICY_STATE_MAX_ENTRIES);
      expect(loaded.entries["key-0"]).toBeUndefined();
      expect(loaded.entries["key-1"]).toBeUndefined();
    });
  });
});
