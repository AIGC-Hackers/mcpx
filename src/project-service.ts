import { readRegistryConfig, writeRegistryConfig } from "./config";
import { refreshServer } from "./discovery";
import type { RegistryConfig, ServerConfig } from "./types";

export type ProjectService = {
  config: RegistryConfig;
  ensureServerReady: (name: string) => Promise<ServerConfig>;
  save: () => Promise<void>;
};

export async function loadProjectService(): Promise<ProjectService> {
  const config = await readRegistryConfig();

  return {
    config,
    ensureServerReady: async (name: string) => {
      const server = config.servers[name];
      if (!server) {
        throw new Error(
          `Unknown MCP server "${name}". Run "mcpx add --name ${name} --url <url>" first.`,
        );
      }
      if (server.tools && server.tools.length > 0) {
        return server;
      }
      const refreshed = await refreshServer(server);
      config.servers[name] = refreshed;
      await writeRegistryConfig(config);
      return refreshed;
    },
    save: () => writeRegistryConfig(config),
  };
}
