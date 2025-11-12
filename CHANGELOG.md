# Changelog

## [Unreleased]

### Configuration
- Default config search now merges `./mcp.json` (project) with `~/.mcpx/mcp.json` (user); project entries win on conflicts, and `--config` still overrides the lookup entirely.
- Added `migrateLegacyConfigs()` and auto-run migration when neither file exists—legacy `config/mcpx.json` content is copied to `./mcp.json`, and Cursor/Claude/Codex/Windsurf/VS Code configs are imported into `~/.mcpx/mcp.json`.
- Updated CLI help, completions, README, and docs to call out the new paths and migration behavior.

## [0.7.0] - 2025-11-10

### Shell Completions
- **Added shell completions for Zsh, Bash, and Fish**: Auto-completion for commands, flags, and values
  - Zsh: `~/.zsh/completions/_mcpx`
  - Bash: `~/.bash_completions/mcpx.bash`
  - Fish: `~/.config/fish/completions/mcpx.fish`
- Completions automatically installed via Homebrew
- Updated Homebrew formula workflow to download and install completion scripts

### API Simplification
- **Removed `--schema` flag**: Schema is now always included in `listTools` responses
  - Simplified caching logic (removed schema from cache key)
  - Removed 41 lines of conditional schema logic
  - Updated help text, examples, and documentation
  - Migration: Just remove the `--schema` flag - schemas are always included now

### Breaking Changes
- **Removed `mcpx auth` command**: OAuth flows are now fully automatic and triggered on-demand
  - OAuth automatically triggers when servers require authentication
  - No manual `auth` command needed - just run `mcpx list` or `mcpx call` and OAuth happens automatically
  - Aligns mcpx with other MCP clients (Claude Desktop, Cursor, Codex) which don't have manual auth commands
  - OAuth token caching in `~/.mcpx/<server>/` still works the same
  - Removed 328 lines of redundant auth command code
  - Migration: Instead of `mcpx auth <server>`, just run your command (e.g., `mcpx list <server>`) and OAuth will trigger automatically

## [0.6.0] - 2025-11-09

### OAuth
- **Auto-reconnect after OAuth completion**: After `finishAuth()` completes successfully, the runtime now automatically creates a fresh transport and reconnects instead of timing out after 30 seconds. First OAuth flow completes in ~13 seconds (down from ~43 seconds).
- **In-memory state management**: OAuth `state` and `code_verifier` are now stored in memory instead of being persisted to disk. This fixes "internal error" issues when retrying after Ctrl+C interruption during OAuth flows.

### Breaking Changes
- **Removed `--json` shortcut flag**: Use `--output json` instead. The `--json` flag was redundant and caused confusion with the more explicit `--output` flag.
  - Migration: `mcpx list --json` → `mcpx list --output json`
  - All documentation and tests updated to use `--output json`

## [0.4.2] - 2025-11-08

### Dependencies
- Removed `@iarna/toml` in favor of `confbox` for TOML parsing
- Removed `express` and `@types/express` from test dependencies (replaced with Node.js native `http.createServer`)
- Removed `tsx` (Bun provides native TypeScript runtime)
- Unified JSON5/object literal parsing to use `acorn` instead of `confbox` in stdin batch processing
- Removed `engines` field from package.json (Bun-first toolchain)

### Documentation
- Removed "Add to your project" section from README (mcpx is a CLI tool, not a library dependency)
- Updated all command examples from `pnpm` to `bun run`
- Updated testing/CI documentation to reflect Oxfmt (not Biome) and Bun toolchain
- Fixed default imports list to include `windsurf` and `vscode`

## [0.4.1] - 2025-11-08

### OAuth
- Fixed OAuth authorization code reuse bug when falling back from Streamable to SSE transport; the runtime now tracks whether `finishAuth` has completed and skips the auth flow on subsequent transport attempts.
- Added authorization code caching in OAuth session to support multiple `waitForAuthorizationCode` calls during transport fallback without creating new deferred promises that would never resolve.
- Enabled automatic OAuth detection for all HTTP servers (not just ad-hoc); servers no longer require explicit `"auth": "oauth"` configuration, matching Cursor/Claude Desktop behavior.

## [0.4.0] - 2025-11-08

### Breaking changes
- Removed `generate-cli` feature and related code (~3,700 lines) to simplify the codebase.

## [0.3.6] - 2025-11-08

### CLI & runtime
- `mcpx list` now prints copy/pasteable examples for ad-hoc servers by repeating the HTTP URL (with quoting) so the commands shown under `Examples:` actually work before you persist the definition.

### Code generation
- Staged the actual dependency directories (`commander`, `mcpx`) directly into the Bun bundler workspace so `npx mcpx generate-cli "npx -y chrome-devtools-mcp" --compile` succeeds even when npm hoists dependencies outside the package (fixes the regression some users still saw with 0.3.5).

## [0.3.5] - 2025-11-08

### Code generation
- Ensure the Bun bundler resolves `commander`/`mcpx` even when `npx mcpx generate-cli … --compile` runs inside an empty temp directory by symlinking mcpx’s own `node_modules` into the staging workspace before invoking `bun build`. This keeps the “one weird trick” workflow working post-0.3.4 without requiring extra installs.

