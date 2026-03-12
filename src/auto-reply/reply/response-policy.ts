import type { ReplyPayload } from "../types.js";
import {
  buildResponsePolicyPromptPreview,
  hasAdaptiveDirectReply,
  hasResponsePolicyContinuityCue,
  hasResponsePolicyOperationalCue,
  isCuratedDeepToFastCandidate,
  normalizeResponsePolicyPrompt,
  resolveAdaptiveDirectReply,
} from "./response-policy-rules.js";
import type { ResponsePolicyMode, ResponsePolicyStateEntry } from "./response-policy-state.js";
import {
  loadResponsePolicyState,
  resolveResponsePolicyMode,
  writeResponsePolicyState,
} from "./response-policy-state.js";

export type ResponsePolicyProfile = "direct" | "fast" | "deep";

export type ResponsePolicyOverrideReasonCode =
  | "stable_direct_pattern"
  | "repeated_fast_success"
  | "curated_fast_candidate"
  | "preferred_profile_state"
  | "attachment_present"
  | "slash_command"
  | "continuity_detected"
  | "operational_intent_detected"
  | "protected_deep_trigger"
  | "cooldown_active"
  | "insufficient_evidence"
  | "fallback_risk"
  | "tool_required"
  | "retrieval_required"
  | "ambiguity_high"
  | "direct_pattern_unstable"
  | "adaptive_state_reset"
  | "policy_disabled"
  | "policy_shadow_mode"
  | "policy_state_missing"
  | "policy_state_corrupt";

export type ResponsePolicyClassifierSnapshot = {
  mode: "fast" | "deep";
  disableTools: boolean;
  toolNameAllowlist?: string[];
  directReplyEligible: boolean;
};

export type ResponsePolicyDecision = {
  policyVersion: "wave3-phase2";
  policyMode: ResponsePolicyMode;
  shadowOnly: boolean;
  prompt: string;
  promptPreview: string;
  normalizedKey: string;
  hasAttachments: boolean;
  isSlashCommand: boolean;
  classifier: ResponsePolicyClassifierSnapshot;
  classifierProfile: "fast" | "deep";
  statePreferredProfile?: "direct" | "fast";
  candidateProfile?: ResponsePolicyProfile;
  selectedProfile: ResponsePolicyProfile;
  overrideApplied: boolean;
  overrideReasonCodes: ResponsePolicyOverrideReasonCode[];
};

export type ResponsePolicyTurnOutcome = {
  latencyMs: number;
  retrievalUsed: boolean;
  toolsUsed: boolean;
  toolNames: string[];
  fallbackTriggered: boolean;
  responseLength: number;
};

export type ResponsePolicyDecisionEvent = ResponsePolicyDecision & {
  eventType: "decision";
};

export type ResponsePolicyOutcomeEvent = ResponsePolicyDecision &
  ResponsePolicyTurnOutcome & {
    eventType: "outcome";
  };

const DIRECT_SUCCESS_THRESHOLD = 3;
const FAST_SUCCESS_THRESHOLD = 5;
const COOL_DOWN_MS = 15 * 60 * 1000;

function buildBaseSelectedProfile(
  classifier: ResponsePolicyClassifierSnapshot,
): ResponsePolicyProfile {
  return classifier.directReplyEligible ? "direct" : classifier.mode;
}

function entryHasCooldown(
  entry: ResponsePolicyStateEntry | null | undefined,
  now = Date.now(),
): boolean {
  return typeof entry?.recent.cooldownUntil === "number" && entry.recent.cooldownUntil > now;
}

function hasPromotionRisk(entry: ResponsePolicyStateEntry | null | undefined): boolean {
  if (!entry) {
    return false;
  }
  return (
    entry.evidence.fallbackCount > 0 ||
    entry.evidence.toolRequiredCount > 0 ||
    entry.evidence.retrievalRequiredCount > 0 ||
    entry.evidence.ambiguityCount > 0
  );
}

