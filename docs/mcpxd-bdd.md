# mcpxd BDD Spec

## Purpose

`mcpxd` is a user-local daemon for reusing stdio MCP server sessions across
separate `mcpx` CLI invocations. It is not a general process manager. Its only
owned problem is making registered `transport: "stdio"` servers fast and stable
enough for repeated agent tool calls.

HTTP MCP servers stay on the existing direct client path.

## Reference Case

Use `@modelcontextprotocol/server-filesystem` as the primary integration case.
The upstream server is a practical stdio MCP server because it:

- starts from a command plus directory arguments;
- uses stdout for MCP JSON-RPC and stderr for diagnostics;
- exposes read-only and write-capable tools;
- keeps session state through allowed directories and optional MCP Roots.

The baseline command shape is:

```bash
mcpx @add --name filesystem \
  --transport stdio \
  --command bunx \
  --arg -y \
  --arg @modelcontextprotocol/server-filesystem \
  --arg /tmp/mcpxd-filesystem
```

Tests may use a local fixture server for precise timing, crash, and concurrency
control. Filesystem remains the acceptance case for real stdio MCP behavior.

## Non-Goals For V1

- No PM2, launchd, or systemd dependency.
- No machine-wide or cross-user service.
- No HTTP server routing through the daemon.
- No automatic restart loop after a server crash.
- No parallel calls over the same stdio MCP session.
- No Roots client implementation unless separately specified.

## Daemon Contract

The CLI talks to `mcpxd` over a user-owned local IPC endpoint under
`~/.agents/mcpx/`. The endpoint handshake, not a pid file, is the source of
truth for daemon liveness.

Each managed stdio server has a stable server key derived from:

- server registry name;
- command;
- args;
- env;
- cwd when supported.

The daemon owns:

- one MCP client session per active stdio server key;
- a serial promise queue per server key;
- `lastUsedAt` for idle cleanup;
- graceful close and forced kill fallback;
- daemon protocol version handshake.

## Feature: CLI Starts Daemon On Demand

Scenario: cold daemon start

- Given no `mcpxd` socket is accepting connections
- And the registry contains a stdio `filesystem` server
- When the user runs `mcpx filesystem list_allowed_directories --input '{}'`
- Then `mcpx` starts `mcpxd` detached
- And `mcpxd` starts the filesystem stdio process
- And the tool call succeeds
- And the response includes the configured allowed directory

Scenario: stale pid file without live socket

- Given a daemon pid file exists
- And the daemon socket is missing or rejects handshake
- When the user calls a stdio tool
- Then the CLI ignores the stale pid file
- And starts a new daemon
- And completes the call

## Feature: Stdio Server Session Reuse

Scenario: warm server reuse within TTL

- Given `mcpxd` is running
- And the `filesystem` server has already handled one call
- When the user calls `filesystem list_allowed_directories` again before TTL expires
- Then the daemon reuses the same filesystem child process
- And the call succeeds

Scenario: server key change starts a new child

- Given an active `filesystem` child was started with directory A
- When the registry changes the same server name to use directory B
- Then the next call uses a different server key
- And the daemon starts a new child process
- And the old child is eligible for idle cleanup

## Feature: Idle TTL Cleanup

Scenario: idle child exits after TTL

- Given a stdio server child has no active calls
- And its `lastUsedAt` is older than the configured TTL
- When the cleanup loop runs
- Then the daemon closes the MCP client
- And the child process exits
- And the server key is removed from the active pool

Scenario: active call is never killed by TTL

- Given a slow tool call is active
- And the server's previous `lastUsedAt` is older than TTL
- When the cleanup loop runs
- Then the daemon does not close or kill that child
- And cleanup waits until the call finishes and becomes idle

## Feature: Serial Calls Per Server

Scenario: two calls to the same server are serialized

- Given a stdio fixture server has a slow tool
- When two CLI calls target the same server at the same time
- Then the daemon sends the second MCP call only after the first completes
- And both calls receive the correct response
- And no JSON-RPC messages are interleaved on the same stdio session

Scenario: calls to different servers do not block each other

- Given two different stdio server keys are active
- When one server is handling a slow call
- Then a call to the other server can complete independently

## Feature: Failure Handling

Scenario: missing command fails clearly

- Given a stdio server command does not exist
- When the user calls one of its tools
- Then the call fails with a launch error
- And the daemon does not keep a broken active server entry

Scenario: child exits during a call

- Given a stdio server child exits before returning a tool result
- When the user calls a tool
- Then the current call fails
- And the daemon removes that child from the active pool
- And the next call may cold-start a new child

Scenario: stderr diagnostics do not corrupt MCP output

- Given a stdio server writes logs to stderr during startup and tool calls
- When the user calls a tool
- Then the MCP stdout protocol remains valid
- And stderr diagnostics are captured in daemon logs
- And normal `mcpx` output contains only the tool result unless debug output is requested

## Feature: Daemon Control Plane

Scenario: daemon status

- Given `mcpxd` is running
- When the user runs `mcpx @daemon status`
- Then output includes daemon pid, protocol version, active server count, and server idle ages

Scenario: daemon stop

- Given `mcpxd` is running with active stdio children
- When the user runs `mcpx @daemon stop`
- Then the daemon closes all MCP clients
- And removes its socket
- And exits cleanly

Scenario: protocol mismatch

- Given an existing daemon responds with an unsupported protocol version
- When the CLI connects
- Then the CLI refuses to send tool calls to it
- And reports a clear upgrade/restart message

## Test Strategy

Use three layers:

1. Unit tests for server key hashing, queue behavior, TTL decisions, and IPC
   message validation.
2. Integration tests with a deterministic local stdio fixture for crash, slow
   call, stderr, and TTL timing.
3. Acceptance tests with `@modelcontextprotocol/server-filesystem` for real
   stdio MCP startup, schema discovery, tool calls, and read/write behavior in a
   sandbox directory.

Filesystem acceptance should cover:

- `list_allowed_directories` returns the sandbox root;
- `write_file` creates a file inside the sandbox;
- `read_text_file` reads the same file across a later CLI invocation;
- a second call within TTL reuses the same child process;
- after TTL, a later call starts a new child process and still reads the file.

## Open Decisions

- Default TTL: proposed `5m`.
- IPC encoding: JSON lines are easier to inspect; length-prefixed JSON is safer
  for future binary-safe messages.
- Logs: store daemon and child stderr logs under `~/.agents/mcpx/logs/`.
- Env persistence: registry may support explicit `env`, but secret-by-reference
  is safer for long-lived daemon use and should be preferred in docs.
