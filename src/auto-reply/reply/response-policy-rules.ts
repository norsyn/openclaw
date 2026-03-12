import type { ReplyPayload } from "../types.js";

const POLICY_TIMESTAMP_PREFIX_RE =
  /^\[(?:mon|tue|wed|thu|fri|sat|sun)[^\]]*\d{4}-\d{2}-\d{2}[^\]]*\]\s*/i;

const POLICY_PUNCT_EDGE_RE = /^[\s.,!?;:'"()[\]{}-]+|[\s.,!?;:'"()[\]{}-]+$/g;

const CONTINUITY_CUE_PATTERNS = [
  /\bremember\b/i,
  /\blast time\b/i,
  /\bprevious\b/i,
  /\bearlier\b/i,
  /\brecap\b/i,
  /\bhistory\b/i,
  /\bcontext\b/i,
  /\bdecision\b/i,
  /\bfollow[ -]?up\b/i,
];

const OPERATIONAL_CUE_PATTERNS = [
  /\brepo\b/i,
  /\bfile\b/i,
  /\bfiles\b/i,
  /\bcode\b/i,
  /\bdebug\b/i,
  /\bfix\b/i,
  /\bbuild\b/i,
  /\btest\b/i,
  /\btrace\b/i,
  /\binspect\b/i,
  /\bcheck\b/i,
  /\bread\b/i,
  /\bedit\b/i,
  /\bsearch\b/i,
  /\brun\b/i,
  /\bterminal\b/i,
  /\bcommand\b/i,
  /\blog\b/i,
  /\bbranch\b/i,
  /\bcommit\b/i,
  /\bdeploy\b/i,
  /\btool\b/i,
  /\bstatus\b/i,
];

const CURATED_DEEP_TO_FAST_KEYS = new Set(["what can you do", "how can you help"]);

const ADAPTIVE_DIRECT_REPLIES = new Map<string, ReplyPayload>([
  ["got it", { text: "Got it." }],
  ["understood", { text: "Understood." }],
  ["works for me", { text: "Works for me." }],
]);

export function normalizeResponsePolicyPrompt(prompt: string): string {
  const withoutTimestamp = prompt.trim().replace(POLICY_TIMESTAMP_PREFIX_RE, "");
  const collapsed = withoutTimestamp.replace(/\s+/g, " ").trim().toLowerCase();
  return collapsed.replace(POLICY_PUNCT_EDGE_RE, "").trim();
}

export function buildResponsePolicyPromptPreview(normalizedPrompt: string): string {
  return normalizedPrompt.slice(0, 80);
}

export function hasResponsePolicyContinuityCue(normalizedPrompt: string): boolean {
  return CONTINUITY_CUE_PATTERNS.some((pattern) => pattern.test(normalizedPrompt));
}

export function hasResponsePolicyOperationalCue(normalizedPrompt: string): boolean {
  return OPERATIONAL_CUE_PATTERNS.some((pattern) => pattern.test(normalizedPrompt));
}

export function isCuratedDeepToFastCandidate(normalizedPrompt: string): boolean {
  return CURATED_DEEP_TO_FAST_KEYS.has(normalizedPrompt);
}

export function hasAdaptiveDirectReply(normalizedPrompt: string): boolean {
  return ADAPTIVE_DIRECT_REPLIES.has(normalizedPrompt);
}

export function resolveAdaptiveDirectReply(normalizedPrompt: string): ReplyPayload | undefined {
  const payload = ADAPTIVE_DIRECT_REPLIES.get(normalizedPrompt);
  return payload ? { ...payload } : undefined;
}

export function listCuratedDeepToFastCandidates(): string[] {
  return [...CURATED_DEEP_TO_FAST_KEYS];
}

export function listAdaptiveDirectReplyKeys(): string[] {
  return [...ADAPTIVE_DIRECT_REPLIES.keys()];
}