function buildHardBlockerReasonCodes(params: {
  normalizedPrompt: string;
  hasAttachments: boolean;
  isSlashCommand: boolean;
}): ResponsePolicyOverrideReasonCode[] {
  const reasons: ResponsePolicyOverrideReasonCode[] = [];
  if (params.hasAttachments) {
    reasons.push("attachment_present");
  }
  if (params.isSlashCommand) {
    reasons.push("slash_command");
  }
  if (hasResponsePolicyContinuityCue(params.normalizedPrompt)) {
    reasons.push("continuity_detected");
  }
  if (hasResponsePolicyOperationalCue(params.normalizedPrompt)) {
    reasons.push("operational_intent_detected");
  }
  return reasons;
}

function resolveCandidateProfile(params: {
  baseSelectedProfile: ResponsePolicyProfile;
  normalizedPrompt: string;
  policyMode: ResponsePolicyMode;
  stateEntry: ResponsePolicyStateEntry | null;
  hardBlockerReasonCodes: ResponsePolicyOverrideReasonCode[];
}): {
  candidateProfile?: ResponsePolicyProfile;
  reasonCodes: ResponsePolicyOverrideReasonCode[];
} {
  if (params.hardBlockerReasonCodes.length > 0) {
    if (params.baseSelectedProfile !== "deep") {
      return {
        candidateProfile: "deep",
        reasonCodes: [...params.hardBlockerReasonCodes, "protected_deep_trigger"],
      };
    }
    return {
      reasonCodes: [...params.hardBlockerReasonCodes, "protected_deep_trigger"],
    };
  }

  if (entryHasCooldown(params.stateEntry)) {
    return {
      reasonCodes: ["cooldown_active"],
    };
  }

  if (params.baseSelectedProfile === "fast") {
    if (!params.stateEntry?.preferredProfile || params.stateEntry.preferredProfile !== "direct") {
      return {
        reasonCodes: ["insufficient_evidence"],
      };
    }
    if (!hasAdaptiveDirectReply(params.normalizedPrompt) || hasPromotionRisk(params.stateEntry)) {
      return {
        reasonCodes: hasPromotionRisk(params.stateEntry)
          ? ["fallback_risk"]
          : ["insufficient_evidence"],
      };
    }
    if (params.stateEntry.evidence.fastSuccessCount < DIRECT_SUCCESS_THRESHOLD) {
      return {
        reasonCodes: ["insufficient_evidence"],
      };
    }
    return {
      candidateProfile: "direct",
      reasonCodes: ["preferred_profile_state", "stable_direct_pattern", "repeated_fast_success"],
    };
  }

  if (params.baseSelectedProfile === "deep") {
    if (!params.stateEntry?.preferredProfile || params.stateEntry.preferredProfile !== "fast") {
      return {
        reasonCodes: ["insufficient_evidence"],
      };
    }
    if (!isCuratedDeepToFastCandidate(params.normalizedPrompt)) {
      return {
        reasonCodes: ["insufficient_evidence"],
      };
    }
    if (hasPromotionRisk(params.stateEntry)) {
      return {
        reasonCodes: ["fallback_risk"],
      };
    }
    if (params.stateEntry.evidence.deepSuccessCount < FAST_SUCCESS_THRESHOLD) {
      return {
        reasonCodes: ["insufficient_evidence"],
      };
    }
    return {
      candidateProfile: "fast",
      reasonCodes: ["preferred_profile_state", "curated_fast_candidate", "repeated_fast_success"],
    };
  }

  return {
    reasonCodes: [],
  };
}

function incrementProfileSuccessCount(
  entry: ResponsePolicyStateEntry,
  profile: ResponsePolicyProfile,
): void {
  if (profile === "direct") {
    entry.evidence.directSuccessCount += 1;
    return;
  }
  if (profile === "fast") {
    entry.evidence.fastSuccessCount += 1;
    return;
  }
  entry.evidence.deepSuccessCount += 1;
}

export function createResponsePolicyClassifierSnapshot(input: {
  mode: "fast" | "deep";
  disableTools: boolean;
  toolNameAllowlist?: string[];
  directReplyEligible: boolean;
}): ResponsePolicyClassifierSnapshot {
  return {
    mode: input.mode,
    disableTools: input.disableTools,
    toolNameAllowlist: input.toolNameAllowlist ? [...input.toolNameAllowlist] : undefined,
    directReplyEligible: input.directReplyEligible,
  };
}

export function createEmptyResponsePolicyStateEntry(params: {
  key: string;
  promptPreview: string;
}): ResponsePolicyStateEntry {
  return {
    key: params.key,
    promptPreview: params.promptPreview,
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
      lastUpdatedAt: 0,
    },
  };
}

