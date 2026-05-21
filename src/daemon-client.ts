import net from "node:net";

import { ensureDaemonDir, daemonSocketPath } from "./daemon-paths";
import { requestJsonLine } from "./daemon-io";
import {
  DAEMON_PROTOCOL_VERSION,
  buildServerKey,
  helloMessage,
  type ClientMessage,
  type DaemonMessage,
  type DaemonStatus,
} from "./daemon-protocol";
import type { McpTool, StdioServerConfig } from "./types";

const START_TIMEOUT_MS = 3_000;
const CONNECT_RETRY_MS = 50;

export async function listToolsViaDaemon(
  server: StdioServerConfig,
  serverName: string,
): Promise<McpTool[]> {
  const result = await requestDaemon(
    {
      op: "listTools",
      callId: crypto.randomUUID(),
      serverName,
      serverKey: buildServerKey(server),
      server,
    },
    process.argv[1] ?? import.meta.path,
  );
  return result as McpTool[];
}

export async function callToolViaDaemon(
  server: StdioServerConfig,
  serverName: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  return requestDaemon(
    {
      op: "call",
      callId: crypto.randomUUID(),
      serverName,
      serverKey: buildServerKey(server),
      server,
      toolName,
      input,
    },
    process.argv[1] ?? import.meta.path,
  );
}

export async function daemonStatus(mainPath: string): Promise<DaemonStatus> {
  return requestDaemon({ op: "status" }, mainPath, { start: false }) as Promise<DaemonStatus>;
}

export async function stopDaemon(mainPath: string): Promise<unknown> {
  return requestDaemon({ op: "stop" }, mainPath, { start: false });
}

async function requestDaemon(
  message: ClientMessage,
  mainPath: string,
  options: { start?: boolean } = {},
): Promise<unknown> {
  const start = options.start ?? true;
  if (start) await ensureDaemon(mainPath);
  return withDaemonConnection(async (socket) => {
    await sendAndExpectOk(socket, helloMessage());
    return sendAndExpectOk(socket, message);
  });
}

async function ensureDaemon(mainPath: string): Promise<void> {
  const state = await probeDaemon();
  if (state === "compatible") return;
  if (state === "incompatible") {
    try {
      await stopIncompatibleDaemon();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop incompatible mcpxd: ${message}`);
    }
  }

  await ensureDaemonDir();
  Bun.spawn([process.execPath, mainPath, "@daemon", "server"], {
    env: {
      ...process.env,
      MCPX_DAEMON_SERVER: "1",
    },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }).unref();

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await canHandshake()) return;
    await sleep(CONNECT_RETRY_MS);
  }
  throw new Error("mcpxd did not start before the startup timeout.");
}

async function canHandshake(): Promise<boolean> {
  return (await probeDaemon()) === "compatible";
}

async function probeDaemon(): Promise<"compatible" | "incompatible" | "missing"> {
  try {
    const result = await withDaemonConnection((socket) => sendAndExpectOk(socket, helloMessage()));
    const version =
      typeof result === "object" && result !== null && "protocolVersion" in result
        ? result.protocolVersion
        : undefined;
    return version === DAEMON_PROTOCOL_VERSION ? "compatible" : "incompatible";
  } catch {
    return "missing";
  }
}

async function stopIncompatibleDaemon(): Promise<void> {
  await withDaemonConnection(async (socket) => {
    await sendAndExpectOk(socket, helloMessage(), { allowProtocolMismatch: true });
    await sendAndExpectOk(socket, { op: "stop" });
  });
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await probeDaemon()) === "missing") return;
    await sleep(CONNECT_RETRY_MS);
  }
  throw new Error("Incompatible mcpxd did not stop before the timeout.");
}

async function connectSocket(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(daemonSocketPath());
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function sendAndExpectOk(
  socket: net.Socket,
  message: ClientMessage,
  options: { allowProtocolMismatch?: boolean } = {},
): Promise<unknown> {
  const response = await requestJsonLine(socket, message);
  if (isDaemonMessage(response) && response.ok) return response.result ?? response;
  if (isDaemonMessage(response) && !response.ok) {
    if (options.allowProtocolMismatch && response.error.code === "protocol-mismatch") {
      return response;
    }
    throw new Error(response.error.message);
  }
  throw new Error("Invalid mcpxd response.");
}

async function withDaemonConnection<T>(run: (socket: net.Socket) => Promise<T>): Promise<T> {
  const socket = await connectSocket();
  try {
    return await run(socket);
  } finally {
    socket.end();
  }
}

function isDaemonMessage(value: unknown): value is DaemonMessage {
  return !!value && typeof value === "object" && "ok" in value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
