---
summary: 'How to migrate from pnpm mcp:* wrappers to the mcpx package.'
---

# Migration Guide

This guide walks through replacing the Python-based `pnpm mcp:*` helpers with the new TypeScript runtime and CLI.

## 1. Install

```bash
pnpm add mcpx
# or
yarn add mcpx
# or
bun add mcpx
```

## 2. Update Scripts

- Replace `pnpm mcpx:list` with `mcpx list`.
- Replace `pnpm mcpx:call <server>.<tool> key=value` with `mcpx call '{ tool: "<server>.<tool>", args: { key: "value" } }'`.
- Add `--config <path>` if you want to override the default `./mcp.json` + `~/.mcpx/mcp.json` merge.
- Optional: run the built-in migration helper if you still rely on Cursor/Claude/Codex/Windsurf/VS Code configs—first launch copies them into `~/.mcpx/mcp.json` automatically.
- Append `--tail-log` to stream the last 20 lines of any log file returned by the tool.

## 3. OAuth Tokens

- Tokens are saved under `~/.mcpx/<server>/` by default.
- To force a fresh login, delete that directory and rerun the command; the CLI will relaunch the browser.
- Custom `token_cache_dir` entries in `mcpx.json` continue to work as explicit overrides.

## 4. Programmatic Usage

```ts
import { createRuntime } from "mcpx";

const runtime = await createRuntime({ configPath: "./mcp.json" });
const tools = await runtime.listTools("chrome-devtools");
await runtime.callTool("chrome-devtools", "take_screenshot", { args: { url: "https://x.com" } });
await runtime.close();
```

Prefer `createRuntime` for long-lived agents so connections and OAuth tokens can be reused.

## 5. Single Call Helper

```ts
import { callOnce } from "mcpx";

await callOnce({
  server: "firecrawl",
  toolName: "crawl",
  args: { url: "https://anthropic.com" },
});
```

Use `callOnce` for fire-and-forget invocations.

## 6. Environment Variables

- `LINEAR_API_KEY`, `FIRECRAWL_API_KEY`, and similar tokens are read exactly as before via `${VAR}` syntax.
- `${VAR:-default}` continues to work; empty values are ignored.
- `$env:VAR` placeholders resolve to raw OS environment variables.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Browser did not open | Copy the printed OAuth URL manually into a browser. |
| Authorization hangs | Ensure the callback URL can bind to `127.0.0.1`; firewalls may block it. |
| Tokens are stale | Delete `~/.mcpx/<server>/tokens.json` and retry. |
| Stdio command fails | Pass `--root` to point at the repo root so relative paths resolve. |

---

For deeper architectural notes and future work, see [`docs/spec.md`](./spec.md).
