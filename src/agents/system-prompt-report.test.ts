import { describe, expect, it } from "vitest";
import { buildSystemPromptReport } from "./system-prompt-report.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

function makeBootstrapFile(overrides: Partial<WorkspaceBootstrapFile>): WorkspaceBootstrapFile {
  return {
    name: "AGENTS.md",
    path: "/tmp/workspace/AGENTS.md",
    content: "alpha",
    missing: false,
    ...overrides,
  };
}

describe("buildSystemPromptReport", () => {
  const makeReport = (params: {
    file: WorkspaceBootstrapFile;
    injectedPath: string;
    injectedContent: string;
    bootstrapMaxChars?: number;
    bootstrapTotalMaxChars?: number;
  }) =>
    buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: params.bootstrapMaxChars ?? 20_000,
      bootstrapTotalMaxChars: params.bootstrapTotalMaxChars,
      systemPrompt: "system",
      bootstrapFiles: [params.file],
      injectedFiles: [{ path: params.injectedPath, content: params.injectedContent }],
      skillsPrompt: "",
      tools: [],
    });

  it("counts injected chars when injected file paths are absolute", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/policies/AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe("trimmed".length);
  });

  it("keeps legacy basename matching for injected files", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe("trimmed".length);
  });

  it("marks workspace files truncated when injected chars are smaller than raw chars", () => {
    const file = makeBootstrapFile({
      path: "/tmp/workspace/policies/AGENTS.md",
      content: "abcdefghijklmnopqrstuvwxyz",
    });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/policies/AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.truncated).toBe(true);
  });

  it("includes both bootstrap caps in the report payload", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "AGENTS.md",
      injectedContent: "trimmed",
      bootstrapMaxChars: 11_111,
      bootstrapTotalMaxChars: 22_222,
    });

    expect(report.bootstrapMaxChars).toBe(11_111);
    expect(report.bootstrapTotalMaxChars).toBe(22_222);
    expect(report.bootstrap).toEqual({
      fileCount: 1,
      missingCount: 0,
      truncatedCount: 0,
      rawChars: file.content.length,
      injectedChars: "trimmed".length,
    });
    expect(report.tools.exposedCount).toBe(0);
    expect(report.tools.familyCounts).toEqual([]);
  });

  it("annotates tool entries with capability families and top schema contributors", () => {
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt:
        "Tool names are case-sensitive. Call tools exactly as listed.\nread_file\nmessage\nTOOLS.md does not control tool availability; it is user guidance for how to use external tools.",
      bootstrapFiles: [],
      injectedFiles: [],
      skillsPrompt: "",
      tools: [
        {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: { filePath: { type: "string" } } },
        } as never,
      ],
      clientTools: [
        {
          type: "function",
          function: {
            name: "jo_memory_search",
            description: "Search memory",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        },
      ],
    });

    expect(report.tools.exposedCount).toBe(2);
    expect(report.tools.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "read_file",
          capabilityFamily: "read_only_workspace",
          source: "built-in",
        }),
        expect.objectContaining({
          name: "jo_memory_search",
          capabilityFamily: "jo_memory",
          source: "client",
        }),
      ]),
    );
    expect(report.tools.familyCounts).toEqual([
      { family: "jo_memory", count: 1 },
      { family: "read_only_workspace", count: 1 },
    ]);
    expect(report.tools.topSchemaContributors?.map((entry) => entry.name)).toEqual([
      "read_file",
      "jo_memory_search",
    ]);
  });

  it("reports injectedChars=0 when injected file does not match by path or basename", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/policies/OTHER.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe(0);
    expect(report.injectedWorkspaceFiles[0]?.truncated).toBe(true);
  });

  it("ignores malformed injected file paths and still matches valid entries", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [
        { path: 123 as unknown as string, content: "bad" },
        { path: "/tmp/workspace/policies/AGENTS.md", content: "trimmed" },
      ],
      skillsPrompt: "",
      tools: [],
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe("trimmed".length);
  });
});
