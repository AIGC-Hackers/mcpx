import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "mcpx-stdio-fixture", version: "1.0.0" });

server.registerTool(
  "echo",
  {
    title: "Echo",
    description: "Echo a fixed response",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: "ok" }],
  }),
);

await server.connect(new StdioServerTransport());
