import fs from "node:fs/promises";
import net, { type Socket } from "node:net";

import { ensureDaemonDir, daemonLogPath, daemonSocketPath, serverLogPath } from "./daemon-paths";
import { readJsonLines, requestJsonLine, writeJsonLine } from "./daemon-io";
import {
  DAEMON_PROTOCOL_VERSION,
  type ClientMessage,
  type DaemonMessage,
  type DaemonStatus,
} from "./daemon-protocol";
import { connectMcpClient, listAllMcpTools } from "./mcp-client";
import type { McpTool, StdioServerConfig } from "./types";
import { MCPX_VERSION } from "./version";

const CHILD_IDLE_TTL_MS = 15 * 60 * 1000;
const DAEMON_IDLE_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 1000;
const LOG_MAX_BYTES = 10 * 1024 * 1024;

type ConnectedSession = Awaited<ReturnType<typeof connectMcpClient>>;

type ManagedSession = {
  serverKey: string;
  labels: Set<string>;
  server: StdioServerConfig;
  connection?: ConnectedSession;
  connecting?: Promise<ConnectedSession>;
  queue: Promise<unknown>;
  activeCalls: number;
  queuedCalls: number;
  lastUsedAt: number;
};

const sessions = new Map<string, ManagedSession>();
let stopping = false;
let lastDaemonActivity = Date.now();

export async function runDaemonServer(): Promise<void> {
  await ensureDaemonDir();
  const socketPath = daemonSocketPath();
  if (await isLiveSocket(socketPath)) return;
  await fs.rm(socketPath, { force: true }).catch(() => {});

  const server = net.createServer(handleConnection);
  try {
    await listen(server, socketPath);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "EADDRINUSE" &&
      (await isLiveSocket(socketPath))
    ) {
      return;
    }
    throw error;
  }
  await logDaemon(`mcpxd started pid=${process.pid}`);

  const cleanupTimer = setInterval(() => {
    void cleanupIdleSessions(server);
  }, CLEANUP_INTERVAL_MS);

  await new Promise<void>((resolve) => {
    server.on("close", resolve);
  });
  clearInterval(cleanupTimer);
}

function handleConnection(socket: Socket): void {
  readJsonLines(
    socket,
    (message) => {
      void handleMessage(socket, message);
    },
    (error) => {
      writeJsonLine(socket, errorResponse("invalid-json", error.message));
    },
  );
}

async function handleMessage(socket: Socket, message: unknown): Promise<void> {
  lastDaemonActivity = Date.now();
  if (!isClientMessage(message)) {
    writeJsonLine(socket, errorResponse("invalid-message", "Invalid mcpxd message."));
    return;
  }

  try {
    if (message.op === "hello" && message.protocolVersion !== DAEMON_PROTOCOL_VERSION) {
      writeJsonLine(
        socket,
        errorResponse(
          "protocol-mismatch",
          `Unsupported mcpxd protocol ${message.protocolVersion}; expected ${DAEMON_PROTOCOL_VERSION}.`,
        ),
      );
      return;
    }
    if (stopping && message.op !== "hello" && message.op !== "stop") {
      writeJsonLine(socket, errorResponse("daemon-stopping", "mcpxd is stopping."));
      return;
    }

    switch (message.op) {
      case "hello":
        writeJsonLine(socket, {
          ok: true,
          protocolVersion: DAEMON_PROTOCOL_VERSION,
          result: {
            protocolVersion: DAEMON_PROTOCOL_VERSION,
            version: MCPX_VERSION,
          },
        } satisfies DaemonMessage);
        return;
      case "listTools":
        writeJsonLine(socket, okResponse(await listTools(message)));
        return;
      case "call":
        writeJsonLine(socket, okResponse(await callTool(message)));
        return;
      case "status":
        writeJsonLine(socket, okResponse(status()));
        return;
      case "stop":
        writeJsonLine(socket, okResponse({ stopping: true }));
        await stopDaemon();
        return;
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    writeJsonLine(socket, errorResponse("operation-failed", messageText));
  }
}

async function listTools(message: Extract<ClientMessage, { op: "listTools" }>): Promise<McpTool[]> {
  return enqueue(message.serverKey, message.serverName, message.server, async (session) =>
    listAllMcpTools((await ensureConnected(session)).client),
  );
}

async function callTool(message: Extract<ClientMessage, { op: "call" }>): Promise<unknown> {
  return enqueue(message.serverKey, message.serverName, message.server, async (session) =>
    (await ensureConnected(session)).client.callTool({
      name: message.toolName,
      arguments: message.input,
    }),
  );
}

async function enqueue<T>(
  serverKey: string,
  serverName: string,
  serverConfig: StdioServerConfig,
  run: (session: ManagedSession) => Promise<T>,
): Promise<T> {
  const session = getSession(serverKey, serverName, serverConfig);
  session.queuedCalls += 1;

  const task = session.queue.then(async () => {
    session.queuedCalls -= 1;
    session.activeCalls += 1;
    try {
      return await run(session);
    } finally {
      session.activeCalls -= 1;
      session.lastUsedAt = Date.now();
      lastDaemonActivity = Date.now();
    }
  });

  session.queue = task.catch(() => {});
  return task;
}

function getSession(
  serverKey: string,
  serverName: string,
  serverConfig: StdioServerConfig,
): ManagedSession {
  const existing = sessions.get(serverKey);
  if (existing) {
    existing.labels.add(serverName);
    return existing;
  }

  const session: ManagedSession = {
    serverKey,
    labels: new Set([serverName]),
    server: serverConfig,
    queue: Promise.resolve(),
    activeCalls: 0,
    queuedCalls: 0,
    lastUsedAt: Date.now(),
  };
  sessions.set(serverKey, session);
  return session;
}

async function ensureConnected(session: ManagedSession): Promise<ConnectedSession> {
  if (session.connection) return session.connection;
  if (!session.connecting) {
    session.connecting = connectMcpClient(session.server).then((connection) => {
      session.connection = connection;
      delete session.connecting;
      attachStderrLog(session, connection);
      void logDaemon(`started server=${session.serverKey} pid=${connection.pid() ?? "unknown"}`);
      return connection;
    });
  }
  return session.connecting;
}

function attachStderrLog(session: ManagedSession, connection: ConnectedSession): void {
  const stderr = connection.stderr;
  if (!stderr) return;

  stderr.on("data", (chunk) => {
    void appendLog(serverLogPath(session.serverKey), chunk.toString());
  });
}

async function cleanupIdleSessions(server: net.Server): Promise<void> {
  if (stopping) return;

  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.activeCalls > 0 || session.queuedCalls > 0) continue;
    if (now - session.lastUsedAt < CHILD_IDLE_TTL_MS) continue;
    await closeSession(session);
    sessions.delete(session.serverKey);
  }

  if (sessions.size === 0 && now - lastDaemonActivity >= DAEMON_IDLE_TTL_MS) {
    await logDaemon("mcpxd idle timeout reached");
    server.close();
  }
}

