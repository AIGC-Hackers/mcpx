import http from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createRuntime } from "../src/runtime.js";

const mcpServer = new McpServer({
  name: "integration-demo",
  version: "1.0.0",
});

mcpServer.registerTool(
  "add",
  {
    title: "Addition Tool",
    description: "Add two numbers",
    inputSchema: { a: z.number(), b: z.number() },
    outputSchema: { result: z.number() },
  },
  async ({ a, b }) => {
    const result = { result: a + b };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
);

mcpServer.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting",
    description: "Dynamic greeting resource",
  },
  async (uri, { name }) => {
    const normalizedName =
      typeof name === "string" ? name : Array.isArray(name) ? name.join(", ") : "friend";

    return {
      contents: [
        {
          uri: uri.href,
          text: `Hello, ${normalizedName}!`,
        },
      ],
    };
  },
);

let httpServer: http.Server;
let baseUrl: URL;

describe("runtime integration", () => {
  beforeAll(async () => {
    httpServer = http.createServer(async (req, res) => {
      if (req.url !== "/mcp") {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      if (req.method === "GET") {
        res.writeHead(405);
        res.end("Method Not Allowed");
        return;
      }

      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        res.on("close", () => {
          transport.close().catch(() => {});
        });

        try {
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, body);
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(error) }));
        }
        return;
      }

      res.writeHead(405);
      res.end("Method Not Allowed");
    });

    httpServer.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      httpServer.once("listening", resolve);
      httpServer.once("error", reject);
    });

    const address = httpServer.address() as AddressInfo;
    baseUrl = new URL(`http://127.0.0.1:${address.port}/mcp`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("lists tools and calls a tool over HTTP", async () => {
    const runtime = await createRuntime({
      servers: [
        {
          name: "integration",
          description: "Integration test server",
          command: { kind: "http", url: baseUrl },
        },
      ],
    });

    const tools = await runtime.listTools("integration");
    expect(tools.some((tool) => tool.name === "add")).toBe(true);

    const result = (await runtime.callTool("integration", "add", {
      args: { a: 3, b: 4 },
    })) as { structuredContent?: { result: number } };
    expect(result.structuredContent?.result).toBe(7);

    await runtime.close("integration");
  });
});
