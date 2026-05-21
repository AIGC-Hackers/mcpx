import type { Socket } from "node:net";

export function writeJsonLine(socket: Socket, value: unknown): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

export function readJsonLines(
  socket: Socket,
  onMessage: (message: unknown) => void,
  onInvalid: (error: Error) => void,
): void {
  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;

      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.length === 0) continue;

      try {
        onMessage(JSON.parse(line));
      } catch (error) {
        onInvalid(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
}
