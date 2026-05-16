import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { buildSchemaSelector, parseMcpxSkillServers, writeMcpxSkill } from "../src/skill-template";

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
    expect(content).toContain('name: "mcpx"');
    expect(content).toContain('servers: ["posthog", "sentry"]');
    expect(content).toContain(
      'description: "Use project-approved MCP tools through mcpx. Trigger when the user asks to inspect or operate services backed by these MCP servers: posthog, sentry."',
    );
    expect(content).toContain('mcpx --schema=".{posthog,sentry}"');
    expect(content).toContain("`.server.{tool-a,tool-b,tool-c}`");
    expect(content).toContain("mcpx --schema=.posthog.{projects-get,alerts-list,alert-create}");
    expect(content).toContain("mcpx <server> <tool> --input '{ }'");
    expect(content).toContain("mcpx <server> <tool> --input @payload.json");
    expect(content).toContain("mcpx <server> <tool> --input @- <<'JSON'");
  });

  it("parses selected servers from existing skill frontmatter", () => {
    expect(
      parseMcpxSkillServers(`---
name: mcpx
servers: [posthog, sentry]
description: Example
---

# MCPX
`),
    ).toEqual(["posthog", "sentry"]);
    expect(
      parseMcpxSkillServers(`---
name: "mcpx"
servers:
  - posthog
  - sentry
description: "Example: valid YAML"
---

# MCPX
`),
    ).toEqual(["posthog", "sentry"]);
    expect(
      parseMcpxSkillServers(`---
name: "mcpx"
servers: ["posthog", 1, "", "sentry"]
description: "Example: mixed YAML"
---

# MCPX
`),
    ).toEqual(["posthog", "sentry"]);
    expect(
      parseMcpxSkillServers(`---
name: mcpx
servers: [posthog]
description: Invalid YAML: because this unquoted scalar contains a mapping
---

# MCPX
`),
    ).toEqual([]);
  });
});
