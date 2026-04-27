# Deferred Work Log

- Implement full OAuth token flow using the MCP SDK auth provider. The first version detects and caches OAuth protected-resource metadata, but it does not yet complete browser authorization.
- Add optional generated command artifacts after the runtime schema path stabilizes. The first version builds the argc router dynamically from the global registry.
- Replace the lightweight JSON Schema adapter with full local validation/coercion if `--input`-only usage proves insufficient. For now MCP servers remain the source of truth beyond object shape and required fields.
- Add SSE fallback only if a target server lacks Streamable HTTP support. The first version intentionally follows the modern Streamable HTTP path used by PostHog.
- Update the GitHub release workflow to use `scripts/build.sh` and the JS bundle packaging path. The current workflow still references the old `src/cli.ts` entrypoint and completions artifacts.