export function resolveResponsePolicyDecision(input: {
  prompt: string;
  hasAttachments: boolean;
  isSlashCommand: boolean;
  classifier: ResponsePolicyClassifierSnapshot;
  policyMode?: ResponsePolicyMode;
  stateEntry?: ResponsePolicyStateEntry | null;
}): ResponsePolicyDecision {
  const normalizedKey = normalizeResponsePolicyPrompt(input.prompt);
  const promptPreview = buildResponsePolicyPromptPreview(normalizedKey);
  const policyMode = input.policyMode ?? resolveResponsePolicyMode();
  const baseSelectedProfile = buildBaseSelectedProfile(input.classifier);
  const hardBlockerReasonCodes = buildHardBlockerReasonCodes({
    normalizedPrompt: normalizedKey,
    hasAttachments: input.hasAttachments,
    isSlashCommand: input.isSlashCommand,
  });

  let candidateProfile: ResponsePolicyProfile | undefined;
  let reasonCodes: ResponsePolicyOverrideReasonCode[] = [];

  if (policyMode !== "off") {
    const resolved = resolveCandidateProfile({
      baseSelectedProfile,
      normalizedPrompt: normalizedKey,
      policyMode,
      stateEntry: input.stateEntry ?? null,
      hardBlockerReasonCodes,
    });
    candidateProfile = resolved.candidateProfile;
    reasonCodes = resolved.reasonCodes;
  }

  const overrideApplied =
    policyMode === "adaptive" && !!candidateProfile && candidateProfile !== baseSelectedProfile;
  const shadowOnly =
    policyMode === "shadow" && !!candidateProfile && candidateProfile !== baseSelectedProfile;
  const selectedProfile = overrideApplied ? candidateProfile! : baseSelectedProfile;

  return {
    policyVersion: "wave3-phase2",
    policyMode,
    shadowOnly,
    prompt: input.prompt,
    promptPreview,
    normalizedKey,
    hasAttachments: input.hasAttachments,
    isSlashCommand: input.isSlashCommand,
    classifier: input.classifier,
    classifierProfile: input.classifier.mode,
    statePreferredProfile: input.stateEntry?.preferredProfile,
    candidateProfile,
    selectedProfile,
    overrideApplied,
    overrideReasonCodes: policyMode === "off" ? [] : reasonCodes,
  };
}

export function buildResponsePolicyDecisionEvent(
  decision: ResponsePolicyDecision,
): ResponsePolicyDecisionEvent {
  return {
    eventType: "decision",
    ...decision,
  };
}

export function buildResponsePolicyOutcomeEvent(input: {
  decision: ResponsePolicyDecision;
  outcome: ResponsePolicyTurnOutcome;
}): ResponsePolicyOutcomeEvent {
  return {
    eventType: "outcome",
    ...input.decision,
    ...input.outcome,
  };
}

export function measureResponsePayloadTextLength(
  payload: ReplyPayload | ReplyPayload[] | undefined,
): number {
  if (!payload) {
    return 0;
  }

  const payloads = Array.isArray(payload) ? payload : [payload];
  let length = 0;
  for (const entry of payloads) {
    if (typeof entry?.text === "string") {
      length += entry.text.length;
    }
  }
  return length;
}

export { resolveAdaptiveDirectReply, normalizeResponsePolicyPrompt };

