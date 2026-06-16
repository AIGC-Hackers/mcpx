import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({ name: 'mcpx-stdio-fixture', version: '1.0.0' })
let counter = 0

server.registerTool(
	'echo',
	{
		title: 'Echo',
		description: 'Echo a fixed response',
		inputSchema: {},
	},
	async () => ({
		content: [{ type: 'text', text: 'ok' }],
	}),
)

server.registerTool(
	'pid',
	{
		title: 'PID',
		description: 'Return the fixture process id',
		inputSchema: {},
	},
	async () => ({
		content: [{ type: 'text', text: String(process.pid) }],
	}),
)

server.registerTool(
	'cwd',
	{
		title: 'CWD',
		description: 'Return the fixture process working directory',
		inputSchema: {},
	},
	async () => ({
		content: [{ type: 'text', text: process.cwd() }],
	}),
)

server.registerTool(
	'increment',
	{
		title: 'Increment',
		description: 'Increment in-process state',
		inputSchema: {},
	},
	async () => {
		counter += 1
		return {
			content: [{ type: 'text', text: String(counter) }],
		}
	},
)

server.registerTool(
	'slow',
	{
		title: 'Slow',
		description: 'Return after a short delay',
		inputSchema: {},
	},
	async () => {
		await new Promise((resolve) => setTimeout(resolve, 100))
		return {
			content: [{ type: 'text', text: 'slow-ok' }],
		}
	},
)

await server.connect(new StdioServerTransport())
