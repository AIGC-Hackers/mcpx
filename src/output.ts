import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { decode, encode } from "@toon-format/toon";

export type McpxContext = {
  output: "toon" | "raw";
};

type McpContent = Record<string, unknown> & {
  type?: unknown;
  text?: unknown;
  data?: unknown;
  blob?: unknown;
  mimeType?: unknown;
};

export async function printOutput(value: unknown, context: McpxContext): Promise<void> {
  if (isMcpToolResult(value)) {
    for (const line of await formatMcpContent(value.content, context.output)) {
      console.log(line);
    }
    return;
  }

  if (context.output === "raw") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  console.log(encode(value));
}

export async function formatMcpContent(
  content: McpContent[],
  outputFormat: McpxContext["output"] = "toon",
): Promise<string[]> {
  const output: string[] = [];

  for (const item of content) {
    if (item.type === "text" && typeof item.text === "string") {
      output.push(formatTextContent(item.text, outputFormat));
      continue;
    }

    output.push(await saveBinaryContent(item));
  }

  return output;
}

function formatTextContent(text: string, output: McpxContext["output"]): string {
  if (output === "raw") return text;

  const parsedJson = parseJsonText(text);
  if (parsedJson !== undefined) {
    return encode(parsedJson);
  }

  const parsedToon = parseToonText(text);
  if (parsedToon !== undefined) {
    return text;
  }

  return text;
}

function parseJsonText(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parseToonText(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed.includes(":")) return undefined;
  try {
    return decode(trimmed);
  } catch {
    return undefined;
  }
}

async function saveBinaryContent(content: McpContent): Promise<string> {
  const bytes = contentBytes(content);
  const mimeType = typeof content.mimeType === "string" ? content.mimeType : undefined;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const filePath = path.join(tmpdir(), `mcpx-${hash}${extensionForMimeType(mimeType)}`);
  await fs.writeFile(filePath, bytes);
  return `file saved ${filePath}`;
}

function contentBytes(content: McpContent): Buffer {
  if (typeof content.data === "string") {
    return Buffer.from(content.data, "base64");
  }
  if (typeof content.blob === "string") {
    return Buffer.from(content.blob, "base64");
  }
  if (typeof content.text === "string") {
    return Buffer.from(content.text, "utf8");
  }
  return Buffer.from(JSON.stringify(content, null, 2), "utf8");
}

function extensionForMimeType(mimeType: string | undefined): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/svg+xml":
      return ".svg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    case "application/json":
      return ".json";
    case "text/plain":
      return ".txt";
    default:
      return ".bin";
  }
}

function isMcpToolResult(value: unknown): value is { content: McpContent[] } {
  if (!value || typeof value !== "object") return false;
  const content = (value as { content?: unknown }).content;
  return Array.isArray(content);
}
