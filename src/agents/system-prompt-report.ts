import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import type { ClientToolDefinition } from "./pi-embedded-runner/run/params.js";
import {
  resolveToolCapabilityFamily,
  summarizeToolCapabilityFamilies,
} from "./tool-capability-family.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

const TOP_SCHEMA_CONTRIBUTOR_LIMIT = 5;

function extractBetween(
  input: string,
  startMarker: string,
  endMarker: string,
): { text: string; found: boolean } {
  const start = input.indexOf(startMarker);
  if (start === -1) {
    return { text: "", found: false };
  }
  const end = input.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    return { text: input.slice(start), found: true };
  }
  return { text: input.slice(start, end), found: true };
}

function parseSkillBlocks(skillsPrompt: string): Array<{ name: string; blockChars: number }> {
  const prompt = skillsPrompt.trim();
  if (!prompt) {
    return [];
  }
  const blocks = Array.from(prompt.matchAll(/<skill>[\s\S]*?<\/skill>/gi)).map(
    (match) => match[0] ?? "",
  );
  return blocks
    .map((block) => {
      const name = block.match(/<name>\s*([^<]+?)\s*<\/name>/i)?.[1]?.trim() || "(unknown)";
      return { name, blockChars: block.length };
    })
    .filter((b) => b.blockChars > 0);
}

function buildInjectedWorkspaceFiles(params: {
  bootstrapFiles: WorkspaceBootstrapFile[];
  injectedFiles: EmbeddedContextFile[];
}): SessionSystemPromptReport["injectedWorkspaceFiles"] {
  const injectedByPath = new Map<string, string>();
  const injectedByBaseName = new Map<string, string>();
  for (const file of params.injectedFiles) {
    const pathValue = typeof file.path === "string" ? file.path.trim() : "";
    if (!pathValue) {
      continue;
    }
    if (!injectedByPath.has(pathValue)) {
      injectedByPath.set(pathValue, file.content);
    }
    const normalizedPath = pathValue.replace(/\\/g, "/");
    const baseName = path.posix.basename(normalizedPath);
    if (!injectedByBaseName.has(baseName)) {
      injectedByBaseName.set(baseName, file.content);
    }
  }
  return params.bootstrapFiles.map((file) => {
    const pathValue = typeof file.path === "string" ? file.path.trim() : "";
    const rawChars = file.missing ? 0 : (file.content ?? "").trimEnd().length;
    const injected =
      (pathValue ? injectedByPath.get(pathValue) : undefined) ??
      injectedByPath.get(file.name) ??
      injectedByBaseName.get(file.name);
    const injectedChars = injected ? injected.length : 0;
    const truncated = !file.missing && injectedChars < rawChars;
    return {
      name: file.name,
      path: pathValue || file.name,
      missing: file.missing,
      rawChars,
      injectedChars,
      truncated,
    };
  });
}

type ToolReportInput = {
  name: string;
  description?: string;
  label?: string;
  parameters?: Record<string, unknown>;
  source: "built-in" | "client";
};

function buildToolsEntries(
  tools: ToolReportInput[],
): SessionSystemPromptReport["tools"]["entries"] {
  return tools.map((tool) => {
    const name = tool.name;
    const summary = tool.description?.trim() || tool.label?.trim() || "";
    const summaryChars = summary.length;
    const schemaChars = (() => {
      if (!tool.parameters || typeof tool.parameters !== "object") {
        return 0;
      }
      try {
        return JSON.stringify(tool.parameters).length;
      } catch {
        return 0;
      }
    })();
    const propertiesCount = (() => {
      const schema =
        tool.parameters && typeof tool.parameters === "object" ? tool.parameters : null;
      const props = schema && typeof schema.properties === "object" ? schema.properties : null;
      if (!props || typeof props !== "object") {
        return null;
      }
      return Object.keys(props as Record<string, unknown>).length;
    })();
    return {
      name,
      summaryChars,
      schemaChars,
      propertiesCount,
      capabilityFamily: resolveToolCapabilityFamily(name),
      source: tool.source,
    };
  });
}

