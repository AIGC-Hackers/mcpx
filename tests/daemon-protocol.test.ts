import { describe, expect, it } from 'bun:test'

import type { HttpServerConfig } from '../src/types'

import {
	NOTIFICATION_MODE_ENV,
	buildServerKey,
	notificationModeFromEnv,
} from '../src/daemon-protocol'

describe('daemon protocol', () => {
	it('keeps HTTP server keys stable across resolved token values', () => {
		const server: HttpServerConfig = {
			url: 'https://mcp.example.com/mcp',
			headers: { Authorization: 'Bearer old' },
			auth: {
				kind: 'bearer',
				credentials: [{ kind: 'env', name: 'MCP_TOKEN' }],
				strategy: 'round-robin',
				confidence: 'configured',
			},
		}
		const rotated: HttpServerConfig = {
			...server,
			headers: { Authorization: 'Bearer new' },
		}

		expect(buildServerKey(rotated)).toBe(buildServerKey(server))
	})

	it('isolates HTTP server keys by auth reference', () => {
		const first: HttpServerConfig = {
			url: 'https://mcp.example.com/mcp',
			auth: {
				kind: 'bearer',
				credentials: [{ kind: 'env', name: 'FIRST_TOKEN' }],
				strategy: 'round-robin',
				confidence: 'configured',
			},
		}
		const second: HttpServerConfig = {
			...first,
			auth: {
				kind: 'bearer',
				credentials: [{ kind: 'env', name: 'SECOND_TOKEN' }],
				strategy: 'round-robin',
				confidence: 'configured',
			},
		}

		expect(buildServerKey(second)).not.toBe(buildServerKey(first))
	})

	it('isolates HTTP server keys by bearer credential list', () => {
		const first: HttpServerConfig = {
			url: 'https://mcp.example.com/mcp',
			auth: {
				kind: 'bearer',
				credentials: [
					{ kind: 'env', name: 'FIRST_TOKEN' },
					{ kind: 'env', name: 'SECOND_TOKEN' },
				],
				strategy: 'round-robin',
				confidence: 'configured',
			},
		}
		const second: HttpServerConfig = {
			...first,
			auth: {
				kind: 'bearer',
				credentials: [
					{ kind: 'env', name: 'FIRST_TOKEN' },
					{ kind: 'env', name: 'THIRD_TOKEN' },
				],
				strategy: 'round-robin',
				confidence: 'configured',
			},
		}

		expect(buildServerKey(second)).not.toBe(buildServerKey(first))
	})

	it('defaults notification buffering unless explicitly discarded', () => {
		const previous = process.env[NOTIFICATION_MODE_ENV]
		try {
			delete process.env[NOTIFICATION_MODE_ENV]
			expect(notificationModeFromEnv()).toBe('buffer')

			process.env[NOTIFICATION_MODE_ENV] = 'buffer'
			expect(notificationModeFromEnv()).toBe('buffer')

			process.env[NOTIFICATION_MODE_ENV] = 'discard'
			expect(notificationModeFromEnv()).toBe('discard')
		} finally {
			if (previous === undefined) {
				delete process.env[NOTIFICATION_MODE_ENV]
			} else {
				process.env[NOTIFICATION_MODE_ENV] = previous
			}
		}
	})

	it('rejects invalid notification mode env values', () => {
		const previous = process.env[NOTIFICATION_MODE_ENV]
		try {
			process.env[NOTIFICATION_MODE_ENV] = 'off'
			expect(() => notificationModeFromEnv()).toThrow(
				'Invalid MCPX_NOTIFICATION_MODE value "off". Expected "buffer" or "discard".',
			)
		} finally {
			if (previous === undefined) {
				delete process.env[NOTIFICATION_MODE_ENV]
			} else {
				process.env[NOTIFICATION_MODE_ENV] = previous
			}
		}
	})
})