## [0.3.4] - 2025-11-08

### CLI & runtime
- Added a global `--oauth-timeout <ms>` flag (and the matching `MCPX_OAUTH_TIMEOUT_MS` override) so long-running OAuth handshakes can be shortened during debugging; the runtime now logs a clear warning and tears down the flow once the limit is reached, ensuring `mcpx list/call/auth` always exit.

### Docs
- Documented the new OAuth timeout flag/env var across the README and tmux/hang-debug guides so release checklists and manual repro steps call out the faster escape hatch.

## [0.3.3] - 2025-11-07

### Code generation
- When a server definition omits `description`, `mcpx generate-cli` now asks the MCP server for its own `instructions`/`serverInfo.title` during tool discovery and embeds that value, so generated CLIs introduce themselves with the real server description instead of the generic “Standalone CLI…” fallback.
- Embedded tool listings inside generated CLIs now show each command’s flag signature (no `usage:` prefix) separated by blank lines, and per-command `--help` output inherits the same colorized usage/option styling as the main `mcpx` binary for readability on rich TTYs.
- Added a `--bundler rolldown|bun` flag to `mcpx generate-cli`, defaulting to Rolldown but allowing Bun’s bundler (when paired with `--runtime bun`) for teams that want to stay entirely inside the Bun toolchain. The generator now records the chosen bundler in artifact metadata and enforces the Bun-only constraint so reproduction via `--from` stays deterministic.
- When Bun is installed (and therefore selected as the runtime), `mcpx generate-cli` now automatically switches the bundler to Bun as well—no need to pass `--bundler bun` manually—while keeping Rolldown as the default for Node runtimes.
- Bundling with Bun copies the generated template into mcpx’s install tree before invoking `bun build`, ensuring local `commander`/`mcpx` dependencies resolve even when the user runs the generator from an empty temp directory.

## [0.3.2] - 2025-11-07

### CLI
- Embedded the CLI version so Homebrew/Bun builds respond to `mcpx --version` even when `package.json` is unavailable.
- Revamped `mcpx --help` to mirror the richer list/call formatting (name + summary rows, grouped sections, quick-start examples, and ANSI colors when TTYs are detected).
- Fixed `mcpx list` so it no longer errors when `config/mcpx.json` is absent—fresh installs now run without creating config files, and a regression test guards the optional-config flow.
- Generated standalone CLIs now print the full help menu (same grouped layout as the main CLI) when invoked without arguments, matching the behavior of `mcpx` itself.

### Code generation
- Generated binaries now default to the current working directory (using the inferred server name) when `--compile` is provided without a path, and automatically append a numeric suffix when the target already exists.
- Standalone CLIs inherit the improved help layout (color-aware title, grouped command summaries, embedded tool listings, and quick-start snippets) so generated artifacts read the same way as the main CLI.
- Swapped the bundler from esbuild to Rolldown for both JS and Bun targets, removing the fragile per-architecture esbuild binaries while keeping aliasing for local dependencies and honoring `--minify` via Rolldown’s native minifier.
- Improved `generate-cli` so inline stdio commands (e.g., `"npx chrome-devtools-mcp"`) parse correctly even when invoked from empty directories.

### Code generation
- `readPackageMetadata()` now tolerates missing `package.json` files; when invoked from a directory without a manifest it falls back to mcpx’s own version string, so `generate-cli` works even when you call it via `npx` in an empty folder.

## [0.3.1] - 2025-11-07

### CLI & runtime
- Short-circuited global `--help` / `--version` handling so these flags no longer fall through command inference and always print immediately, regardless of which command the user typed first.
- Added regression coverage for the new shortcuts and kept the existing `runCli` helper exported so tests (and downstream tools) can exercise argument parsing without forking the entire process.

