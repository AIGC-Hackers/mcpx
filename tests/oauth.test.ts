import { describe, expect, it } from "bun:test";

import { chooseOAuthScope } from "../src/oauth";

describe("oauth", () => {
  it("uses protected-resource scopes that are supported by the authorization server", () => {
    expect(chooseOAuthScope(["openid", "profile", "alert:read"], ["openid", "alert:read"])).toBe(
      "openid alert:read",
    );
  });
});
