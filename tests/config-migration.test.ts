import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadServerDefinitions } from "../src/config.js";
import { migrateLegacyConfigs } from "../src/config-migration.js";

const IMPORT_FIXTURES = path.resolve(__dirname, "fixtures", "imports");

function copyFile(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

describe("config migration", () => {
  let workspaceDir: string;
  let fakeHomeDir: string;
  let homedirSpy: { mockRestore(): void } | undefined;

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpx-workspace-"));
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpx-home-"));
    homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHomeDir);
    process.env.HOME = fakeHomeDir;
    process.env.USERPROFILE = fakeHomeDir;
    process.env.APPDATA = path.join(fakeHomeDir, "AppData", "Roaming");
    fs.mkdirSync(process.env.APPDATA, { recursive: true });
    fs.cpSync(IMPORT_FIXTURES, workspaceDir, { recursive: true });
    // Codex fixtures use config.toml in the repo; migration expects mcp.toml.
    const codexSource = path.join(IMPORT_FIXTURES, ".codex", "config.toml");
    copyFile(codexSource, path.join(workspaceDir, ".codex", "mcp.toml"));
    seedHomeConfigs(fakeHomeDir);
  });

  afterEach(() => {
    homedirSpy?.mockRestore();
    process.env.HOME = undefined;
    process.env.USERPROFILE = undefined;
    process.env.APPDATA = undefined;
    if (workspaceDir) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (fakeHomeDir) {
      fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    }
  });

  it("creates project and user configs from legacy sources", async () => {
    const logger = { warn: vi.fn(), log: vi.fn() };
    const result = await migrateLegacyConfigs({ rootDir: workspaceDir, logger });
    expect(result.wroteHomeConfig).toBe(true);
    expect(result.wroteProjectConfig).toBe(true);

    const projectConfigPath = path.join(workspaceDir, "mcp.json");
    expect(fs.existsSync(projectConfigPath)).toBe(true);
    const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
      imports?: string[];
    };
    expect(projectConfig.mcpServers["local-only"]).toBeDefined();
    expect(projectConfig.mcpServers["cursor-only"]).toBeDefined();
    expect(projectConfig.imports).toBeUndefined();

    const homeConfigPath = path.join(fakeHomeDir, ".mcpx", "mcp.json");
    expect(fs.existsSync(homeConfigPath)).toBe(true);
    const homeConfig = JSON.parse(fs.readFileSync(homeConfigPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(homeConfig.mcpServers)).toEqual(
      expect.arrayContaining(["shared", "claude-only", "windsurf-only", "vscode-only"]),
    );
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("config load order", () => {
  let workspaceDir: string;
  let fakeHomeDir: string;
  let homedirSpy: { mockRestore(): void } | undefined;

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpx-load-"));
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcpx-home-"));
    homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(fakeHomeDir);
    process.env.HOME = fakeHomeDir;
    process.env.USERPROFILE = fakeHomeDir;
    const projectConfigPath = path.join(workspaceDir, "mcp.json");
    fs.writeFileSync(
      projectConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            shared: { baseUrl: "https://project.local/mcp" },
            projectOnly: { baseUrl: "https://project-only.local/mcp" },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const homeConfigPath = path.join(fakeHomeDir, ".mcpx", "mcp.json");
    fs.mkdirSync(path.dirname(homeConfigPath), { recursive: true });
    fs.writeFileSync(
      homeConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            shared: { baseUrl: "https://home.local/mcp" },
            homeOnly: { baseUrl: "https://home-only.local/mcp" },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  });

  afterEach(() => {
    homedirSpy?.mockRestore();
    process.env.HOME = undefined;
    process.env.USERPROFILE = undefined;
    if (workspaceDir) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (fakeHomeDir) {
      fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    }
  });

  it("prefers project config over user config when merging", async () => {
    const servers = await loadServerDefinitions({ rootDir: workspaceDir });
    const names = servers.map((server) => server.name).sort((a, b) => a.localeCompare(b));
    const expected = ["homeOnly", "projectOnly", "shared"].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(expected);
    const shared = servers.find((server) => server.name === "shared");
    expect(shared?.command.kind).toBe("http");
    expect(shared?.command.kind === "http" ? shared.command.url.toString() : undefined).toBe(
      "https://project.local/mcp",
    );
    const homeOnly = servers.find((server) => server.name === "homeOnly");
    expect(homeOnly?.command.kind === "http" ? homeOnly.command.url.toString() : undefined).toBe(
      "https://home-only.local/mcp",
    );
  });
});

function seedHomeConfigs(fakeHomeDir: string): void {
  const codexSource = path.join(IMPORT_FIXTURES, ".codex", "config.toml");
  copyFile(codexSource, path.join(fakeHomeDir, ".codex", "mcp.toml"));
  const windsurfSource = path.join(IMPORT_FIXTURES, "home", ".codeium", "windsurf", "mcp_config.json");
  copyFile(windsurfSource, path.join(fakeHomeDir, ".codeium", "windsurf", "mcp_config.json"));
  const vscodeSource = path.join(
    IMPORT_FIXTURES,
    "home",
    "Library",
    "Application Support",
    "Code",
    "User",
    "mcp.json",
  );
  copyFile(vscodeSource, path.join(fakeHomeDir, "Library", "Application Support", "Code", "User", "mcp.json"));
  copyFile(vscodeSource, path.join(fakeHomeDir, ".config", "Code", "User", "mcp.json"));
  const appData = path.join(fakeHomeDir, "AppData", "Roaming");
  copyFile(vscodeSource, path.join(appData, "Code", "User", "mcp.json"));
}
