import { discoverAuth } from "./auth-discovery";
import { authenticateOAuthServer } from "./oauth";
import { authFromBearerValues, describeBearerAuth } from "./bearer";
import { resolveProbeHeaders } from "./headers";
import { assignCommandNames } from "./names";
import { listMcpTools } from "./mcp-client";
import type {
  AuthDiscovery,
  DiscoveryResult,
  McpTool,
  ServerConfig,
  ToolDefinition,
} from "./types";

export type DiscoverServerOptions = {
  name: string;
} & (
  | {
      transport?: "http";
      url: string;
      bearer?: string | string[];
      headers?: Record<string, string>;
      interactiveAuth?: boolean;
    }
  | {
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
);

export async function discoverServer(options: DiscoverServerOptions): Promise<DiscoveryResult> {
  if (options.transport === "stdio") return discoverStdioServer(options);

  const url = new URL(options.url);
  const configuredAuth = authFromBearerValues(options.bearer);
  const seedServer: ServerConfig = {
    transport: "http",
    url: url.toString(),
    auth: configuredAuth ?? { kind: "none" },
  };
  if (options.headers) seedServer.headers = options.headers;

  const discoveredAuth =
    configuredAuth ?? (await discoverAuth(url, resolveProbeHeaders(seedServer)));
  let auth = discoveredAuth;
  try {
    if (options.interactiveAuth !== false && discoveredAuth.kind === "oauth") {
      auth = await authenticateOAuthServer(options.name, url, discoveredAuth);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      server: {
        ...seedServer,
        auth: discoveredAuth,
        discoveredAt: new Date().toISOString(),
      },
      status: "auth-required",
      message,
    };
  }
  const server: ServerConfig = {
    ...seedServer,
    auth,
    discoveredAt: new Date().toISOString(),
  };

  try {
    const tools = await listMcpTools(server, options.name);
    server.tools = normalizeTools(tools);
    return { server, status: "ready", message: `Discovered ${server.tools.length} tool(s).` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (auth.kind === "oauth" || auth.kind === "unknown") {
      return {
        server,
        status: "auth-required",
        message: `Authentication is required before tool schemas can be listed. ${message}`,
      };
    }
    return { server, status: "unreachable", message };
  }
}

async function discoverStdioServer(
  options: DiscoverServerOptions & { transport: "stdio" },
): Promise<DiscoveryResult> {
  const seedServer: ServerConfig = {
    transport: "stdio",
    command: options.command,
  };
  if (options.args) seedServer.args = options.args;
  if (options.env) seedServer.env = options.env;

  const server: ServerConfig = {
    ...seedServer,
    discoveredAt: new Date().toISOString(),
  };

  try {
    const tools = await listMcpTools(server, options.name);
    server.tools = normalizeTools(tools);
    return { server, status: "ready", message: `Discovered ${server.tools.length} tool(s).` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { server, status: "unreachable", message };
  }
}

export async function refreshServer(server: ServerConfig, name = "stdio"): Promise<ServerConfig> {
  const tools = await listMcpTools(server, name);
  return {
    ...server,
    discoveredAt: new Date().toISOString(),
    tools: normalizeTools(tools),
  };
}

export async function reauthenticateServer(
  name: string,
  server: ServerConfig,
): Promise<ServerConfig> {
  if (server.transport === "stdio") {
    throw new Error(`Server "${name}" uses stdio and does not support OAuth re-authentication.`);
  }

  const url = new URL(server.url);
  const discoveredAuth = await discoverAuth(
    url,
    resolveProbeHeaders({ ...server, auth: { kind: "none" } }),
  );
  if (discoveredAuth.kind !== "oauth") {
    throw new Error(`Server "${name}" did not advertise OAuth authentication metadata.`);
  }

  const auth = await authenticateOAuthServer(name, url, discoveredAuth);
  return {
    ...server,
    auth,
  };
}

export function normalizeTools(tools: McpTool[]): ToolDefinition[] {
  const names = tools.map((tool) => tool.name);
  const commandNames = assignCommandNames(names);
  return tools.map((tool) => {
    const normalized: ToolDefinition = {
      name: tool.name,
      commandName: commandNames.get(tool.name) ?? tool.name,
    };
    if (tool.title) normalized.title = tool.title;
    if (tool.description) normalized.description = tool.description;
    if (isJsonSchema(tool.inputSchema)) normalized.inputSchema = tool.inputSchema;
    if (tool.annotations) normalized.annotations = tool.annotations;
    if (tool._meta) normalized._meta = tool._meta;
    return normalized;
  });
}

export function describeAuth(auth: AuthDiscovery): string {
  switch (auth.kind) {
    case "none":
      return "none";
    case "bearer":
      return describeBearerAuth(auth);
    case "oauth":
      return `oauth ${auth.confidence}`;
    case "oauth-token":
      return "oauth token";
    case "unknown":
      return `unknown: ${auth.reason}`;
  }
}

function isJsonSchema(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
