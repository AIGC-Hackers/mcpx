import { describe, expect, it } from "bun:test";

import { formatMcpContent, printOutput } from "../src/output";
import { __test } from "../src/router";

describe("output format", () => {
  it("prints text MCP content directly by default", async () => {
    const log = captureConsoleLog();
    try {
      await printOutput({ content: [{ type: "text", text: "ok" }] }, { output: "toon" });

      expect(log.calls[0]?.[0]).toBe("ok");
    } finally {
      log.restore();
    }
  });

  it("prints JSON text MCP content as TOON by default", async () => {
    await expect(
      formatMcpContent([{ type: "text", text: '{"name":"Ada","age":30}' }]),
    ).resolves.toEqual(["name: Ada\nage: 30"]);
  });

  it("prints JSON text MCP content as raw text when --raw is selected", async () => {
    const log = captureConsoleLog();
    try {
      await printOutput(
        { content: [{ type: "text", text: '{"name":"Ada","age":30}' }] },
        { output: "raw" },
      );

      expect(log.calls[0]?.[0]).toBe('{"name":"Ada","age":30}');
    } finally {
      log.restore();
    }
  });

  it("prints TOON text MCP content as raw text when --raw is selected", async () => {
    await expect(
      formatMcpContent([{ type: "text", text: '"0":\n  id: 1\n  name: Drawout' }], "raw"),
    ).resolves.toEqual(['"0":\n  id: 1\n  name: Drawout']);
  });

  it("prints non-MCP values as raw JSON when --raw is selected", async () => {
    const log = captureConsoleLog();
    try {
      await printOutput({ name: "Ada" }, { output: "raw" });

      expect(log.calls[0]?.[0]).toBe('{\n  "name": "Ada"\n}');
    } finally {
      log.restore();
    }
  });

  it("keeps --raw from consuming the following command segment", () => {
    expect(__test.normalizeArgv(["--raw", "posthog", "docs-search", "--input", "{}"])).toEqual([
      "posthog",
      "docs-search",
      "--input",
      "{}",
      "--raw",
    ]);
  });

  it("rejects the old --json flag", () => {
    expect(__test.normalizeArgv(["posthog", "docs-search", "--json"])).toBeNull();
    expect(__test.normalizeArgv(["posthog", "docs-search", "--json=true"])).toBeNull();
  });

  it("saves non-text MCP content to a temp file", async () => {
    const [line] = await formatMcpContent([
      {
        type: "image",
        mimeType: "image/png",
        data: Buffer.from("png").toString("base64"),
      },
    ]);

    expect(line).toMatch(/^file saved .+\/mcpx-[a-f0-9]+\.png$/);
  });
});

function captureConsoleLog(): {
  calls: unknown[][];
  restore: () => void;
} {
  const original = console.log;
  const calls: unknown[][] = [];
  console.log = (...args: unknown[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console.log = original;
    },
  };
}
