import { describe, expect, it } from 'bun:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { HttpServerConfig } from '../src/types'

import { authFromBearerValues } from '../src/bearer'
import {
	normalizeAuthScheme,
	resolveHeaders,
	resolveProbeHeaders,
} from '../src/headers'

describe('headers', () => {
	it('canonicalizes bearer token auth scheme', () => {
		expect(normalizeAuthScheme('bearer')).toBe('Bearer')
		expect(normalizeAuthScheme('Bearer')).toBe('Bearer')
		expect(normalizeAuthScheme('BEARER')).toBe('Bearer')
		expect(normalizeAuthScheme('user')).toBe('Bearer')
		expect(normalizeAuthScheme('bot')).toBe('Bearer')
	})

	it('keeps non-bearer token auth schemes unchanged', () => {
		expect(normalizeAuthScheme('DPoP')).toBe('DPoP')
	})

	it('parses literal and referenced bearer credentials', () => {
		expect(
			authFromBearerValues([
				'env:FIRST_TOKEN',
				'${SECOND_TOKEN}',
				'sk_literal',
			]),
		).toEqual({
			kind: 'bearer',
			credentials: [
				{ kind: 'env', name: 'FIRST_TOKEN' },
				{ kind: 'env', name: 'SECOND_TOKEN' },
				{ kind: 'literal', value: 'sk_literal' },
			],
			strategy: 'round-robin',
			confidence: 'configured',
		})
	})

	it('fails fast when a bearer env reference is missing', () => {
		const previous = process.env.MISSING_MCPX_TEST_TOKEN
		delete process.env.MISSING_MCPX_TEST_TOKEN
		const server = bearerServer(['env:MISSING_MCPX_TEST_TOKEN'])

		try {
			expect(() => resolveProbeHeaders(server)).toThrow(
				/MISSING_MCPX_TEST_TOKEN/,
			)
		} finally {
			if (previous === undefined) {
				delete process.env.MISSING_MCPX_TEST_TOKEN
			} else {
				process.env.MISSING_MCPX_TEST_TOKEN = previous
			}
		}
	})

	it('round-robins bearer credentials across CLI invocations', async () => {
		const previousHome = process.env.MCPX_HOME
		const previousFirst = process.env.FIRST_MCPX_TEST_TOKEN
		const previousSecond = process.env.SECOND_MCPX_TEST_TOKEN
		const home = await fs.mkdtemp(path.join(tmpdir(), 'mcpx-bearer-test-'))
		process.env.MCPX_HOME = home
		process.env.FIRST_MCPX_TEST_TOKEN = 'first'
		process.env.SECOND_MCPX_TEST_TOKEN = 'Bearer second'

		try {
			const server = bearerServer([
				'env:FIRST_MCPX_TEST_TOKEN',
				'env:SECOND_MCPX_TEST_TOKEN',
			])

			await expect(resolveHeaders(server)).resolves.toMatchObject({
				Authorization: 'Bearer first',
			})
			await expect(resolveHeaders(server)).resolves.toMatchObject({
				Authorization: 'Bearer second',
			})
			await expect(resolveHeaders(server)).resolves.toMatchObject({
				Authorization: 'Bearer first',
			})
		} finally {
			await fs.rm(home, { recursive: true, force: true })
			if (previousHome === undefined) {
				delete process.env.MCPX_HOME
			} else {
				process.env.MCPX_HOME = previousHome
			}
			if (previousFirst === undefined) {
				delete process.env.FIRST_MCPX_TEST_TOKEN
			} else {
				process.env.FIRST_MCPX_TEST_TOKEN = previousFirst
			}
			if (previousSecond === undefined) {
				delete process.env.SECOND_MCPX_TEST_TOKEN
			} else {
				process.env.SECOND_MCPX_TEST_TOKEN = previousSecond
			}
		}
	})
})

function bearerServer(values: string[]): HttpServerConfig {
	const auth = authFromBearerValues(values)
	if (!auth || auth.kind !== 'bearer') throw new Error('Expected bearer auth.')
	return {
		url: 'https://mcp.example.com/mcp',
		auth,
	}
}