### Code generation & metadata
- Fixed `mcpx generate-cli --bundle/--compile` in empty directories by aliasing `commander`/`mcpx` imports to the CLI’s own installation so esbuild always resolves dependencies. Verified with a new fixture that bundles from temp dirs without `node_modules` (fixes #1).
- Added an end-to-end integration test that runs `dist/mcpx generate-cli` twice—once for bundling and once for `--compile`—as well as a GitHub Actions step that installs Bun so CI exercises the compiled binary path on every PR.


## [0.3.0] - 2025-11-06

### CLI & runtime
- Added configurable log levels (`--log-level` / `MCPX_LOG_LEVEL`) that default to `warn`, promoting noisy transport fallbacks to warnings so critical issues still surface.
- Forced the CLI to exit cleanly after shutdown (opt out with `MCPX_NO_FORCE_EXIT`) and patched `StdioClientTransport` so stdio MCP servers no longer leave Node handles hanging; stderr from stdio servers is buffered and replayed via `MCPX_STDIO_LOGS=1` or whenever a server exits with a non-zero status.

### Discovery, calling, and ad-hoc workflows
- Rebuilt `mcpx list`: spinner updates stream live, summaries print only after discovery completes, and single-server views now render TypeScript-style doc blocks, inline examples, inferred return hints, and compact `// optional (N): …` summaries. The CLI guarantees at least five parameters before truncating, introduced a single `--all-parameters` switch (replacing the `--required-only` / `--include-optional` pair), and shares its formatter with `mcpx generate-cli` so signatures are consistent everywhere.
- Verb inference and parser upgrades let bare server names dispatch to `list`, dotted invocations jump straight to `call`, colon-delimited flags (`key:value` / `key: value`) sit alongside `key=value`, and the JavaScript-like call syntax now supports unlabeled positional arguments plus typo correction heuristics when tool names are close but not exact.
- Ad-hoc workflows are significantly safer: `--http-url` / `--stdio` definitions (with `--env`, `--cwd`, `--name`, `--persist`) work across `list`, `call`, and `auth`, mcpx reuses existing config entries when a URL matches (preserving OAuth tokens / redirect URIs), and `mcpx auth <url>` piggybacks on the same resolver to persist entries or retry when a server flips modes mid-flight.
- Hardened OAuth detection automatically promotes ad-hoc HTTP servers that return 401/403 to `auth: "oauth"`, broadens the unauthorized heuristic for Supabase/Vercel/GitHub-style responses, and performs a one-time retry whenever a server switches into OAuth mode while you are connecting.

### Code generation & metadata
- Generated CLIs now embed their metadata (generator version, resolved server definition, invocation flags) behind a hidden `__mcpx_inspect` command. `mcpx inspect-cli` / `mcpx generate-cli --from <artifact>` read directly from the artifact, while legacy `.metadata.json` sidecars remain as a fallback for older binaries.
- Shared the TypeScript signature formatter between `mcpx list` and `mcpx generate-cli`, ensuring command summaries, CLI hints, and generator help stay pixel-perfect and are backed by new snapshot/unit tests.
- Introduced `mcpx emit-ts`, a codegen command that emits `.d.ts` tool interfaces or ready-to-run client wrappers (`--mode types|client`, `--include-optional`) using the same doc/comment data that powers the CLI, so agents/tests can consume MCP servers with strong TypeScript types.
- `mcpx generate-cli` now accepts inline stdio commands via `--command "npx -y package@latest"` or by quoting the command as the first positional argument, automatically splits the command/args, infers a friendly name from scripts or package scopes, and documents the chrome-devtools one-liner in the README; additional unit tests cover HTTP, stdio, scoped package, and positional shorthand flows.

### Documentation & references
- Added `docs/tool-calling.md`, `docs/call-syntax.md`, and `docs/call-heuristic.md` to capture every invocation style (flags, function expressions, inferred verbs) plus the typo-correction rules.
- Expanded the ad-hoc/OAuth story across `README.md`, `docs/adhoc.md`, `docs/local.md`, `docs/known-issues.md`, and `docs/supabase-auth-issue.md`, detailing when servers auto-promote to OAuth, how retries behave, and how to persist generated definitions safely.
- Updated the README, CLI reference, and generator docs to cover the new `--all-parameters` flag, list formatter, metadata embedding, the `mcpx emit-ts` workflow, and refreshed branding so the CLI and docs consistently introduce the project as **MCPX**.
- Tightened `RELEASE.md` with a zero-warning policy so `pnpm check`, `pnpm test`, `npm pack --dry-run`, and friends must run clean before publishing.

## [0.2.0] - 2025-11-06

- Added non-blocking `mcpx list` output with per-server status and parallel discovery.
- Introduced `mcpx auth <server>` helper (and library API support) so OAuth flows don’t hang list calls.
- Set the default list timeout to 30 s (configurable via `MCPX_LIST_TIMEOUT`).
- Tuned runtime connection handling to avoid launching OAuth flows when auto-authorization is disabled and to reuse cached clients safely.
- Added `mcpx auth <server> --reset` to wipe cached credentials before rerunning OAuth.
- `mcpx list` now prints `[source: …]` (and `Source:` in single-server mode) for servers imported from other configs so you can see whether an entry came from Cursor, Claude, etc.
- Added a `--timeout <ms>` flag to `mcpx list` to override the per-server discovery timeout without touching environment variables.

- Generated CLIs now show full command signatures in help and support `--compile` without leaving template/bundle intermediates.
- StdIO-backed MCP servers now receive resolved environment overrides, so API keys flow through to launched processes like `obsidian-mcp-server`.
- Hardened the CLI generator to surface enum defaults/metadata and added regression tests around the new helper utilities.
- Generated artifacts now emit `<artifact>.metadata.json` files plus `mcpx inspect-cli` / `mcpx regenerate-cli` workflows (with `--dry-run` and overrides, now handled via `generate-cli --from <artifact>`) so binaries can be refreshed after upgrading mcpx.
- Fixed `mcpx call <server> <tool>` so the second positional is treated as the tool name instead of triggering the "Argument must be key=value" error, accepted `tool=`/`command=` selectors now play nicely with additional key=value payloads, and added a default call timeout (configurable via `MCPX_CALL_TIMEOUT` or `--timeout`) that tears down the MCP transport—clearing internal timers and ignoring blank env overrides—so long-running or completed tools can’t leave the CLI hanging open.

## [0.1.0]

- Initial release.
