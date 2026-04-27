import { describe, expect, it } from "bun:test";

import { normalizeRegistryConfig, removeServerFromConfig } from "../src/config";
import type { RegistryConfig } from "../src/types";

describe("registry config", () => {
  it("derives command names for cached tool schemas", () => {
    const config = {
      version: 1,
      servers: {
        posthog: {
          url: "https://mcp.posthog.com/mcp",
          auth: { kind: "none" },
          tools: [
            {
              name: "alert.create",
              description: "Create an alert",
            },
          ],
        },
      },
    } as unknown as RegistryConfig;

    expect(normalizeRegistryConfig(config).servers.posthog?.tools?.[0]?.commandName).toBe(
      "alert-create",
    );
  });

  it("removes a server from registry config", () => {
    const config = {
      version: 1,
      servers: {
        posthog: {
          url: "https://mcp.posthog.com/mcp",
          auth: { kind: "oauth-token", tokenKey: "posthog", confidence: "confirmed" },
        },
      },
    } as RegistryConfig;

    expect(removeServerFromConfig(config, "posthog")?.url).toBe("https://mcp.posthog.com/mcp");
    expect(config.servers.posthog).toBeUndefined();
  });

  it("keeps registry config unchanged when removing an unknown server", () => {
    const config = {
      version: 1,
      servers: {},
    } as RegistryConfig;

    expect(removeServerFromConfig(config, "posthog")).toBeUndefined();
    expect(config.servers).toEqual({});
  });
});
