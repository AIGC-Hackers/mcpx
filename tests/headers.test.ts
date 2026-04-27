import { describe, expect, it } from "bun:test";

import { normalizeAuthScheme } from "../src/headers";

describe("headers", () => {
  it("canonicalizes bearer token auth scheme", () => {
    expect(normalizeAuthScheme("bearer")).toBe("Bearer");
    expect(normalizeAuthScheme("Bearer")).toBe("Bearer");
    expect(normalizeAuthScheme("BEARER")).toBe("Bearer");
    expect(normalizeAuthScheme("user")).toBe("Bearer");
    expect(normalizeAuthScheme("bot")).toBe("Bearer");
  });

  it("keeps non-bearer token auth schemes unchanged", () => {
    expect(normalizeAuthScheme("DPoP")).toBe("DPoP");
  });
});
