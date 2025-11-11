[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/aigc-hackers-mcpx-badge.png)](https://mseep.ai/app/aigc-hackers-mcpx)

# MCPX 🧳
_Token-efficient MCP client built for LLMs and humans._

**Why MCPX?** Other MCP clients dump giant JSON schemas that waste tokens and confuse humans. MCPX returns **TypeScript signatures** instead—Claude and developers instantly understand tool signatures. Call tools with **LLM-native syntax** (`server.func({ args })`), run **batch operations** via stdin, and get **TOON output** (90% fewer tokens than JSON).

MCPX helps you lean into the "code execution" workflows highlighted in Anthropic's **Code Execution with MCP** guidance: discover the MCP servers already configured on your system, call them directly, and compose richer automations in TypeScript. All of that works out of the box -- no boilerplate, no schema spelunking.

## MCPX vs Other MCP Clients

| Feature | MCPX | Typical MCP Client |
|---------|------|-------------------|
| **Schema output** | TypeScript (readable, token-efficient) | JSON Schema (verbose, token-heavy) |
| **Call syntax** | `linear.createIssue({ title: "Bug" })` | Manual JSON construction |
| **Batch calls** | ✅ Multi-line, stdin, comments | ❌ One call at a time |
| **Output format** | TOON (90% fewer tokens) | Raw JSON |
| **OAuth flow** | ✅ Auto-triggered, bug-free | Manual or buggy |
| **LLM-ready** | ✅ Designed for Claude/GPT workflows | ⚠️ Requires token budget |

## Key Capabilities

- **Zero-config discovery.** `createRuntime()` loads `config/mcpx.json`, merges Cursor/Claude/Codex/Windsurf/VS Code imports, expands `${ENV}` placeholders, and pools connections so you can reuse transports across multiple calls.
- **Flexible data formats.** Call tools with function syntax or structured JSON/JSON5/YAML/TOML data. Output defaults to TOON (LLM-friendly), with `--output` flags for raw/JSON/text formats.
- **Friendly composable API.** `createServerProxy()` exposes tools as ergonomic camelCase methods, automatically applies JSON-schema defaults, validates required arguments, and hands back a `CallResult` with `.text()`, `.json()`, and `.content()` helpers.
- **OAuth and stdio ergonomics.** Built-in OAuth caching, log tailing, and stdio wrappers let you work with HTTP, SSE, and stdio transports from the same interface.
- **Ad-hoc connections.** Point the CLI at *any* MCP endpoint (HTTP or stdio) without touching config, then persist it later if you want. Hosted MCPs that expect a browser login (Supabase, Vercel, etc.) are auto-detected and OAuth is triggered automatically when needed. See [docs/adhoc.md](docs/adhoc.md).

## Quick Start

MCPX auto-discovers the MCP servers you already configured in Cursor, Claude Code/Desktop, Codex, or local overrides. Install via Homebrew or run instantly with `bunx mcpx`. Need a full command reference (flags, modes, return types)? Check out [docs/cli-reference.md](docs/cli-reference.md).

### Call MCP tools

```bash
# Function syntax - natural for agents and interactive use
mcpx call 'linear.create_comment({ issueId: "ENG-123", body: "Great!" })'

# Data format - explicit and structured (JSON5/YAML/TOML also supported)
mcpx call '{ tool: "linear.create_comment", args: { issueId: "ENG-123", body: "Great!" } }'
```


### List your MCP servers

```bash
mcpx list
mcpx list context7
mcpx list https://mcp.linear.app/mcp --all-parameters
mcpx list shadcn.io/api/mcp.getComponents           # URL + tool suffix auto-resolves
mcpx list --stdio "bun run ./local-server.ts" --env TOKEN=xyz
```

- Add `--output json` to emit a machine-readable summary with per-server statuses (auth/offline/http/error counts) and, for single-server runs, the full tool schema payload.

You can now point `mcpx list` at ad-hoc servers: provide a URL directly or use the new `--http-url/--stdio` flags (plus `--env`, `--cwd`, `--name`, or `--persist`) to describe any MCP endpoint. Until you persist that definition, you still need to repeat the same URL/stdio flags for `mcpx call`—the printed slug only becomes reusable once you merge it into a config via `--persist` or `mcpx config add`. OAuth is triggered automatically when servers require authentication. Full details live in [docs/adhoc.md](docs/adhoc.md).

Single-server listings now show TypeScript Spec format so you can copy/paste the signature straight into `mcpx call`:

```ts
linear - Hosted Linear MCP
  23 tools · 1654ms · HTTP https://mcp.linear.app/mcp

/**
 * Create a comment on a specific Linear issue
 */
type CreateCommentSpec = {
  tool: 'create_comment'
  args: {
    issueId: string
    body: string
    parentId?: string
    notifySubscribers?: boolean
    labelIds?: string[]
    mentionIds?: string[]
  }
}

/**
 * List documents in the user's Linear workspace
 */
type ListDocumentsSpec = {
  tool: 'list_documents'
  args: {
    query?: string
    limit?: number
    before?: string
    after?: string
    orderBy?: 'createdAt' | 'updatedAt'
    projectId?: string
    initiativeId?: string
    creatorId?: string
    includeArchived?: boolean
  }
}
```

Here's what that looks like for Vercel when you run `mcpx list vercel`:

```ts
vercel - Vercel MCP (requires OAuth)

/**
 * Search the Vercel documentation.
 * Use this tool to answer any questions about Vercel's platform, features, and best practices.
 */
type SearchVercelDocumentationSpec = {
  tool: 'search_vercel_documentation'
  args: {
    topic: string
    tokens?: number
  }
}

/**
 * Deploy the current project to Vercel
 */
type DeployToVercelSpec = {
  tool: 'deploy_to_vercel'
  args: Record<string, unknown>
}
```

### Context7: fetch docs (no auth required)

```bash
mcpx call 'context7.resolve-library-id({ libraryName: "react" })'
mcpx call 'context7.get-library-docs({ path: "/websites/react_dev", topic: "hooks" })'
```

### Linear: search documentation (requires `LINEAR_API_KEY`)

```bash
LINEAR_API_KEY=sk_linear_example mcpx call 'linear.search_documentation({ query: "automations" })'
```

### Chrome DevTools: snapshot the current tab

```bash
mcpx call 'chrome-devtools.take_snapshot()'
mcpx call 'linear.create_comment({ issueId: "LNR-123", body: "Hello world" })'
```

> **Call Syntax:** Function syntax `server.tool({ args })` or data format `{ tool: "server.tool", args: {...} }`. Both are parsed (not executed as JS). Supports JSON5/YAML/TOML.

Helpful flags:

- `--config <path>` -- custom config file (defaults to `./config/mcpx.json`).
- `--root <path>` -- working directory for stdio commands.
- `--log-level <debug|info|warn|error>` -- adjust verbosity (respects `MCPX_LOG_LEVEL`).
- `--oauth-timeout <ms>` -- shorten/extend the OAuth browser wait; same as `MCPX_OAUTH_TIMEOUT_MS` / `MCPX_OAUTH_TIMEOUT`.
- `--tail-log` -- stream the last 20 lines of any log files referenced by the tool response.
- `--output <format>` -- control output format: `toon` (default, LLM-friendly), `json`, `text`, or `raw`.
- `--http-url <https://…>` / `--stdio "command …"` -- describe an ad-hoc MCP server inline (pair with `--env KEY=value`, `--cwd`, `--name`, and `--persist <config.json>` as needed).
- OAuth-protected servers trigger authentication automatically on first use.

> Tip: You can skip the verb entirely—`mcpx firecrawl` automatically runs `mcpx list firecrawl`, and dotted tokens like `mcpx linear.list_issues` dispatch to the call command (typo fixes included).

Timeouts default to 30 s; override with `MCPX_LIST_TIMEOUT` or `MCPX_CALL_TIMEOUT` when you expect slow startups. OAuth browser handshakes get a separate 60 s grace period; pass `--oauth-timeout <ms>` (or export `MCPX_OAUTH_TIMEOUT_MS`) when you need the CLI to bail out faster while you diagnose stubborn auth flows.

### Try an MCP without editing config

```bash
# Point at an HTTPS MCP server directly
mcpx list --http-url https://mcp.linear.app/mcp --name linear

# Run a local stdio MCP server via Bun
mcpx call --stdio "bun run ./local-server.ts" --name local-tools
```

- Add `--persist config/mcpx.local.json` to save the inferred definition for future runs.
- Use `--allow-http` if you truly need to hit a cleartext endpoint.
- See [docs/adhoc.md](docs/adhoc.md) for a deep dive (env overrides, cwd, OAuth).


## Call Syntax

Two formats, both parsed (not executed as JavaScript):

**Function syntax** (natural for agents):
```bash
mcpx call 'linear.create_issue({ title: "Bug", priority: 2, labels: ["urgent"] })'
```

**Data format** (explicit, supports JSON5/YAML/TOML):
```bash
mcpx call '{ tool: "linear.create_issue", args: { title: "Bug", priority: 2 } }'
```

**Features:**
- **Auto-correct.** Typo `listIssue`? MCPX suggests `list_issues` automatically.
- **Type specs.** `mcpx list <server>` prints TypeScript specs—copy/paste directly into calls.

## Batch Calling

Execute multiple MCP tool calls in one shot from stdin or a file. Perfect for LLM-driven workflows, automation scripts, and data migrations.

```bash
# From file
cat batch-calls.txt | mcpx call

# From heredoc (function syntax)
mcpx call << 'EOF'
linear.list_issues({ limit: 5 })
github.search_repos({ query: "mcp" })
EOF

# Data format also works
mcpx call << 'EOF'
[
  { tool: "linear.list_issues", args: { limit: 5 } },
  { tool: "github.search_repos", args: { query: "mcp" } }
]
EOF
```

**Input format** supports function syntax and structured data:

```javascript
// Function syntax (one per line, natural for agents)
linear.create_issue({ title: "Fix bug", priority: 2, labels: ["bug", "urgent"] })
github.search_repos({ query: "mcp" })

// Data format (explicit structure)
[
  { tool: "linear.create_issue", args: { title: "Fix bug", priority: 2, labels: ["bug", "urgent"] } },
  { tool: "github.search_repos", args: { query: "mcp" } }
]
```

**Output** is in **TOON format** (compact, LLM-friendly):

```toon
[2]:
  - tool: linear.create_issue
    output:
      id: ISS-123
      title: Fix bug
  - tool: github.search_repos
    output:
      items[1]{name,stars}: repo1,42
```

Override with `--output json` for standard JSON:

```json5
[
  { tool: 'linear.create_issue', output: { id: 'ISS-123', title: 'Fix bug' } },
  { tool: 'github.search_repos', output: { items: [...] } },
]
```

**Error handling**: If any call fails, the error is captured in the output and the exit code is `1`:

```json5
{
  tool: 'linear.bad_tool',
  output: "Parameter validation failed:\n- Field 'id': Required (expected string, got undefined)",
}
```

Use cases:
- **LLM tool calling**: Generate batch files and pipe to mcpx
- **Automation scripts**: Daily standups, status reports
- **Data migration**: Export from one system, import to another

See [examples/README.md](examples/README.md) and [examples/batch-calls.txt](examples/batch-calls.txt) for complete examples.

## Installation

### Homebrew

```bash
brew tap AIGC-Hackers/mcpx
brew install mcpx
```

### Run without installing

```bash
bunx mcpx list
```

### Homebrew (steipete/tap)

```bash
brew tap steipete/tap
brew install steipete/tap/mcpx
```

> The tap publishes alongside MCPX 0.3.2. If you run into issues with an older tap install, run `brew update` before reinstalling.

## One-shot calls from code

```ts
import { callOnce } from "mcpx";

const result = await callOnce({
	server: "firecrawl",
	toolName: "crawl",
	args: { url: "https://anthropic.com" },
});

console.log(result); // raw MCP envelope
```

`callOnce` automatically discovers the selected server (including Cursor/Claude/Codex/Windsurf/VS Code imports), handles OAuth prompts, and closes transports when it finishes. It is ideal for manual runs or wiring MCPX directly into an agent tool hook.

## Compose Automations with the Runtime

```ts
import { createRuntime } from "mcpx";

const runtime = await createRuntime();

const tools = await runtime.listTools("context7");
const result = await runtime.callTool("context7", "resolve-library-id", {
	args: { libraryName: "react" },
});

console.log(result); // prints JSON/text automatically because the CLI pretty-prints by default
await runtime.close(); // shuts down transports and OAuth sessions
```

Reach for `createRuntime()` when you need connection pooling, repeated calls, or advanced options such as explicit timeouts and log streaming. The runtime reuses transports, refreshes OAuth tokens, and only tears everything down when you call `runtime.close()`.

## Compose Tools in Code

The runtime API is built for agents and scripts, not just humans at a terminal.

```ts
import { createRuntime, createServerProxy } from "mcpx";

const runtime = await createRuntime();
const chrome = createServerProxy(runtime, "chrome-devtools");
const linear = createServerProxy(runtime, "linear");

const snapshot = await chrome.takeSnapshot();
console.log(snapshot.text());

const docs = await linear.searchDocumentation({
	query: "automations",
	page: 0,
});
console.log(docs.json());
```

Friendly ergonomics baked into the proxy and result helpers:

- Property names map from camelCase to kebab-case tool names (`takeSnapshot` -> `take_snapshot`).
- Positional arguments map onto schema-required fields automatically, and option objects respect JSON-schema defaults.
- Results are wrapped in a `CallResult`, so you can choose `.text()`, `.json()`, `.content()`, or access `.raw` when you need the full envelope.

Drop down to `runtime.callTool()` whenever you need explicit control over arguments, metadata, or streaming options.


Call `mcpx list <server>` any time you need the TypeScript-style signature, optional parameter hints, and sample invocations that match the CLI's function-call syntax.

## Configuration Reference

`config/mcpx.json` mirrors Cursor/Claude's shape:

```json5
{
	mcpServers: {
		context7: {
			description: 'Context7 docs MCP',
			baseUrl: 'https://mcp.context7.com/mcp',
			headers: {
				Authorization: '$env:CONTEXT7_API_KEY',
			},
		},
		'chrome-devtools': {
			command: 'bunx',
			args: ['chrome-devtools-mcp@latest'],
		},
	},
	imports: ['cursor', 'claude-code', 'claude-desktop', 'codex', 'windsurf', 'vscode'],
}
```

What MCPX handles for you:

- `${VAR}`, `${VAR:-fallback}`, and `$env:VAR` interpolation for headers and env entries.
- Automatic OAuth token caching under `~/.mcpx/<server>/` unless you override `tokenCacheDir`.
- Stdio commands inherit the directory of the file that defined them (imports or local config).
- Import precedence matches the array order; omit `imports` to use the default `["cursor", "claude-code", "claude-desktop", "codex", "windsurf", "vscode"]`.

Provide `configPath` or `rootDir` to CLI/runtime calls when you juggle multiple config files side by side.

## Testing and CI

| Command | Purpose |
| --- | --- |
| `bun run check` | Oxfmt formatting plus Oxlint/tsgolint gate. |
| `bun run build` | Compile to standalone binary (emits `dist/mcpx`). |
| `bun run test` | Vitest unit and integration suites (streamable HTTP fixtures included). |

CI runs the same trio via GitHub Actions.

## Debug Hanging Servers Quickly

Use `tmux` to keep long-running CLI sessions visible while you investigate lingering MCP transports:

```bash
tmux new-session -- bun run mcpx:list
```

Let it run in the background, then inspect the pane (`tmux capture-pane -pt <session>`), tail stdio logs, or kill the session once the command exits. Pair this with `MCPX_DEBUG_HANG=1` when you need verbose handle diagnostics. More detail: [docs/tmux.md](docs/tmux.md) and [docs/hang-debug.md](docs/hang-debug.md).

## Credits

MCPX was inspired by [mcporter](https://github.com/steipete/mcporter) but rebuilt from scratch with token-efficiency and LLM workflows as first-class design goals.

## License

MIT -- see [LICENSE](LICENSE).

Further reading: [docs/tool-calling.md](docs/tool-calling.md), [docs/adhoc.md](docs/adhoc.md), [docs/tmux.md](docs/tmux.md).
