import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "valibot";
import { normalizeServerEntry } from "@/config-normalize.js";
import {
  type LoadConfigOptions,
  type RawConfig,
  RawConfigSchema,
  type RawEntry,
  RawEntrySchema,
  type ServerDefinition,
  type ServerSource,
} from "@/config-schema.js";
import { migrateLegacyConfigs } from "@/config-migration.js";

export { toFileUrl } from "@/config-imports.js";
export { __configInternals } from "@/config-normalize.js";
export type {
  CommandSpec,
  HttpCommand,
  LoadConfigOptions,
  ServerDefinition,
  ServerSource,
  StdioCommand,
} from "@/config-schema.js";

export async function loadServerDefinitions(
  options: LoadConfigOptions = {},
): Promise<ServerDefinition[]> {
  const rootDir = options.rootDir ?? process.cwd();
  const targets = resolveConfigTargets(options.configPath, rootDir);

  if (!options.configPath && !(await hasExistingConfig(targets))) {
    await migrateLegacyConfigs({ rootDir });
  }

  const merged = new Map<string, { raw: RawEntry; baseDir: string; source: ServerSource }>();

  for (const target of targets) {
    const config = await readConfigFile(target.path, target.optional);
    if (!config) {
      continue;
    }
    for (const [name, entryRaw] of Object.entries(config.mcpServers)) {
      if (target.skipIfExists && merged.has(name)) {
        continue;
      }
      const parsedEntry = parse(RawEntrySchema, entryRaw);
      merged.set(name, {
        raw: parsedEntry,
        baseDir: path.dirname(target.path),
        source: { kind: "local", path: target.path },
      });
    }
  }

  const servers: ServerDefinition[] = [];
  for (const [name, { raw, baseDir: entryBaseDir, source }] of merged) {
    servers.push(normalizeServerEntry(name, raw, entryBaseDir, source));
  }

  return servers;
}

interface ConfigTarget {
  readonly path: string;
  readonly optional: boolean;
  readonly skipIfExists: boolean;
}

function resolveConfigTargets(configPath: string | undefined, rootDir: string): ConfigTarget[] {
  if (configPath) {
    return [{ path: path.resolve(configPath), optional: false, skipIfExists: false }];
  }
  const projectPath = path.resolve(rootDir, "mcp.json");
  const homePath = path.join(os.homedir(), ".mcpx", "mcp.json");
  return [
    { path: projectPath, optional: true, skipIfExists: false },
    { path: homePath, optional: true, skipIfExists: true },
  ];
}

async function hasExistingConfig(targets: ConfigTarget[]): Promise<boolean> {
  for (const target of targets) {
    if (await fileExists(target.path)) {
      return true;
    }
  }
  return false;
}

async function readConfigFile(configPath: string, optional: boolean): Promise<RawConfig | null> {
  try {
    const buffer = await fs.readFile(configPath, "utf8");
    return parse(RawConfigSchema, JSON.parse(buffer));
  } catch (error) {
    if (optional && isErrno(error, "ENOENT")) {
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
  return Boolean(
    error && typeof error === "object" && (error as NodeJS.ErrnoException).code === code,
  );
}
