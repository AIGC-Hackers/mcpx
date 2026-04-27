import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { resolveHeaders } from "./headers";
import type { McpTool, ServerConfig } from "./types";
import { MCPX_VERSION } from "./version";

export async function withMcpClient<T>(
  server: ServerConfig,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "mcpx", version: MCPX_VERSION });
  const headers = await resolveHeaders(server);
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers,
    },
  });

  try {
    await client.connect(transport as never);
    return await run(client);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

export async function listMcpTools(server: ServerConfig): Promise<McpTool[]> {
  return withMcpClient(server, async (client) => {
    const response = await client.listTools();
    return (response.tools ?? []).map((tool) => {
      const normalized: McpTool = { name: tool.name };
      if (tool.description) normalized.description = tool.description;
      if (tool.inputSchema) normalized.inputSchema = tool.inputSchema;
      if (tool.outputSchema) normalized.outputSchema = tool.outputSchema;
      return normalized;
    });
  });
}

export async function callMcpTool(
  server: ServerConfig,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  return withMcpClient(server, async (client) =>
    client.callTool({ name: toolName, arguments: input }),
  );
}
