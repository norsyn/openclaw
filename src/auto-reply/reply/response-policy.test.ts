import { describe, expect, it } from "vitest";
import {
  applyResponsePolicyOutcomeToEntry,
  buildResponsePolicyDecisionEvent,
  buildResponsePolicyOutcomeEvent,
  createEmptyResponsePolicyStateEntry,
  createResponsePolicyClassifierSnapshot,
  measureResponsePayloadTextLength,
  resolveResponsePolicyDecision,
} from "./response-policy.js";

describe("response-policy", () => {
  it("passes through fast classifier decisions unchanged when no bounded override applies", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "fast",
      disableTools: true,
      directReplyEligible: false,
    });

    const decision = resolveResponsePolicyDecision({
      prompt: "thanks",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "shadow",
    });

    expect(decision.classifierProfile).toBe("fast");
    expect(decision.selectedProfile).toBe("fast");
    expect(decision.overrideApplied).toBe(false);
    expect(decision.policyMode).toBe("shadow");
  });

  it("preserves existing exact direct replies as base behavior", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "fast",
      disableTools: true,
      directReplyEligible: true,
    });

    const decision = resolveResponsePolicyDecision({
      prompt: "hi",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "shadow",
    });

    expect(decision.classifierProfile).toBe("fast");
    expect(decision.selectedProfile).toBe("direct");
    expect(decision.overrideApplied).toBe(false);
  });

  it("forces protected deep mode for hard blockers", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "fast",
      disableTools: true,
      directReplyEligible: false,
    });

    const decision = resolveResponsePolicyDecision({
      prompt: "/check that repo status",
      hasAttachments: false,
      isSlashCommand: true,
      classifier,
      policyMode: "adaptive",
    });

    expect(decision.selectedProfile).toBe("deep");
    expect(decision.overrideReasonCodes).toContain("slash_command");
    expect(decision.overrideReasonCodes).toContain("protected_deep_trigger");
  });

  it("computes but does not apply deep to fast overrides in shadow mode", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "deep",
      disableTools: false,
      directReplyEligible: false,
    });
    const entry = createEmptyResponsePolicyStateEntry({
      key: "what can you do",
      promptPreview: "what can you do",
    });
    entry.preferredProfile = "fast";
    entry.evidence.deepSuccessCount = 5;

    const decision = resolveResponsePolicyDecision({
      prompt: "what can you do",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "shadow",
      stateEntry: entry,
    });

    expect(decision.candidateProfile).toBe("fast");
    expect(decision.selectedProfile).toBe("deep");
    expect(decision.shadowOnly).toBe(true);
    expect(decision.overrideApplied).toBe(false);
  });

  it("applies deep to fast overrides conservatively in adaptive mode", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "deep",
      disableTools: false,
      directReplyEligible: false,
    });
    const entry = createEmptyResponsePolicyStateEntry({
      key: "how can you help",
      promptPreview: "how can you help",
    });
    entry.preferredProfile = "fast";
    entry.evidence.deepSuccessCount = 5;

    const decision = resolveResponsePolicyDecision({
      prompt: "how can you help",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "adaptive",
      stateEntry: entry,
    });

    expect(decision.candidateProfile).toBe("fast");
    expect(decision.selectedProfile).toBe("fast");
    expect(decision.shadowOnly).toBe(false);
    expect(decision.overrideApplied).toBe(true);
  });

  it("supports bounded fast to direct promotion for adaptive deterministic keys", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "fast",
      disableTools: true,
      directReplyEligible: false,
    });
    const entry = createEmptyResponsePolicyStateEntry({
      key: "got it",
      promptPreview: "got it",
    });
    entry.preferredProfile = "direct";
    entry.evidence.fastSuccessCount = 3;

    const decision = resolveResponsePolicyDecision({
      prompt: "got it",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "adaptive",
      stateEntry: entry,
    });

    expect(decision.selectedProfile).toBe("direct");
    expect(decision.overrideApplied).toBe(true);
    expect(decision.overrideReasonCodes).toContain("stable_direct_pattern");
  });

  it("builds structured decision and outcome records for policy events", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "deep",
      disableTools: false,
      toolNameAllowlist: ["session_status"],
      directReplyEligible: false,
    });
    const entry = createEmptyResponsePolicyStateEntry({
      key: "what can you do",
      promptPreview: "what can you do",
    });
    entry.preferredProfile = "fast";
    entry.evidence.deepSuccessCount = 5;
    const decision = resolveResponsePolicyDecision({
      prompt: "what can you do",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "shadow",
      stateEntry: entry,
    });

    expect(buildResponsePolicyDecisionEvent(decision)).toMatchObject({
      eventType: "decision",
      policyVersion: "wave3-phase2",
      policyMode: "shadow",
      shadowOnly: true,
      classifierProfile: "deep",
      selectedProfile: "deep",
      candidateProfile: "fast",
    });

    expect(
      buildResponsePolicyOutcomeEvent({
        decision,
        outcome: {
          latencyMs: 120,
          retrievalUsed: true,
          toolsUsed: true,
          toolNames: ["jo_memory_search", "session_status"],
          fallbackTriggered: false,
          responseLength: 42,
        },
      }),
    ).toMatchObject({
      eventType: "outcome",
      policyVersion: "wave3-phase2",
      policyMode: "shadow",
      retrievalUsed: true,
      toolsUsed: true,
      toolNames: ["jo_memory_search", "session_status"],
      responseLength: 42,
    });
  });

  it("demotes adaptive direct preferences to fast when direct patterns become unstable", () => {
    const entry = createEmptyResponsePolicyStateEntry({
      key: "got it",
      promptPreview: "got it",
    });
    entry.preferredProfile = "direct";

    const updated = applyResponsePolicyOutcomeToEntry({
      entry,
      decision: {
        policyVersion: "wave3-phase2",
        policyMode: "adaptive",
        shadowOnly: false,
        prompt: "got it",
        promptPreview: "got it",
        normalizedKey: "got it",
        hasAttachments: false,
        isSlashCommand: false,
        classifier: createResponsePolicyClassifierSnapshot({
          mode: "fast",
          disableTools: true,
          directReplyEligible: false,
        }),
        classifierProfile: "fast",
        statePreferredProfile: "direct",
        candidateProfile: "direct",
        selectedProfile: "direct",
        overrideApplied: true,
        overrideReasonCodes: ["preferred_profile_state", "stable_direct_pattern"],
      },
      outcome: {
        latencyMs: 10,
        retrievalUsed: false,
        toolsUsed: false,
        toolNames: [],
        fallbackTriggered: true,
        responseLength: 0,
      },
      now: 123,
    });

    expect(updated.preferredProfile).toBe("fast");
    expect(updated.recent.lastOverrideReasonCodes).toContain("direct_pattern_unstable");
  });

  it("demotes adaptive fast preferences back to deep fallback on negative evidence", () => {
    const entry = createEmptyResponsePolicyStateEntry({
      key: "what can you do",
      promptPreview: "what can you do",
    });
    entry.preferredProfile = "fast";

    const updated = applyResponsePolicyOutcomeToEntry({
      entry,
      decision: {
        policyVersion: "wave3-phase2",
        policyMode: "adaptive",
        shadowOnly: false,
        prompt: "what can you do",
        promptPreview: "what can you do",
        normalizedKey: "what can you do",
        hasAttachments: false,
        isSlashCommand: false,
        classifier: createResponsePolicyClassifierSnapshot({
          mode: "deep",
          disableTools: false,
          directReplyEligible: false,
        }),
        classifierProfile: "deep",
        statePreferredProfile: "fast",
        candidateProfile: "fast",
        selectedProfile: "fast",
        overrideApplied: true,
        overrideReasonCodes: ["preferred_profile_state", "curated_fast_candidate"],
      },
      outcome: {
        latencyMs: 10,
        retrievalUsed: true,
        toolsUsed: true,
        toolNames: ["jo_memory_search"],
        fallbackTriggered: false,
        responseLength: 25,
      },
      now: 123,
    });

    expect(updated.preferredProfile).toBeUndefined();
    expect(updated.recent.cooldownUntil).toBeGreaterThan(123);
  });

  it("does not adapt unvalidated deep-to-fast families in adaptive mode", () => {
    const classifier = createResponsePolicyClassifierSnapshot({
      mode: "deep",
      disableTools: false,
      directReplyEligible: false,
    });
    const entry = createEmptyResponsePolicyStateEntry({
      key: "who are you",
      promptPreview: "who are you",
    });
    entry.preferredProfile = "fast";
    entry.evidence.deepSuccessCount = 9;

    const decision = resolveResponsePolicyDecision({
      prompt: "who are you",
      hasAttachments: false,
      isSlashCommand: false,
      classifier,
      policyMode: "adaptive",
      stateEntry: entry,
    });

    expect(decision.candidateProfile).toBeUndefined();
    expect(decision.selectedProfile).toBe("deep");
    expect(decision.overrideApplied).toBe(false);
    expect(decision.overrideReasonCodes).toContain("insufficient_evidence");
  });

  it("measures visible response text length from final payloads", () => {
    expect(measureResponsePayloadTextLength(undefined)).toBe(0);
    expect(measureResponsePayloadTextLength({ text: "Okay." })).toBe(5);
    expect(measureResponsePayloadTextLength([{ text: "Line one" }, { text: "Line two" }, {}])).toBe(
      16,
    );
  });
});
