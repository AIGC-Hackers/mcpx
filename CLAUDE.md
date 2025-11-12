# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCPX is a TypeScript runtime, CLI, and code-generation toolkit for the Model Context Protocol (MCP). It acts as an MCP client that discovers, lists, and calls MCP servers configured in Cursor, Claude Code/Desktop, Codex, Windsurf, and VS Code.

## Workflow Guidelines

**Delegate independent, mechanical tasks to subagents.** Use the Task tool for context-independent work (bulk refactoring, systematic search, file renames). Keep the main session focused on judgment calls and iterative problem-solving.

## Essential Commands

### Development
```bash
bun run dev              # Watch mode: incremental TypeScript rebuild
bun run build            # Compile TypeScript → dist/
bun run check            # Run all linters + typecheck (required before commit)
bun run lint             # Alias for check
bun run typecheck        # TypeScript type checking only
```

### Testing
```bash
bun run test             # Run Vitest suite (use this, NOT `bun test`)
bun run test:watch       # Watch mode
bun run test:ui          # Vitest UI
bun run test:coverage    # Generate coverage report
```

### CLI Usage (for testing features)
```bash
bun run mcpx:list    # List configured MCP servers
bun run mcpx:call    # Call MCP tools
```

### Debugging & CI
```bash
tmux new-session -- bun run mcpx:list  # Test CLI in resilient terminal (easy to spot stalls)
gh run list --limit 1 --watch           # Stream CI status in real time
gh run view --log <run-id>              # Inspect CI failures quickly
```

## Architecture

### Core Modules

**Runtime Layer** (`src/runtime.ts`)
- `createRuntime(options)`: Main entry point for programmatic API; manages connection pooling, OAuth sessions, and transport lifecycle
- `McpRuntime`: Internal class that coordinates MCP client connections across HTTP (SSE/Streamable) and stdio transports
- `callOnce()`: Convenience wrapper for single-shot tool calls without managing runtime lifecycle

**Configuration** (`src/config.ts`, `src/config-schema.ts`, `src/config-normalize.ts`)
- Merges `./mcp.json` with `~/.mcpx/mcp.json`; first run migrates Cursor/Claude/Codex/Windsurf/VS Code configs into the user file
- Supports `${VAR}`, `${VAR:-fallback}`, and `$env:VAR` interpolation
- Stdio commands inherit working directory from their defining config file
- `ServerDefinition` schema represents both HTTP (`baseUrl`, `headers`) and stdio (`command`, `args`, `env`) servers

**CLI Commands** (`src/cli.ts`, `src/cli/`)
- `list`: Enumerate servers and tools (always includes full JSON schemas); `--output json` for machine-readable output
- `call`: Invoke tools via `server.tool` selectors or direct HTTP URLs; supports function-call `tool(arg: "value")` syntax
- `auth`: Standalone OAuth flow for servers requiring browser login
- `emit-ts`: Generate `.d.ts` types or client wrappers for TypeScript projects

**Server Proxy** (`src/server-proxy.ts`)
- `createServerProxy(runtime, serverName)`: Returns ergonomic camelCase wrapper around MCP tools
- Automatically maps `takeSnapshot()` → `take_snapshot`, validates required args, applies JSON-schema defaults
- Returns `CallResult` objects with `.text()`, `.markdown()`, `.json()`, `.content()`, `.raw` accessors

**OAuth Support** (`src/oauth.ts`, `src/runtime-oauth-support.ts`)
- Automatic OAuth token caching under `~/.mcpx/<server>/`
- Browser-based flow with configurable timeout (default 60s, override via `--oauth-timeout` or `MCPX_OAUTH_TIMEOUT_MS`)
- Auto-detects OAuth requirements and promotes HTTP servers to OAuth when needed

### Module Boundaries

- `src/cli/`: CLI-specific command handlers, argument parsing, output formatting; depends on runtime but not vice versa
- `src/`: Core runtime, config loading, transport management, result utilities; usable as library without CLI
- `tests/`: Vitest suites mirroring source structure; includes HTTP fixtures for integration tests

## Key Development Patterns

### Transport Lifecycle
All MCP clients maintain transport state via `ClientContext` (client + transport + definition + optional OAuth session). Runtime pools connections and only closes them when `runtime.close()` is called or individual servers are disconnected.

### Result Wrapping
Tool call results flow through `CallResult` (see `src/result-utils.ts`):
- `wrapCallResult(result)`: Converts MCP `CallToolResult` into friendly accessor object
- Handles text-only, JSON, image, and multi-content responses
- CLI commands use these helpers to format output automatically

### Command Inference
`inferCommandRouting()` in `src/cli/command-inference.ts` enables shortcuts:
- `mcpx linear` → `mcpx list linear`
- `mcpx linear.list_issues` → `mcpx call linear.list_issues`
- Auto-corrects tool name typos via edit distance heuristic

### Ad-hoc Servers (Ephemeral Mode)
`--http-url`, `--stdio`, `--env`, `--cwd`, `--name`, `--persist` flags allow calling MCP servers without editing config. See `src/cli/adhoc-server.ts` and `src/cli/ephemeral-target.ts`.

## Testing Conventions

- Vitest config: `vitest.config.ts` (globals disabled, 10s timeout, Node environment)
- Run tests via `bun run test` (NOT `bun test`)
- Integration tests use `StreamableHTTPServerTransport` fixtures to simulate MCP servers
- Always close runtimes in `afterAll()` hooks to prevent hanging handles

## File Organization

```
src/
  cli.ts                 # Main CLI entry + command router
  runtime.ts             # Core runtime API (createRuntime, callOnce)
  config.ts              # Config loading and server discovery
  server-proxy.ts        # Ergonomic tool proxy wrapper
  oauth.ts               # OAuth session management
  cli/                   # CLI command handlers
    call-command.ts
    list-command.ts
    emit-ts-command.ts
    tool-metadata.ts     # JSON Schema metadata extraction
  result-utils.ts        # CallResult wrappers
tests/                   # Vitest suites
docs/                    # User documentation
```

## Dependencies and Tooling

- **MCP SDK:** `@modelcontextprotocol/sdk` (client transports: stdio, SSE, streamable HTTP)
- **Schema:** Zod for runtime validation, `json-schema-to-typescript` for `.d.ts` generation
- **Linting:** Biome (formatting + style), Oxlint + tsgolint (type-aware rules)
- **Utilities:** `citty` (CLI framework), `ora` (spinners), `confbox` (config parsing), `es-toolkit` (modern lodash alternative)

## Special Behaviors

### Force Exit After Cleanup
CLI commands force `process.exit(0)` after `runtime.close()` to prevent Node from hanging on lingering stdio handles from MCP servers. Disable via `MCPX_NO_FORCE_EXIT=1`.

### OAuth Timeout
Default 60s browser wait; override with `--oauth-timeout <ms>` or `MCPX_OAUTH_TIMEOUT_MS` environment variable.

### Debug Hanging Servers
Set `MCPX_DEBUG_HANG=1` to enable verbose handle diagnostics. Use `tmux` to keep CLI sessions visible while investigating: `tmux new-session -- bun run mcpx:list`.

### Call Timeout
Defaults to 30s; override with `MCPX_CALL_TIMEOUT` or `MCPX_LIST_TIMEOUT` environment variables.

## Pre-commit Checklist

1. Run `bun run check` (Biome + Oxlint + typecheck)
2. Run `bun run test` (full Vitest suite)
3. Follow Conventional Commits: `feat|fix|refactor|build|ci|chore|docs|style|perf|test`
4. Update CHANGELOG.md for user-facing changes (skip doc-only edits)
