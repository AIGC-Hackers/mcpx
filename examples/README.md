# mcpx Examples

## Batch Calling

Execute multiple MCP tool calls from a file or stdin:

```bash
# From file
cat examples/batch-calls.txt | mcpx call

# From heredoc
mcpx call << 'EOF'
linear.list_issues({ limit: 5 })
github.search_repos({ query: "mcp" })
EOF

# Pipe from another command
echo 'notion.query_database({ databaseId: "abc" })' | mcpx call
```

### Input Format

Each line should be: `server.tool({ args })`

```javascript
// JSON5 syntax supported
linear.create_issue({
  title: "Fix bug",
  priority: 2,
  labels: ["bug", "urgent"],  // trailing comma OK
})

// Comments are ignored
# This is a comment
// This is also a comment

// Empty lines are skipped
```

### Output Format

Results are returned in **TOON format** - a compact, LLM-friendly format:

```
[
  { tool: "linear.list_issues", output: { ... } },
  { tool: "github.search_repos", output: { ... } }
]
```

### Error Handling

If any call fails, the error is captured in the output:

```json
{
  "tool": "linear.bad_tool",
  "output": "Parameter validation failed:\n- Field 'id': Required (expected string, got undefined)"
}
```

The exit code is `1` if any errors occurred.

## Use Cases

### 1. LLM Tool Calling

LLMs can generate batch call files and pipe them to mcpx:

```bash
# LLM generates this
cat > /tmp/llm-calls.txt << 'EOF'
linear.list_issues({ status: "in-progress" })
github.search_code({ query: "MCP server" })
EOF

# Execute
cat /tmp/llm-calls.txt | mcpx call
```

### 2. Automation Scripts

```bash
#!/bin/bash
# Daily standup automation

mcpx call << EOF
linear.list_issues({ assignee: "me", status: "in-progress" })
github.list_prs({ author: "me", state: "open" })
slack.send_message({ channel: "#standup", text: "My updates ready" })
EOF
```

### 3. Data Migration

```bash
# Export from one system, import to another
cat export.txt | mcpx call > results.toon
```

## Interactive Mode

Single calls still work as before:

```bash
# Call syntax
mcpx call linear.list_issues limit:5

# Function syntax
mcpx call 'linear.list_issues({ limit: 5 })'
```

## Configuration

Batch calls use the same MCP server configurations:

```json
// mcp.json (project) or ~/.mcpx/mcp.json (user)
{
  "mcpServers": {
    "linear": {
      "url": "https://mcp.linear.app/mcp"
    }
  }
}
```