async function stopDaemon(): Promise<void> {
  stopping = true;
  await Promise.all([...sessions.values()].map((session) => session.queue.catch(() => {})));
  await Promise.all([...sessions.values()].map(closeSession));
  sessions.clear();
  await fs.rm(daemonSocketPath(), { force: true }).catch(() => {});
  process.exitCode = 0;
  setTimeout(() => process.exit(0), 10).unref();
}

async function closeSession(session: ManagedSession): Promise<void> {
  await session.connection?.close().catch(() => {});
  delete session.connection;
  delete session.connecting;
  await logDaemon(`stopped server=${session.serverKey}`);
}

function status(): DaemonStatus {
  const now = Date.now();
  return {
    pid: process.pid,
    protocolVersion: DAEMON_PROTOCOL_VERSION,
    version: MCPX_VERSION,
    activeServers: sessions.size,
    servers: [...sessions.values()].map((session) => ({
      serverKey: session.serverKey,
      labels: [...session.labels].sort(),
      pid: session.connection?.pid() ?? null,
      activeCalls: session.activeCalls,
      queuedCalls: session.queuedCalls,
      idleMs: now - session.lastUsedAt,
    })),
  };
}

function okResponse(result: unknown): DaemonMessage {
  return { ok: true, result };
}

function errorResponse(code: string, message: string): DaemonMessage {
  return { ok: false, error: { code, message } };
}

async function listen(server: net.Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      fs.chmod(socketPath, 0o600).then(resolve, reject);
    });
  });
}

async function logDaemon(message: string): Promise<void> {
  await appendLog(daemonLogPath(), `${new Date().toISOString()} ${message}\n`);
}

async function appendLog(filePath: string, text: string): Promise<void> {
  await rotateLogIfNeeded(filePath, Buffer.byteLength(text)).catch(() => {});
  await fs.appendFile(filePath, text, "utf8").catch(() => {});
}

async function rotateLogIfNeeded(filePath: string, incomingBytes: number): Promise<void> {
  const stat = await fs.stat(filePath).catch(() => undefined);
  if (!stat || stat.size + incomingBytes <= LOG_MAX_BYTES) return;

  await fs.rm(`${filePath}.2`, { force: true }).catch(() => {});
  await fs.rename(`${filePath}.1`, `${filePath}.2`).catch(() => {});
  await fs.rename(filePath, `${filePath}.1`).catch(() => {});
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const op = (value as { op?: unknown }).op;
  return op === "hello" || op === "listTools" || op === "call" || op === "status" || op === "stop";
}

async function isLiveSocket(socketPath: string): Promise<boolean> {
  const socket = await connectSocket(socketPath).catch(() => undefined);
  if (!socket) return false;
  try {
    const parsed = (await requestJsonLine(socket, {
      op: "hello",
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      clientVersion: MCPX_VERSION,
    } satisfies ClientMessage)) as DaemonMessage;
    return parsed.ok === true && parsed.protocolVersion === DAEMON_PROTOCOL_VERSION;
  } catch {
    return false;
  } finally {
    socket.destroy();
  }
}

async function connectSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}
