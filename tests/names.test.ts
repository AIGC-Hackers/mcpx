import { describe, expect, it } from "bun:test";

import { assertServerName, assignCommandNames, toCommandName } from "../src/names";

describe("tool command names", () => {
  it("normalizes MCP tool names into argc command keys", () => {
    expect(toCommandName("Alert Create")).toBe("alert-create");
    expect(toCommandName("query.error_tracking")).toBe("query-error_tracking");
  });

  it("rejects collisions instead of overwriting commands", () => {
    expect(() => assignCommandNames(["alert.create", "alert/create"])).toThrow(/both map/);
  });

  it("keeps the @ namespace reserved for mcpx control commands", () => {
    expect(assertServerName("add")).toBe("add");
    expect(() => assertServerName("@add")).toThrow(/Server name/);
  });
});
