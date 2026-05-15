import { describe, expect, it } from "bun:test";

import { listAllMcpTools, normalizeMcpTool } from "../src/mcp-client";

describe("MCP client tool listing", () => {
  it("paginates listTools results", async () => {
    const cursors: unknown[] = [];
    const tools = await listAllMcpTools({
      async listTools(params) {
        cursors.push(params?.cursor);
        if (!params?.cursor) {
          return { tools: [{ name: "first" }], nextCursor: "next" };
        }
        return { tools: [{ name: "second" }] };
      },
    });

    expect(cursors).toEqual([undefined, "next"]);
    expect(tools.map((tool) => tool.name)).toEqual(["first", "second"]);
  });

  it("preserves tool metadata but ignores outputSchema", () => {
    expect(
      normalizeMcpTool({
        name: "close_page",
        title: "Close Page",
        description: "Close a page",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        annotations: { destructiveHint: true },
        _meta: { trace: true },
      } as never),
    ).toEqual({
      name: "close_page",
      title: "Close Page",
      description: "Close a page",
      inputSchema: { type: "object" },
      annotations: { destructiveHint: true },
      _meta: { trace: true },
    });
  });
});
