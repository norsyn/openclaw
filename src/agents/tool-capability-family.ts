export type ToolCapabilityFamily =
  | "none"
  | "read_only_workspace"
  | "workspace_mutation"
  | "runtime_process"
  | "session_orchestration"
  | "browser_web"
  | "environment_control"
  | "jo_memory"
  | "jo_observability_admin";

type ToolCapabilityFamilyCount = {
  family: ToolCapabilityFamily;
  count: number;
};

const DIRECT_TOOL_FAMILY: Readonly<Record<string, ToolCapabilityFamily>> = {
  read: "read_only_workspace",
  read_file: "read_only_workspace",
  grep_search: "read_only_workspace",
  file_search: "read_only_workspace",
  list_dir: "read_only_workspace",
  write: "workspace_mutation",
  edit: "workspace_mutation",
  apply_patch: "workspace_mutation",
  create_file: "workspace_mutation",
  create_directory: "workspace_mutation",
  edit_notebook_file: "workspace_mutation",
  exec: "runtime_process",
  process: "runtime_process",
  message: "session_orchestration",
  session_status: "session_orchestration",
  sessions_send: "session_orchestration",
  sessions_spawn: "session_orchestration",
  sessions_list: "session_orchestration",
  sessions_history: "session_orchestration",
  subagents: "session_orchestration",
  agents_list: "session_orchestration",
  browser: "browser_web",
  fetch_webpage: "browser_web",
  open_browser_page: "browser_web",
  nodes: "environment_control",
  canvas: "environment_control",
  tts: "environment_control",
  gateway: "environment_control",
  memory_search: "jo_memory",
  memory_get: "jo_memory",
  jo_memory_capture: "jo_memory",
  jo_memory_search: "jo_memory",
  jo_memory_get: "jo_memory",
  jo_memory_feedback: "jo_memory",
};

const FAMILY_ALLOWLISTS: Readonly<Partial<Record<ToolCapabilityFamily, readonly string[]>>> = {
  read_only_workspace: ["read_file", "grep_search", "file_search", "list_dir"],
};

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

export function resolveToolCapabilityFamily(toolName: string): ToolCapabilityFamily {
  const normalized = normalizeToolName(toolName);
  const direct = DIRECT_TOOL_FAMILY[normalized];
  if (direct) {
    return direct;
  }
  if (normalized.startsWith("jo_memory_")) {
    return "jo_memory";
  }
  if (normalized.startsWith("jo_orchestrator_") || normalized.startsWith("archive_")) {
    return "jo_observability_admin";
  }
  if (normalized.startsWith("session_") || normalized.startsWith("sessions_")) {
    return "session_orchestration";
  }
  return "jo_observability_admin";
}

export function resolveCapabilityFamilyAllowlist(
  family: ToolCapabilityFamily,
): string[] | undefined {
  const allowlist = FAMILY_ALLOWLISTS[family];
  return allowlist ? [...allowlist] : undefined;
}

export function summarizeToolCapabilityFamilies(
  toolNames: Iterable<string>,
): ToolCapabilityFamilyCount[] {
  const counts = new Map<ToolCapabilityFamily, number>();
  for (const toolName of toolNames) {
    const family = resolveToolCapabilityFamily(toolName);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, count }))
    .toSorted((left, right) => right.count - left.count || left.family.localeCompare(right.family));
}

export function resolveSingleCapabilityFamily(
  toolNames: Iterable<string>,
): ToolCapabilityFamily | undefined {
  const families = new Set<ToolCapabilityFamily>();
  for (const toolName of toolNames) {
    families.add(resolveToolCapabilityFamily(toolName));
    if (families.size > 1) {
      return undefined;
    }
  }
  return families.size === 1 ? [...families][0] : undefined;
}
