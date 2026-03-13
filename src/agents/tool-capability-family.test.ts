import "./test-helpers/fast-coding-tools.ts";
import { describe, expect, it } from "vitest";
import { createOpenClawCodingTools } from "./pi-tools.js";
import {
  resolveCapabilityFamilyAllowlist,
  resolveSingleCapabilityFamily,
  resolveToolCapabilityFamily,
  summarizeToolCapabilityFamilies,
} from "./tool-capability-family.js";

describe("tool capability families", () => {
  it("maps core tools into conservative capability families", () => {
    expect(resolveToolCapabilityFamily("read_file")).toBe("read_only_workspace");
    expect(resolveToolCapabilityFamily("apply_patch")).toBe("workspace_mutation");
    expect(resolveToolCapabilityFamily("exec")).toBe("runtime_process");
    expect(resolveToolCapabilityFamily("message")).toBe("session_orchestration");
    expect(resolveToolCapabilityFamily("browser")).toBe("browser_web");
    expect(resolveToolCapabilityFamily("nodes")).toBe("environment_control");
    expect(resolveToolCapabilityFamily("jo_memory_search")).toBe("jo_memory");
    expect(resolveToolCapabilityFamily("jo_orchestrator_status")).toBe("jo_observability_admin");
  });

  it("normalizes canonical names and plugin aliases conservatively", () => {
    expect(resolveToolCapabilityFamily(" Read_File ")).toBe("read_only_workspace");
    expect(resolveToolCapabilityFamily("SESSION_STATUS")).toBe("session_orchestration");
    expect(resolveToolCapabilityFamily("archive_read")).toBe("jo_observability_admin");
  });

  it("resolves read-only family allowlists and single-family allowlists", () => {
    expect(resolveCapabilityFamilyAllowlist("read_only_workspace")).toEqual([
      "read_file",
      "grep_search",
      "file_search",
      "list_dir",
    ]);
    expect(resolveSingleCapabilityFamily(["read_file", "grep_search"])).toBe("read_only_workspace");
    expect(resolveSingleCapabilityFamily(["read_file", "exec"])).toBeUndefined();
  });

  it("summarizes mixed tool families by count", () => {
    expect(
      summarizeToolCapabilityFamilies(["read_file", "grep_search", "exec", "message"]),
    ).toEqual([
      { family: "read_only_workspace", count: 2 },
      { family: "runtime_process", count: 1 },
      { family: "session_orchestration", count: 1 },
    ]);
  });

  it("does not remove core tools from the default tool factory", () => {
    const toolNames = new Set(createOpenClawCodingTools().map((tool) => tool.name));
    expect(toolNames.has("read") || toolNames.has("read_file")).toBe(true);
    expect(toolNames.has("exec")).toBe(true);
    expect(toolNames.has("message")).toBe(true);
  });
});
