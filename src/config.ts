import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { assignCommandNames } from "./names";
import type { RegistryConfig, ServerConfig } from "./types";

const CONFIG_PATH = path.join(".agents", "mcpx", "servers.json");

export function getRegistryConfigPath(): string {
  return path.join(homedir(), CONFIG_PATH);
}

export async function readRegistryConfig(): Promise<RegistryConfig> {
  const filePath = getRegistryConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as RegistryConfig;
    if (parsed.version !== 1 || !parsed.servers || typeof parsed.servers !== "object") {
      throw new Error(`Invalid mcpx registry config at ${filePath}.`);
    }
    return normalizeRegistryConfig(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, servers: {} };
    }
    throw error;
  }
}

export async function writeRegistryConfig(config: RegistryConfig): Promise<void> {
  const filePath = getRegistryConfigPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function upsertServerConfig(
  name: string,
  server: ServerConfig,
): Promise<RegistryConfig> {
  const config = await readRegistryConfig();
  config.servers[name] = server;
  await writeRegistryConfig(config);
  return config;
}

export async function removeServerConfig(name: string): Promise<ServerConfig | undefined> {
  const config = await readRegistryConfig();
  const removed = removeServerFromConfig(config, name);
  if (removed) {
    await writeRegistryConfig(config);
  }
  return removed;
}

export function removeServerFromConfig(
  config: RegistryConfig,
  name: string,
): ServerConfig | undefined {
  const removed = config.servers[name];
  if (!removed) return undefined;
  delete config.servers[name];
  return removed;
}

export function normalizeRegistryConfig(config: RegistryConfig): RegistryConfig {
  const servers: Record<string, ServerConfig> = {};

  for (const [name, server] of Object.entries(config.servers)) {
    servers[name] = normalizeServerConfig(server);
  }

  return {
    version: config.version,
    servers,
  };
}

function normalizeServerConfig(server: ServerConfig): ServerConfig {
  if (!server.tools || server.tools.length === 0) return server;

  const commandNames = assignCommandNames(server.tools.map((tool) => tool.name));
  return {
    ...server,
    tools: server.tools.map((tool) => {
      return {
        ...tool,
        commandName: commandNames.get(tool.name) ?? tool.name,
      };
    }),
  };
}
