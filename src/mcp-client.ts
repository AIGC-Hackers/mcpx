import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { resolveHeaders } from "./headers";
import type { McpTool, ServerConfig, ToolAnnotations } from "./types";
import { MCPX_VERSION } from "./version";

type ListToolsClient = {
  listTools: (params?: { cursor?: string }) => Promise<{
    tools?: RawMcpTool[] | undefined;
    nextCursor?: string | undefined;
  }>;
};

type RawMcpTool = {
  name: string;
  title?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  annotations?: unknown;
  _meta?: unknown;
};

export async function withMcpClient<T>(
  server: ServerConfig,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "mcpx", version: MCPX_VERSION });
  const transport =
    server.transport === "stdio"
      ? new StdioClientTransport(stdioTransportParams(server))
      : new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: {
            headers: await resolveHeaders(server),
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

function stdioTransportParams(server: ServerConfig) {
  if (server.transport !== "stdio") throw new Error("Expected stdio MCP server config.");

  const params: ConstructorParameters<typeof StdioClientTransport>[0] = {
    command: server.command,
    stderr: "pipe",
  };
  if (server.args) params.args = server.args;
  if (server.env) params.env = server.env;
  return params;
}

export async function listMcpTools(server: ServerConfig): Promise<McpTool[]> {
  return withMcpClient(server, async (client) => listAllMcpTools(client));
}

export async function listAllMcpTools(client: ListToolsClient): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...(response.tools ?? []).map(normalizeMcpTool));
    cursor = response.nextCursor;
  } while (cursor);

  return tools;
}

export function normalizeMcpTool(tool: RawMcpTool): McpTool {
  const normalized: McpTool = { name: tool.name };
  if (typeof tool.title === "string") normalized.title = tool.title;
  if (typeof tool.description === "string") normalized.description = tool.description;
  if (tool.inputSchema) normalized.inputSchema = tool.inputSchema;
  if (isToolAnnotations(tool.annotations)) normalized.annotations = tool.annotations;
  if (isRecord(tool._meta)) normalized._meta = tool._meta;
  return normalized;
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

function isToolAnnotations(value: unknown): value is ToolAnnotations {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
