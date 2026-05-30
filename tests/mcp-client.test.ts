import { describe, expect, it } from "bun:test";
import path from "node:path";

import {
  callMcpTool,
  listAllMcpTools,
  listMcpTools,
  normalizeMcpTool,
  toolCallRequestOptions,
} from "../src/mcp-client";

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

  it("uses an explicit tool call timeout with an env override", () => {
    const previous = process.env.MCPX_TOOL_CALL_TIMEOUT_MS;
    try {
      delete process.env.MCPX_TOOL_CALL_TIMEOUT_MS;
      expect(toolCallRequestOptions().timeout).toBe(300_000);

      process.env.MCPX_TOOL_CALL_TIMEOUT_MS = "120000";
      expect(toolCallRequestOptions().timeout).toBe(120_000);

      process.env.MCPX_TOOL_CALL_TIMEOUT_MS = "invalid";
      expect(toolCallRequestOptions().timeout).toBe(300_000);
    } finally {
      if (previous === undefined) {
        delete process.env.MCPX_TOOL_CALL_TIMEOUT_MS;
      } else {
        process.env.MCPX_TOOL_CALL_TIMEOUT_MS = previous;
      }
    }
  });

  it("lists and calls tools from stdio MCP servers", async () => {
    const previous = process.env.MCPX_DISABLE_DAEMON;
    process.env.MCPX_DISABLE_DAEMON = "1";
    const server: { transport: "stdio"; command: string; args: string[] } = {
      transport: "stdio",
      command: process.execPath,
      args: [path.join(import.meta.dir, "fixtures", "stdio-server.mjs")],
    };

    try {
      expect(await listMcpTools(server)).toContainEqual(
        expect.objectContaining({
          name: "echo",
          title: "Echo",
          description: "Echo a fixed response",
        }),
      );
      expect(await callMcpTool(server, "echo", {})).toMatchObject({
        content: [{ type: "text", text: "ok" }],
      });
    } finally {
      if (previous === undefined) {
        delete process.env.MCPX_DISABLE_DAEMON;
      } else {
        process.env.MCPX_DISABLE_DAEMON = previous;
      }
    }
  });
});
