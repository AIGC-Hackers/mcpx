import { describe, expect, it } from "bun:test";

import { chooseOAuthScope, parseOAuthTokenResponse, shouldRefreshOAuthToken } from "../src/oauth";

describe("oauth", () => {
  it("uses protected-resource scopes that are supported by the authorization server", () => {
    expect(chooseOAuthScope(["openid", "profile", "alert:read"], ["openid", "alert:read"])).toBe(
      "openid alert:read",
    );
  });

  it("refreshes oauth tokens one minute before expiry", () => {
    const now = new Date("2026-04-27T08:00:00.000Z");

    expect(
      shouldRefreshOAuthToken(
        {
          accessToken: "access",
          tokenType: "Bearer",
          expiresAt: "2026-04-27T08:00:59.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      shouldRefreshOAuthToken(
        {
          accessToken: "access",
          tokenType: "Bearer",
          expiresAt: "2026-04-27T08:01:01.000Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("uses Slack authed_user token payloads", () => {
    expect(
      parseOAuthTokenResponse(
        {
          ok: true,
          access_token: "xoxb-bot",
          token_type: "bot",
          authed_user: {
            access_token: "xoxp-user",
            refresh_token: "refresh-user",
            token_type: "user",
            scope: "search:read.users",
            expires_in: 3600,
          },
        },
        {
          clientId: "client-id",
          clientSecretKey: "oauth-client:client-id",
        },
      ),
    ).toMatchObject({
      accessToken: "xoxp-user",
      clientId: "client-id",
      clientSecretKey: "oauth-client:client-id",
      refreshToken: "refresh-user",
      tokenType: "user",
      scope: "search:read.users",
    });
  });
});
