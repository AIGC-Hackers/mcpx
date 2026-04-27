import { describe, expect, it } from "bun:test";

import { removeOAuthTokenFromCache } from "../src/token-cache";
import type { TokenCache } from "../src/types";

describe("token cache", () => {
  it("removes an oauth token from cache", () => {
    const cache: TokenCache = {
      version: 1,
      oauth: {
        posthog: {
          accessToken: "secret",
          tokenType: "Bearer",
          clientSecretKey: "oauth-client:posthog",
        },
      },
      oauthClientSecrets: {
        "oauth-client:posthog": "client-secret",
      },
    };

    expect(removeOAuthTokenFromCache(cache, "posthog")).toBe(true);
    expect(cache.oauth.posthog).toBeUndefined();
    expect(cache.oauthClientSecrets?.["oauth-client:posthog"]).toBeUndefined();
  });

  it("keeps cache unchanged when removing an unknown token", () => {
    const cache: TokenCache = {
      version: 1,
      oauth: {},
    };

    expect(removeOAuthTokenFromCache(cache, "posthog")).toBe(false);
    expect(cache.oauth).toEqual({});
  });
});
