import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { buildSchemaSelector, writeMcpxSkill } from "../src/skill-template";

describe("mcpx skill template", () => {
  it("builds argc schema selectors for selected servers", () => {
    expect(buildSchemaSelector(["posthog"])).toBe(".posthog");
    expect(buildSchemaSelector(["posthog", "sentry"])).toBe(".{posthog,sentry}");
  });

  it("writes a project-local mcpx skill", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpx-skill-"));
    const filePath = await writeMcpxSkill({ cwd, servers: ["posthog", "sentry"] });
    const content = await readFile(filePath, "utf8");

    expect(filePath).toBe(join(cwd, ".agents", "skills", "mcpx", "SKILL.md"));
    expect(content).toContain('mcpx --schema=".{posthog,sentry}"');
    expect(content).toContain("mcpx <server> <tool> --input '{ }'");
  });
});
