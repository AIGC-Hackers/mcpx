import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { c, cli, createDefaultSchemaExplorer, group, type Router } from "argc";
import * as v from "valibot";

import { removeServerConfig, upsertServerConfig } from "./config";
import { callMcpTool } from "./mcp-client";
import { describeAuth, discoverServer, refreshServer } from "./discovery";
import { jsonSchemaToStandardSchema } from "./json-schema-standard";
import { assertServerName } from "./names";
import { printOutput, type McpxContext } from "./output";
import { loadProjectService, type ProjectService } from "./project-service";
import { runSkillCommand } from "./skill-command";
import { removeOAuthToken } from "./token-cache";

const s = toStandardJsonSchema;
const RESERVED_SERVER_NAMES = new Set(["add", "remove", "skill"]);

type HandlerOptions<TInput extends Record<string, unknown>> = {
  input: TInput;
  context: McpxContext;
};

const globalInput = s(
  v.object({
    raw: v.optional(v.boolean()),
  }),
);

const addInput = s(
  v.object({
    name: v.pipe(v.string(), v.description("Global server name")),
    url: v.pipe(v.string(), v.url(), v.description("MCP Streamable HTTP endpoint URL")),
    bearerEnv: v.optional(v.string()),
  }),
);

const removeInput = s(
  v.object({
    name: v.pipe(v.string(), v.description("Global server name")),
  }),
);

const skillInput = s(
  v.object({
    server: v.optional(v.array(v.string())),
  }),
);

export async function runMcpx(argv: string[], cwd: string): Promise<void> {
  const service = await loadProjectService();
  await refreshMissingSchemas(service);

  const app = cli(buildRouter(service), {
    name: "mcpx",
    version: "0.1.0",
    description: "Global MCP registry and agent-facing command surface.",
    globals: globalInput,
    context: (globals) => {
      return { output: globals.raw ? "raw" : "toon" };
    },
    schemaMaxLines: 240,
    schemaExplorer: createDefaultSchemaExplorer({
      selectionDepth: 2,
      maxLines: 240,
    }),
  });

  const normalizedArgv = normalizeArgv(argv);
  if (!normalizedArgv) {
    console.error('Invalid option "--json". Use "--raw" to disable output optimization.');
    process.exit(1);
  }

  await app.run({ handlers: buildHandlers(service, cwd) } as never, normalizedArgv);
}

function normalizeArgv(argv: string[]): string[] | null {
  if (argv.some((arg) => arg === "--json" || arg.startsWith("--json="))) return null;
  if (!argv.includes("--raw")) return argv;
  return [...argv.filter((arg) => arg !== "--raw"), "--raw"];
}

function buildRouter(service: ProjectService): Router {
  return {
    ...buildServerRouter(service),
    add: c
      .meta({
        description: "Add a global MCP server and discover its auth and tool schema.",
        examples: [
          "mcpx add --name posthog --url https://mcp.posthog.com/mcp --bearer-env POSTHOG_AUTH_HEADER",
        ],
      })
      .input(addInput),
    remove: c
      .meta({
        description: "Remove a global MCP server and its cached credentials.",
        examples: ["mcpx remove --name posthog"],
      })
      .input(removeInput),
    skill: c
      .meta({
        description:
          "Generate a project skill that teaches agents which global MCP servers to use.",
        examples: ["mcpx skill", "mcpx skill --server posthog --server sentry"],
      })
      .input(skillInput),
  };
}

function buildServerRouter(service: ProjectService): Record<string, Router> {
  const servers: Record<string, Router> = {};
  for (const [serverName, server] of Object.entries(service.config.servers)) {
    const tools = server.tools ?? [];
    const children: Record<string, Router> = {};
    for (const tool of tools) {
      children[tool.commandName] = c
        .meta({
          description: tool.description ?? `Call ${serverName}.${tool.name}`,
        })
        .input(jsonSchemaToStandardSchema(tool.inputSchema));
    }
    servers[serverName] = group(
      { description: `${serverName} tools (${describeAuth(server.auth)})` },
      children,
    );
  }
  return servers;
}

function buildHandlers(service: ProjectService, cwd: string): Record<string, unknown> {
  const handlers: Record<string, unknown> = {};

  for (const [serverName, server] of Object.entries(service.config.servers)) {
    const serverHandlers: Record<string, unknown> = {};
    for (const tool of server.tools ?? []) {
      serverHandlers[tool.commandName] = async (
        options: HandlerOptions<Record<string, unknown>>,
      ) => {
        const readyServer = await service.ensureServerReady(serverName);
        const result = await callMcpTool(readyServer, tool.name, options.input);
        await printOutput(result, options.context);
      };
    }
    handlers[serverName] = serverHandlers;
  }

  handlers.add = async (
    options: HandlerOptions<{ name: string; url: string; bearerEnv?: string }>,
  ) => {
    const input = options.input;
    const name = assertServerName(input.name);
    if (RESERVED_SERVER_NAMES.has(name)) {
      throw new Error(`"${name}" is reserved by mcpx and cannot be used as an MCP server name.`);
    }
    const discoverOptions: { url: string; bearerEnv?: string } = {
      url: input.url,
    };
    if (input.bearerEnv) discoverOptions.bearerEnv = input.bearerEnv;
    const result = await discoverServer({ ...discoverOptions, name });
    await upsertServerConfig(name, result.server);
    await printOutput(
      {
        name,
        status: result.status,
        auth: result.server.auth,
        tools: result.server.tools?.length ?? 0,
        message: result.message,
      },
      options.context,
    );
  };

  handlers.remove = async (options: HandlerOptions<{ name: string }>) => {
    const name = assertServerName(options.input.name);
    const removed = await removeServerConfig(name);
    if (!removed) {
      throw new Error(`Unknown MCP server "${name}".`);
    }
    const tokenRemoved =
      removed.auth.kind === "oauth-token" ? await removeOAuthToken(removed.auth.tokenKey) : false;
    await printOutput(
      {
        name,
        removed: true,
        tokenRemoved,
      },
      options.context,
    );
  };

  handlers.skill = async (options: HandlerOptions<{ server?: string | string[] }>) => {
    await runSkillCommand(service, cwd, options.input);
  };

  return handlers;
}

async function refreshMissingSchemas(service: ProjectService): Promise<void> {
  let changed = false;

  for (const [name, server] of Object.entries(service.config.servers)) {
    if (server.tools && server.tools.length > 0) continue;
    try {
      service.config.servers[name] = await refreshServer(server);
      changed = true;
    } catch {
      // Keep startup usable when auth is not available yet; add/discover records
      // the auth state so the next run can retry after credentials are configured.
    }
  }

  if (changed) {
    await service.save();
  }
}

export const __test = {
  buildServerRouter,
  buildRouter,
  buildHandlers,
  normalizeArgv,
};
