import { describe, expect, it } from "bun:test";

import { parseResourceMetadataUrl } from "../src/auth-discovery";

describe("auth discovery", () => {
  it("extracts OAuth protected resource metadata URLs", () => {
    expect(
      parseResourceMetadataUrl(
        'Bearer resource_metadata="https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp"',
      ),
    ).toBe("https://mcp.posthog.com/.well-known/oauth-protected-resource/mcp");
  });
});
