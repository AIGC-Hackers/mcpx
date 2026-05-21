import { createHash } from "node:crypto";

import type { StdioServerConfig } from "./types";
import { MCPX_VERSION } from "./version";

export const DAEMON_PROTOCOL_VERSION = 1;
export const DAEMON_ENV = "MCPX_DAEMON_SERVER";
export const DISABLE_DAEMON_ENV = "MCPX_DISABLE_DAEMON";

export type DaemonStatus = {
  pid: number;
  protocolVersion: number;
  version: string;
  activeServers: number;
  servers: {
    serverKey: string;
    labels: string[];
    pid: number | null;
    activeCalls: number;
    queuedCalls: number;
    idleMs: number;
  }[];
};

export type ClientMessage =
  | { op: "hello"; protocolVersion: number; clientVersion: string }
  | {
      op: "listTools";
      callId: string;
      serverName: string;
      serverKey: string;
      server: StdioServerConfig;
    }
  | {
      op: "call";
      callId: string;
      serverName: string;
      serverKey: string;
      server: StdioServerConfig;
      toolName: string;
      input: Record<string, unknown>;
    }
  | { op: "status" }
  | { op: "stop" };

export type DaemonMessage =
  | { ok: true; protocolVersion?: number; result?: unknown }
  | { ok: false; error: { code: string; message: string } };

export function shouldUseDaemon(): boolean {
  return process.env[DAEMON_ENV] !== "1" && process.env[DISABLE_DAEMON_ENV] !== "1";
}

export function buildServerKey(server: StdioServerConfig): string {
  const payload = stableJson({
    command: server.command,
    args: server.args ?? [],
    env: server.env ?? {},
    cwd: server.cwd ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function helloMessage(): ClientMessage {
  return {
    op: "hello",
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    clientVersion: MCPX_VERSION,
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortValue(record[key]);
  }
  return sorted;
}