function extractToolListText(systemPrompt: string): string {
  const markerA = "Tool names are case-sensitive. Call tools exactly as listed.\n";
  const markerB =
    "\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.";
  const extracted = extractBetween(systemPrompt, markerA, markerB);
  if (!extracted.found) {
    return "";
  }
  return extracted.text.replace(markerA, "").trim();
}

export function buildSystemPromptReport(params: {
  source: SessionSystemPromptReport["source"];
  generatedAt: number;
  sessionId?: string;
  sessionKey?: string;
  provider?: string;
  model?: string;
  workspaceDir?: string;
  bootstrapMaxChars: number;
  bootstrapTotalMaxChars?: number;
  sandbox?: SessionSystemPromptReport["sandbox"];
  systemPrompt: string;
  bootstrapFiles: WorkspaceBootstrapFile[];
  injectedFiles: EmbeddedContextFile[];
  skillsPrompt: string;
  tools: AgentTool[];
  clientTools?: ClientToolDefinition[];
}): SessionSystemPromptReport {
  const systemPrompt = params.systemPrompt.trim();
  const projectContext = extractBetween(
    systemPrompt,
    "\n# Project Context\n",
    "\n## Silent Replies\n",
  );
  const projectContextChars = projectContext.text.length;
  const toolListText = extractToolListText(systemPrompt);
  const toolListChars = toolListText.length;
  const toolsEntries = buildToolsEntries([
    ...params.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      label: tool.label,
      parameters:
        tool.parameters && typeof tool.parameters === "object"
          ? (tool.parameters as Record<string, unknown>)
          : undefined,
      source: "built-in" as const,
    })),
    ...(params.clientTools ?? []).map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters:
        tool.function.parameters && typeof tool.function.parameters === "object"
          ? tool.function.parameters
          : undefined,
      source: "client" as const,
    })),
  ]);
  const toolsSchemaChars = toolsEntries.reduce((sum, t) => sum + (t.schemaChars ?? 0), 0);
  const toolFamilyCounts = summarizeToolCapabilityFamilies(toolsEntries.map((entry) => entry.name));
  const topSchemaContributors = [...toolsEntries]
    .toSorted(
      (left, right) => right.schemaChars - left.schemaChars || left.name.localeCompare(right.name),
    )
    .slice(0, TOP_SCHEMA_CONTRIBUTOR_LIMIT)
    .map((entry) => ({
      name: entry.name,
      schemaChars: entry.schemaChars,
      capabilityFamily: entry.capabilityFamily ?? resolveToolCapabilityFamily(entry.name),
    }));
  const skillsEntries = parseSkillBlocks(params.skillsPrompt);
  const injectedWorkspaceFiles = buildInjectedWorkspaceFiles({
    bootstrapFiles: params.bootstrapFiles,
    injectedFiles: params.injectedFiles,
  });
  const bootstrapFilesPresent = injectedWorkspaceFiles.filter((file) => !file.missing);

  return {
    source: params.source,
    generatedAt: params.generatedAt,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    provider: params.provider,
    model: params.model,
    workspaceDir: params.workspaceDir,
    bootstrapMaxChars: params.bootstrapMaxChars,
    bootstrapTotalMaxChars: params.bootstrapTotalMaxChars,
    bootstrap: {
      fileCount: params.bootstrapFiles.length,
      missingCount: injectedWorkspaceFiles.filter((file) => file.missing).length,
      truncatedCount: bootstrapFilesPresent.filter((file) => file.truncated).length,
      rawChars: bootstrapFilesPresent.reduce((sum, file) => sum + file.rawChars, 0),
      injectedChars: bootstrapFilesPresent.reduce((sum, file) => sum + file.injectedChars, 0),
    },
    sandbox: params.sandbox,
    systemPrompt: {
      chars: systemPrompt.length,
      projectContextChars,
      nonProjectContextChars: Math.max(0, systemPrompt.length - projectContextChars),
    },
    injectedWorkspaceFiles,
    skills: {
      promptChars: params.skillsPrompt.length,
      entries: skillsEntries,
    },
    tools: {
      listChars: toolListChars,
      schemaChars: toolsSchemaChars,
      exposedCount: toolsEntries.length,
      familyCounts: toolFamilyCounts,
      topSchemaContributors,
      entries: toolsEntries,
    },
  };
}
