import { describe, expect, it } from "bun:test";

import { parseResourceMetadataUrl, parseResourceMetadataUrls } from "../src/auth-discovery";

describe("auth discovery", () => {
  it("extracts OAuth protected resource metadata URLs", () => {
    expect(
      parseResourceMetadataUrl(
        'Bearer resource_metadata="https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp"',
      ),
    ).toBe("https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp");
  });

  it("uses the last OAuth protected resource metadata URL when servers send duplicates", () => {
    const header =
      'Bearer realm="OAuth", resource_metadata="https://mcp.sentry.dev/.well-known/oauth-protected-resource", error="invalid_token", resource_metadata="https://mcp.sentry.dev/.well-known/oauth-protected-resource/mcp"';

    expect(parseResourceMetadataUrls(header)).toEqual([
      "https://mcp.sentry.dev/.well-known/oauth-protected-resource",
      "https://mcp.sentry.dev/.well-known/oauth-protected-resource/mcp",
    ]);
    expect(parseResourceMetadataUrl(header)).toBe(
      "https://mcp.sentry.dev/.well-known/oauth-protected-resource/mcp",
    );
  });
});
