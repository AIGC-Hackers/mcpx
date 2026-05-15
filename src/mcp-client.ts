import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
