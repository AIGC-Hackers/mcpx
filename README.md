# mcpx

Project-scoped MCP command surface for agents.

```bash
mcpx add --name posthog --url https://mcp.posthog.com/mcp --bearer-env POSTHOG_AUTH_HEADER
mcpx remove --name posthog
mcpx --schema
mcpx posthog alert-create --input '{ }'
mcpx skill --server posthog --server sentry
```

`mcpx add` stores MCP servers in the user's global registry at
`~/.agents/mcpx/servers.json`. Projects do not need their own MCP config. Use
`mcpx skill` to generate a project-local `.agents/skills/mcpx/SKILL.md` that tells
agents which global MCP servers to explore with `mcpx --schema=".{...}"`.
