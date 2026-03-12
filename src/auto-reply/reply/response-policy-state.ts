import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";

export type ResponsePolicyMode = "off" | "shadow" | "adaptive";

export type ResponsePolicyStateEntry = {
  key: string;
  promptPreview: string;
  preferredProfile?: "direct" | "fast";
  evidence: {
    directSuccessCount: number;
    fastSuccessCount: number;
    deepSuccessCount: number;
    noToolCount: number;
    noRetrievalCount: number;
    fallbackCount: number;
    toolRequiredCount: number;
    retrievalRequiredCount: number;
    ambiguityCount: number;
  };
  recent: {
    lastClassifierProfile: "fast" | "deep";
    lastSelectedProfile: "direct" | "fast" | "deep";
    lastOverrideReasonCodes: string[];
    lastFallbackTriggered: boolean;
    lastOverrideApplied: boolean;
    lastShadowOnly: boolean;
    lastPolicyMode: ResponsePolicyMode;
    lastUpdatedAt: number;
    cooldownUntil?: number;
  };
};

export type ResponsePolicyStateStore = {
  version: 1;
  mode: ResponsePolicyMode;
  updatedAt: number;
  entries: Record<string, ResponsePolicyStateEntry>;
};

export const RESPONSE_POLICY_STATE_VERSION = 1;
export const RESPONSE_POLICY_STATE_MAX_ENTRIES = 200;

function isValidMode(value: string | undefined): value is ResponsePolicyMode {
  return value === "off" || value === "shadow" || value === "adaptive";
}

export function resolveResponsePolicyMode(
  env: NodeJS.ProcessEnv = process.env,
): ResponsePolicyMode {
  const raw = env.OPENCLAW_RESPONSE_POLICY_MODE?.trim().toLowerCase();
  return isValidMode(raw) ? raw : "shadow";
}

export function resolveResponsePolicyStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, os.homedir);
  return path.join(stateDir, "response-policy", "state.v1.json");
}

export function createEmptyResponsePolicyStateStore(
  mode: ResponsePolicyMode = resolveResponsePolicyMode(),
): ResponsePolicyStateStore {
  return {
    version: RESPONSE_POLICY_STATE_VERSION,
    mode,
    updatedAt: 0,
    entries: {},
  };
}

function parseEntry(input: unknown): ResponsePolicyStateEntry | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const value = input as Record<string, unknown>;
  const evidence = (value.evidence ?? {}) as Record<string, unknown>;
  const recent = (value.recent ?? {}) as Record<string, unknown>;
  const key = typeof value.key === "string" ? value.key : "";
  const promptPreview = typeof value.promptPreview === "string" ? value.promptPreview : "";
  if (!key || !promptPreview) {
    return null;
  }
  const preferredProfile =
    value.preferredProfile === "direct" || value.preferredProfile === "fast"
      ? value.preferredProfile
      : undefined;
  const lastClassifierProfile = recent.lastClassifierProfile === "fast" ? "fast" : "deep";
  const lastSelectedProfile =
    recent.lastSelectedProfile === "direct" ||
    recent.lastSelectedProfile === "fast" ||
    recent.lastSelectedProfile === "deep"
      ? recent.lastSelectedProfile
      : "deep";
  const lastPolicyMode = isValidMode(
    typeof recent.lastPolicyMode === "string" ? recent.lastPolicyMode : undefined,
  )
    ? (recent.lastPolicyMode as ResponsePolicyMode)
    : "shadow";
  return {
    key,
    promptPreview,
    preferredProfile,
    evidence: {
      directSuccessCount:
        typeof evidence.directSuccessCount === "number" ? evidence.directSuccessCount : 0,
      fastSuccessCount:
        typeof evidence.fastSuccessCount === "number" ? evidence.fastSuccessCount : 0,
      deepSuccessCount:
        typeof evidence.deepSuccessCount === "number" ? evidence.deepSuccessCount : 0,
      noToolCount: typeof evidence.noToolCount === "number" ? evidence.noToolCount : 0,
      noRetrievalCount:
        typeof evidence.noRetrievalCount === "number" ? evidence.noRetrievalCount : 0,
      fallbackCount: typeof evidence.fallbackCount === "number" ? evidence.fallbackCount : 0,
      toolRequiredCount:
        typeof evidence.toolRequiredCount === "number" ? evidence.toolRequiredCount : 0,
      retrievalRequiredCount:
        typeof evidence.retrievalRequiredCount === "number" ? evidence.retrievalRequiredCount : 0,
      ambiguityCount: typeof evidence.ambiguityCount === "number" ? evidence.ambiguityCount : 0,
    },
    recent: {
      lastClassifierProfile,
      lastSelectedProfile,
      lastOverrideReasonCodes: Array.isArray(recent.lastOverrideReasonCodes)
        ? recent.lastOverrideReasonCodes.filter((item): item is string => typeof item === "string")
        : [],
      lastFallbackTriggered: recent.lastFallbackTriggered === true,
      lastOverrideApplied: recent.lastOverrideApplied === true,
      lastShadowOnly: recent.lastShadowOnly === true,
      lastPolicyMode,
      lastUpdatedAt: typeof recent.lastUpdatedAt === "number" ? recent.lastUpdatedAt : 0,
      cooldownUntil: typeof recent.cooldownUntil === "number" ? recent.cooldownUntil : undefined,
    },
  };
}

