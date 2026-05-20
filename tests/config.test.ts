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

  it("preserves cached MCP tool metadata", () => {
    const config = {
      version: 1,
      servers: {
        browser: {
          url: "https://browser.example/mcp",
          auth: { kind: "none" },
          tools: [
            {
              name: "close_page",
              commandName: "stale",
              title: "Close Page",
              annotations: { destructiveHint: true },
              _meta: { source: "server" },
            },
          ],
        },
      },
    } as unknown as RegistryConfig;

    expect(normalizeRegistryConfig(config).servers.browser?.tools?.[0]).toMatchObject({
      commandName: "close_page",
      title: "Close Page",
      annotations: { destructiveHint: true },
      _meta: { source: "server" },
    });
  });

  it("drops stale cached output schemas", () => {
    const config = {
      version: 1,
      servers: {
        browser: {
          url: "https://browser.example/mcp",
          auth: { kind: "none" },
          tools: [
            {
              name: "list_pages",
              outputSchema: { type: "object" },
            },
          ],
        },
      },
    } as unknown as RegistryConfig;

    expect(normalizeRegistryConfig(config).servers.browser?.tools?.[0]).not.toHaveProperty(
      "outputSchema",
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

    const removed = removeServerFromConfig(config, "posthog");
    expect(removed?.transport).not.toBe("stdio");
    expect(removed && removed.transport !== "stdio" ? removed.url : undefined).toBe(
      "https://mcp.posthog.com/mcp",
    );
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
