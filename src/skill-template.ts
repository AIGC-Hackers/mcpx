import fs from "node:fs/promises";
import path from "node:path";

export type SkillTemplateInput = {
  cwd: string;
  servers: string[];
};

export function buildSchemaSelector(servers: string[]): string {
  if (servers.length === 0) {
    throw new Error("Select at least one MCP server.");
  }
  if (servers.length === 1) {
    return `.${servers[0]}`;
  }
  return `.{${servers.join(",")}}`;
}

export function buildMcpxSkillMarkdown(servers: string[]): string {
  const selector = buildSchemaSelector(servers);
  const serverList = servers.map((server) => `- ${server}`).join("\n");

  return `---
name: mcpx
description: Use project-approved MCP tools through mcpx. Trigger when the user asks to inspect or operate services backed by these MCP servers: ${servers.join(", ")}.
---

# MCPX

Use this skill when the task needs one of these MCP servers:

${serverList}

## Discover

Inspect the available tool surface before calling tools:

\`\`\`bash
mcpx --schema="${selector}"
\`\`\`

Use narrower selectors when you already know the target server or tool.

## Call

Call MCP tools through root server commands and pass tool input only through \`--input\`.
\`--input\` accepts JSON, JSON5, stdin, and \`@file\` values through argc.

\`\`\`bash
mcpx <server> <tool> --input '{ }'
\`\`\`

Do not hand-edit MCP configuration in this project. Servers are registered in the user's global mcpx registry.
`;
}

export async function writeMcpxSkill(input: SkillTemplateInput): Promise<string> {
  const filePath = path.join(input.cwd, ".agents", "skills", "mcpx", "SKILL.md");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buildMcpxSkillMarkdown(input.servers), "utf8");
  return filePath;
}
