#!/usr/bin/env tsx

/**
 * Example: fetch the README for a React-adjacent package from Context7
 * and print only the markdown headlines.
 */

import { createRuntime, createServerProxy, type CallResult } from "../src/index.js";

async function main(): Promise<void> {
  const apiKey = process.env.CONTEXT7_API_KEY;
  const context7Definition = {
    name: "context7",
    description: "Context7 documentation MCP",
    command: {
      kind: "http" as const,
      url: new URL("https://mcp.context7.com/mcp"),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    },
  };
  // Inline definitions can also live in mcp.json or ~/.mcpx/mcp.json if you prefer shared config.

  const mcpRuntime = await createRuntime({ servers: [context7Definition] });
  try {
    const context7 = createServerProxy(mcpRuntime, "context7") as Record<string, unknown>;
    const resolveLibraryId = context7.resolveLibraryId as (args: unknown) => Promise<CallResult>;
    const getLibraryDocs = context7.getLibraryDocs as (args: unknown) => Promise<CallResult>;

    const resolved = await resolveLibraryId("react");
    const contextId = extractContext7LibraryId(resolved);
    if (!contextId) {
      throw new Error("Unable to resolve React documentation ID from Context7.");
    }

    const docs = await getLibraryDocs(contextId);

    const markdown = docs.markdown() ?? docs.text() ?? "";
    const headlines = markdown
      .split("\n")
      .filter((line) => /^#+\s/.test(line))
      .join("\n");

    console.log("# Headlines for React");
    console.log(headlines || "(no headlines found)");
  } finally {
    await mcpRuntime.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function extractContext7LibraryId(result: CallResult): string | null {
  const json = result.json<
    { candidates?: Array<{ context7CompatibleLibraryID?: string }> } | undefined
  >();
  if (json && json.candidates) {
    for (const candidate of json.candidates) {
      if (candidate?.context7CompatibleLibraryID) {
        return candidate.context7CompatibleLibraryID;
      }
    }
  }
  const textMatch = result.text()?.match(/Context7-compatible library ID:\s*([^\s]+)/);
  return textMatch?.[1] ?? null;
}
