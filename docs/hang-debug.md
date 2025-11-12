---
summary: 'Checklist for diagnosing mcpx commands that never exit, using tmux and active-handle dumps.'
read_when:
  - 'Seeing the CLI hang after tool completion'
---

# Debugging Hanging mcpx Calls

When `mcpx call` prints a tool response but the process never exits, it
usually means Node still has active handles it is waiting on. The most common
culprit is a child MCP server process that keeps the stdio transport alive.

## Quick Checklist

1. **Run under tmux** – launch the command inside tmux so you can inspect the
   pane even after Cursor or another agent times out.
2. **Enable hang diagnostics** – set `MCPX_DEBUG_HANG=1` when invoking the
   CLI. mcpx will dump the active handles/requests after the tool finishes
   and around the `runtime.close()` call.
3. **Inspect the handle list** – look for `ChildProcess (pid=…)` entries. If a
   child remains, mcpx will now unref and force-kill it, but the debug list
   tells you exactly what was keeping the event loop alive.
4. **Capture the pane output** – run `tmux capture-pane -p -t <session> -S
   -200` to save the diagnostic log for later review.
5. **Retry with `--timeout`** – if the tool itself hangs, use
   `--timeout <ms>` or `MCPX_CALL_TIMEOUT` to fail fast while still
   gathering diagnostics.
6. **Clamp OAuth waits** – when the browser-based sign-in never completes,
   run with `--oauth-timeout <ms>` (or `MCPX_OAUTH_TIMEOUT_MS`) so the CLI
   tears down the pending flow instead of waiting the full minute.

## Example Session

```bash
tmux new-session -d -s mcphang \
  'cd /path/to/project && \
   MCPX_DEBUG_HANG=1 \
   CHROME_DEVTOOLS_MCP_BROWSER_URL=http://127.0.0.1:9222 \
   pnpm --dir "$HOME/projects/mcpx" exec tsx \
   "$HOME/projects/mcpx/src/cli.ts" call \
   --config "$PWD/mcp.json" \
   --root "$PWD" \
   chrome-devtools --tool list_pages'

sleep 5
tmux capture-pane -p -t mcphang -S -200
```

Sample diagnostic output (abridged):

```
[mcpx] [debug] after call (object result): 6 active handle(s), 0 request(s)
[mcpx] [debug] handle => ChildProcess (pid=78480)
[mcpx] [debug] beginning runtime.close()
[mcpx] [debug] after runtime.close: 6 active handle(s), 0 request(s)
[mcpx] [debug] forcibly killed child pid=78480 (runtime.finally)
```

This confirms the CLI response completed and that the lingering handle was a
child process, which mcpx will now terminate during shutdown.

## Notes

- The diagnostics only appear when `MCPX_DEBUG_HANG=1` is set.
- Killing residual children is best-effort; if you see repeated `kill-failed`
  messages, manually terminate the PID listed in the log.
- Always keep tmux sessions tidy after debugging: `tmux kill-session -t
  <session>`.
- The CLI now forces `process.exit(0)` after cleanup by default so Node never
  lingers on leaked handles. Export `MCPX_NO_FORCE_EXIT=1` if you’re
  debugging and need the process to stay alive.
- You can still set `MCPX_FORCE_EXIT=1` explicitly when you want to force
  termination even with `MCPX_NO_FORCE_EXIT` in play.
- Stdio servers have their stderr output suppressed by default; set
  `MCPX_STDIO_LOGS=1` to print their logs (they’re also surfaced whenever a
  child exits with a non-zero status).

## Upstream Tracking

- `@modelcontextprotocol/sdk` **1.21.0** is the latest release pulled into mcpx.
- Open SDK issues related to stdio shutdown:
  - [#579 StdioClientTransport does not follow the spec on close](https://github.com/modelcontextprotocol/typescript-sdk/issues/579)
  - [#780 onerror listeners not removed after client close (stdio)](https://github.com/modelcontextprotocol/typescript-sdk/issues/780)
  - [#1049 stdio client crashes when spawned server exits unexpectedly](https://github.com/modelcontextprotocol/typescript-sdk/issues/1049)

We keep a local checkout of the SDK under `~/Projects/typescript-sdk/` so we can
diff against upstream and craft repros/patches quickly. Any mcpx-specific
workarounds live in `src/sdk-patches.ts` until the upstream fixes land.
