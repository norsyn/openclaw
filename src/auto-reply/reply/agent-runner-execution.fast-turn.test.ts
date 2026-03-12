import { describe, expect, it } from "vitest";
import {
  resolveFastTurnDirectReply,
  resolveFastTurnReplyHint,
  resolveTurnRunProfile,
} from "./agent-runner-execution.js";

describe("resolveTurnRunProfile", () => {
  it("classifies narrow acknowledgements as fast and disables tools", () => {
    expect(resolveTurnRunProfile({ commandBody: "hi" })).toEqual({
      mode: "fast",
      disableTools: true,
    });
    expect(resolveTurnRunProfile({ commandBody: "thanks" })).toEqual({
      mode: "fast",
      disableTools: true,
    });
  });

  it("allows only session_status for time queries", () => {
    expect(resolveTurnRunProfile({ commandBody: "what time is it" })).toEqual({
      mode: "fast",
      disableTools: false,
      toolNameAllowlist: ["session_status"],
    });
  });

  it("ignores the injected timestamp prefix used by the live chat path", () => {
    expect(resolveTurnRunProfile({ commandBody: "[Wed 2026-03-11 17:11 EDT] hi" })).toEqual({
      mode: "fast",
      disableTools: true,
    });
  });

  it("falls back to deep mode for continuity and action cues", () => {
    expect(resolveTurnRunProfile({ commandBody: "what did we decide last time?" })).toEqual({
      mode: "deep",
      disableTools: false,
    });
    expect(resolveTurnRunProfile({ commandBody: "check the repo status" })).toEqual({
      mode: "deep",
      disableTools: false,
    });
  });

  it("falls back to deep mode for turns with attachments", () => {
    expect(resolveTurnRunProfile({ commandBody: "hi", images: [{}] })).toEqual({
      mode: "deep",
      disableTools: false,
    });
  });

  it("returns terse acknowledgement guidance for weak fast-turn cases", () => {
    expect(resolveFastTurnReplyHint("okay")).toContain("Do not greet again");
    expect(resolveFastTurnReplyHint("thank you")).toContain("You're welcome.");
    expect(resolveFastTurnReplyHint("summarize this in one sentence")).toContain(
      "Do not summarize the user's request itself.",
    );
    expect(resolveFastTurnReplyHint("Reply with exactly the word hi.")).toContain(
      "Reply with exactly 'hi'.",
    );
    expect(resolveFastTurnReplyHint("check the repo status")).toBeUndefined();
  });

  it("classifies short exact-reply prompts as fast and disables tools", () => {
    expect(resolveTurnRunProfile({ commandBody: "Reply with exactly the word hi." })).toEqual({
      mode: "fast",
      disableTools: true,
    });
  });

  it("returns deterministic direct replies for the weakest exact trivial turns", () => {
    expect(resolveFastTurnDirectReply("okay")).toEqual({ text: "Okay." });
    expect(resolveFastTurnDirectReply("sounds good")).toEqual({ text: "Sounds good." });
    expect(resolveFastTurnDirectReply("thanks")).toEqual({ text: "You're welcome." });
    expect(resolveFastTurnDirectReply("summarize this in one sentence")).toEqual({
      text: "I need the text or content to summarize.",
    });
    expect(resolveFastTurnDirectReply("what time is it")).toBeUndefined();
  });
});
