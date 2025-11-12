import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "valibot";
import {
  DEFAULT_IMPORTS,
  RawConfigSchema,
  RawEntrySchema,
  type ImportKind,
  type RawConfig,
  type RawEntry,
} from "@/config-schema.js";
import { pathsForImport, readExternalEntries } from "@/config-imports.js";
import { expandHome } from "@/env.js";

export interface MigrationOptions {
  readonly rootDir?: string;
  readonly logger?: Pick<typeof console, "warn" | "log">;
}

export interface MigrationResult {
  readonly homeConfigPath: string;
  readonly projectConfigPath?: string;
  readonly importedServers: string[];
  readonly wroteHomeConfig: boolean;
  readonly wroteProjectConfig: boolean;
}

export async function migrateLegacyConfigs(options: MigrationOptions = {}): Promise<MigrationResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const logger = options.logger ?? console;
  const projectConfigPath = path.resolve(rootDir, "mcp.json");
  const legacyProjectPath = path.resolve(rootDir, "config", "mcpx.json");
  const homeConfigPath = path.join(os.homedir(), ".mcpx", "mcp.json");

  const legacyConfig = await readLegacyConfig(legacyProjectPath);
  const imports = resolveImportKinds(legacyConfig?.imports);

  const wroteProjectConfig = await ensureProjectConfig(projectConfigPath, legacyConfig);
  const { wroteHomeConfig, importedServers } = await writeHomeConfig(homeConfigPath, imports, rootDir);

  if (wroteHomeConfig || wroteProjectConfig) {
    const createdTargets = [wroteProjectConfig ? projectConfigPath : undefined, wroteHomeConfig ? homeConfigPath : undefined]
      .filter(Boolean)
      .join(", ");
    logger.warn?.(`mcpx migrated legacy config to ${createdTargets}`);
  }

  return {
    homeConfigPath,
    projectConfigPath: wroteProjectConfig ? projectConfigPath : undefined,
    importedServers,
    wroteHomeConfig,
    wroteProjectConfig,
  };
}

function resolveImportKinds(imports: ImportKind[] | undefined): ImportKind[] {
  if (!imports) {
    return DEFAULT_IMPORTS;
  }
  if (imports.length === 0) {
    return [];
  }
  return [...imports, ...DEFAULT_IMPORTS.filter((kind) => !imports.includes(kind))];
}

async function ensureProjectConfig(projectConfigPath: string, legacyConfig: RawConfig | null): Promise<boolean> {
  if (!legacyConfig || Object.keys(legacyConfig.mcpServers).length === 0) {
    return false;
  }
  if (await fileExists(projectConfigPath)) {
    return false;
  }
  const sanitized: RawConfig = { mcpServers: legacyConfig.mcpServers };
  await fs.writeFile(projectConfigPath, JSON.stringify(sanitized, null, 2));
  return true;
}

async function writeHomeConfig(
  homeConfigPath: string,
  imports: ImportKind[],
  rootDir: string,
): Promise<{ wroteHomeConfig: boolean; importedServers: string[] }> {
  if (await fileExists(homeConfigPath)) {
    return { wroteHomeConfig: false, importedServers: [] };
  }
  const merged = new Map<string, RawEntry>();
  for (const importKind of imports) {
    const candidates = pathsForImport(importKind, rootDir);
    for (const candidate of candidates) {
      const resolved = expandHome(candidate);
      const entries = await readExternalEntries(resolved);
      if (!entries) {
        continue;
      }
      for (const [name, entry] of entries) {
        if (merged.has(name)) {
          continue;
        }
        merged.set(name, parse(RawEntrySchema, entry));
      }
    }
  }
  const homeDir = path.dirname(homeConfigPath);
  await fs.mkdir(homeDir, { recursive: true });
  const serialized: RawConfig = { mcpServers: Object.fromEntries(merged) };
  await fs.writeFile(homeConfigPath, JSON.stringify(serialized, null, 2));
  return { wroteHomeConfig: true, importedServers: [...merged.keys()] };
}

async function readLegacyConfig(filePath: string): Promise<RawConfig | null> {
  try {
    const buffer = await fs.readFile(filePath, "utf8");
    return parse(RawConfigSchema, JSON.parse(buffer));
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isErrno(error: unknown, code: string): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && (error as NodeJS.ErrnoException).code === code);
}