export function applyResponsePolicyOutcomeToEntry(input: {
  entry: ResponsePolicyStateEntry;
  decision: ResponsePolicyDecision;
  outcome: ResponsePolicyTurnOutcome;
  now?: number;
}): ResponsePolicyStateEntry {
  const now = input.now ?? Date.now();
  const entry: ResponsePolicyStateEntry = {
    ...input.entry,
    evidence: { ...input.entry.evidence },
    recent: {
      ...input.entry.recent,
      lastOverrideReasonCodes: [...input.decision.overrideReasonCodes],
    },
  };

  if (!input.outcome.fallbackTriggered) {
    incrementProfileSuccessCount(entry, input.decision.selectedProfile);
  }
  if (input.outcome.toolsUsed) {
    entry.evidence.toolRequiredCount += 1;
  } else {
    entry.evidence.noToolCount += 1;
  }
  if (input.outcome.retrievalUsed) {
    entry.evidence.retrievalRequiredCount += 1;
  } else {
    entry.evidence.noRetrievalCount += 1;
  }
  if (input.outcome.fallbackTriggered) {
    entry.evidence.fallbackCount += 1;
  }
  if (input.outcome.responseLength <= 0 || input.outcome.fallbackTriggered) {
    entry.evidence.ambiguityCount += 1;
  }

  const demotionReasons: ResponsePolicyOverrideReasonCode[] = [];
  if (input.outcome.fallbackTriggered) {
    demotionReasons.push("fallback_risk");
  }
  if (input.outcome.toolsUsed) {
    demotionReasons.push("tool_required");
  }
  if (input.outcome.retrievalUsed) {
    demotionReasons.push("retrieval_required");
  }
  if (input.outcome.responseLength <= 0) {
    demotionReasons.push("ambiguity_high");
  }

  if (
    entry.preferredProfile === "direct" &&
    (demotionReasons.includes("fallback_risk") || demotionReasons.includes("ambiguity_high"))
  ) {
    entry.preferredProfile = "fast";
    entry.recent.cooldownUntil = now + COOL_DOWN_MS;
    demotionReasons.push("direct_pattern_unstable");
  } else if (
    entry.preferredProfile === "fast" &&
    demotionReasons.some((reason) =>
      ["fallback_risk", "tool_required", "retrieval_required", "ambiguity_high"].includes(reason),
    )
  ) {
    delete entry.preferredProfile;
    entry.recent.cooldownUntil = now + COOL_DOWN_MS;
  } else if (
    hasAdaptiveDirectReply(input.decision.normalizedKey) &&
    input.decision.classifierProfile === "fast" &&
    !input.decision.classifier.directReplyEligible &&
    entry.evidence.fastSuccessCount >= DIRECT_SUCCESS_THRESHOLD &&
    !hasPromotionRisk(entry)
  ) {
    entry.preferredProfile = "direct";
  } else if (
    isCuratedDeepToFastCandidate(input.decision.normalizedKey) &&
    entry.evidence.deepSuccessCount >= FAST_SUCCESS_THRESHOLD &&
    !hasPromotionRisk(entry)
  ) {
    entry.preferredProfile = "fast";
  }

  entry.recent.lastClassifierProfile = input.decision.classifierProfile;
  entry.recent.lastSelectedProfile = input.decision.selectedProfile;
  entry.recent.lastFallbackTriggered = input.outcome.fallbackTriggered;
  entry.recent.lastOverrideApplied = input.decision.overrideApplied;
  entry.recent.lastShadowOnly = input.decision.shadowOnly;
  entry.recent.lastPolicyMode = input.decision.policyMode;
  entry.recent.lastUpdatedAt = now;
  if (demotionReasons.length > 0) {
    entry.recent.lastOverrideReasonCodes = demotionReasons;
  }
  return entry;
}

export async function loadResponsePolicyStateEntry(params: {
  prompt: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ResponsePolicyStateEntry | null> {
  const store = await loadResponsePolicyState(params.env);
  const key = normalizeResponsePolicyPrompt(params.prompt);
  return store.entries[key] ?? null;
}

export async function recordResponsePolicyOutcome(params: {
  decision: ResponsePolicyDecision;
  outcome: ResponsePolicyTurnOutcome;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const env = params.env ?? process.env;
  const mode = resolveResponsePolicyMode(env);
  if (mode === "off") {
    return;
  }
  try {
    const store = await loadResponsePolicyState(env);
    const key = params.decision.normalizedKey;
    if (!key) {
      return;
    }
    const existingEntry =
      store.entries[key] ??
      createEmptyResponsePolicyStateEntry({
        key,
        promptPreview: params.decision.promptPreview,
      });
    const updatedEntry = applyResponsePolicyOutcomeToEntry({
      entry: {
        ...existingEntry,
        promptPreview: params.decision.promptPreview,
      },
      decision: params.decision,
      outcome: params.outcome,
    });
    store.mode = mode;
    store.updatedAt = Date.now();
    store.entries[key] = updatedEntry;
    await writeResponsePolicyState(store, env);
  } catch {
    // Best-effort state recording only.
  }
}
