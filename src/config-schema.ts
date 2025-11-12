import {
  array,
  object,
  optional,
  picklist,
  record,
  string,
  union,
  type InferOutput,
} from "valibot";

const IMPORT_KIND_VALUES = [
  "cursor",
  "claude-code",
  "claude-desktop",
  "codex",
  "windsurf",
  "vscode",
] as const;

export const ImportKindSchema = picklist(IMPORT_KIND_VALUES);

export type ImportKind = InferOutput<typeof ImportKindSchema>;

export const DEFAULT_IMPORTS: ImportKind[] = [
  "cursor",
  "claude-code",
  "claude-desktop",
  "codex",
  "windsurf",
  "vscode",
];

const optionalString = () => optional(string());
const stringArray = array(string());
const optionalStringRecord = optional(record(string(), string()));

export const RawEntrySchema = object({
  description: optionalString(),
  baseUrl: optionalString(),
  base_url: optionalString(),
  url: optionalString(),
  serverUrl: optionalString(),
  server_url: optionalString(),
  command: optional(union([string(), stringArray])),
  executable: optionalString(),
  args: optional(stringArray),
  headers: optionalStringRecord,
  env: optionalStringRecord,
  auth: optionalString(),
  tokenCacheDir: optionalString(),
  token_cache_dir: optionalString(),
  clientName: optionalString(),
  client_name: optionalString(),
  oauthRedirectUrl: optionalString(),
  oauth_redirect_url: optionalString(),
  bearerToken: optionalString(),
  bearer_token: optionalString(),
  bearerTokenEnv: optionalString(),
  bearer_token_env: optionalString(),
});

export const RawConfigSchema = object({
  mcpServers: record(string(), RawEntrySchema),
  imports: optional(array(ImportKindSchema)),
});

export type RawEntry = InferOutput<typeof RawEntrySchema>;
export type RawConfig = InferOutput<typeof RawConfigSchema>;

export interface HttpCommand {
  readonly kind: "http";
  readonly url: URL;
  readonly headers?: Record<string, string>;
}

export interface StdioCommand {
  readonly kind: "stdio";
  readonly command: string;
  readonly args: string[];
  readonly cwd: string;
}

export type CommandSpec = HttpCommand | StdioCommand;

export interface ServerSource {
  readonly kind: "local" | "import";
  readonly path: string;
}

export interface ServerDefinition {
  readonly name: string;
  readonly description?: string;
  readonly command: CommandSpec;
  readonly env?: Record<string, string>;
  readonly auth?: string;
  readonly tokenCacheDir?: string;
  readonly clientName?: string;
  readonly oauthRedirectUrl?: string;
  readonly source?: ServerSource;
}

export interface LoadConfigOptions {
  readonly configPath?: string;
  readonly rootDir?: string;
}
