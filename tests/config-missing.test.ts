import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { loadServerDefinitions } from "../src/config.js";

describe("loadServerDefinitions when config is optional", () => {
  it("migrates legacy sources when both default configs are missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcpx-config-missing-"));
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "mcpx-home-"));
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    process.env.HOME = fakeHome;
    try {
      const servers = await loadServerDefinitions({ rootDir: tempDir });
      expect(servers).toEqual([]);
      const userConfigPath = path.join(fakeHome, ".mcpx", "mcp.json");
      await expect(fs.readFile(userConfigPath, "utf8")).resolves.toContain("mcpServers");
    } finally {
      homedirSpy.mockRestore();
      process.env.HOME = undefined;
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(fakeHome, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("still throws when an explicit config path is missing", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcpx-config-explicit-"));
    const explicitPath = path.join(tempDir, "does-not-exist.json");
    await expect(loadServerDefinitions({ configPath: explicitPath })).rejects.toThrow();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