function parseStore(raw: string, mode: ResponsePolicyMode): ResponsePolicyStateStore {
  try {
    const parsed = JSON.parse(raw) as Partial<ResponsePolicyStateStore> & {
      entries?: Record<string, unknown>;
    };
    if (parsed?.version !== RESPONSE_POLICY_STATE_VERSION) {
      return createEmptyResponsePolicyStateStore(mode);
    }
    const entries: Record<string, ResponsePolicyStateEntry> = {};
    for (const [key, value] of Object.entries(parsed.entries ?? {})) {
      const entry = parseEntry(value);
      if (entry && entry.key === key) {
        entries[key] = entry;
      }
    }
    return pruneResponsePolicyStateStore({
      version: RESPONSE_POLICY_STATE_VERSION,
      mode,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      entries,
    });
  } catch {
    return createEmptyResponsePolicyStateStore(mode);
  }
}

export function pruneResponsePolicyStateStore(
  store: ResponsePolicyStateStore,
  maxEntries = RESPONSE_POLICY_STATE_MAX_ENTRIES,
): ResponsePolicyStateStore {
  const entries = Object.values(store.entries);
  if (entries.length <= maxEntries) {
    return store;
  }
  const kept = entries
    .toSorted((left, right) => right.recent.lastUpdatedAt - left.recent.lastUpdatedAt)
    .slice(0, maxEntries);
  return {
    ...store,
    entries: Object.fromEntries(kept.map((entry) => [entry.key, entry])),
  };
}

export async function deleteResponsePolicyStateFile(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = resolveResponsePolicyStatePath(env);
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // Best-effort reset only.
  }
}

async function maybeResetResponsePolicyState(env: NodeJS.ProcessEnv): Promise<void> {
  if (env.OPENCLAW_RESPONSE_POLICY_RESET !== "1") {
    return;
  }
  await deleteResponsePolicyStateFile(env);
}

export async function loadResponsePolicyState(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResponsePolicyStateStore> {
  const mode = resolveResponsePolicyMode(env);
  await maybeResetResponsePolicyState(env);
  const filePath = resolveResponsePolicyStatePath(env);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseStore(raw, mode);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return createEmptyResponsePolicyStateStore(mode);
    }
    return createEmptyResponsePolicyStateStore(mode);
  }
}

export async function writeResponsePolicyState(
  store: ResponsePolicyStateStore,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const filePath = resolveResponsePolicyStatePath(env);
  const dir = path.dirname(filePath);
  const normalized = pruneResponsePolicyStateStore({
    ...store,
    mode: resolveResponsePolicyMode(env),
  });
  const tmpFile = path.join(dir, `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(tmpFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  await fs.chmod(tmpFile, 0o600);
  await fs.rename(tmpFile, filePath);
}
