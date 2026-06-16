import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { AuthDiscovery, BearerCredential } from './types'

import { daemonDir } from './daemon-paths'

type BearerCursorState = {
	version: 1
	cursors: Record<string, number>
}

const CURSOR_FILE = 'bearer-cursors.json'
const LOCK_DIR = 'bearer-cursors.lock'
const LOCK_RETRY_MS = 25
const LOCK_TIMEOUT_MS = 1_000
const LOCK_STALE_MS = 30_000

export function authFromBearerValues(
	values: string | string[] | undefined,
): AuthDiscovery | undefined {
	if (values === undefined) return undefined
	const rawValues = Array.isArray(values) ? values : [values]
	const credentials = rawValues.map(parseBearerCredential)
	if (credentials.length === 0) return undefined
	return {
		kind: 'bearer',
		credentials,
		strategy: 'round-robin',
		confidence: 'configured',
	}
}

export function bearerAuthRef(
	auth: Extract<AuthDiscovery, { kind: 'bearer' }>,
): string[] {
	return auth.credentials.map((credential) => {
		if (credential.kind === 'env') return `env:${credential.name}`
		return `literal:${hashSecret(credential.value)}`
	})
}

export function describeBearerAuth(
	auth: Extract<AuthDiscovery, { kind: 'bearer' }>,
): string {
	return `bearer ${bearerAuthRef(auth).join(',')}`
}

export function resolveBearerHeaderForProbe(
	auth: Extract<AuthDiscovery, { kind: 'bearer' }>,
): string {
	const credential = auth.credentials[0]
	if (!credential)
		throw new Error('Bearer auth requires at least one credential.')
	return normalizeBearerToken(resolveBearerCredential(credential))
}

export async function resolveBearerHeader(
	serverUrl: string,
	auth: Extract<AuthDiscovery, { kind: 'bearer' }>,
): Promise<string> {
	if (auth.credentials.length === 0)
		throw new Error('Bearer auth requires at least one credential.')
	const credential =
		auth.credentials.length === 1
			? auth.credentials[0]
			: await selectRoundRobinCredential(serverUrl, auth)
	if (!credential)
		throw new Error('Bearer auth requires at least one credential.')
	return normalizeBearerToken(resolveBearerCredential(credential))
}

function parseBearerCredential(value: string): BearerCredential {
	const trimmed = value.trim()
	if (!trimmed) throw new Error('Bearer credential cannot be empty.')
	const envName = parseEnvReference(trimmed)
	if (envName) return { kind: 'env', name: envName }
	return { kind: 'literal', value: trimmed }
}

function parseEnvReference(value: string): string | undefined {
	if (value.startsWith('env:')) {
		const name = value.slice('env:'.length)
		if (!isEnvName(name))
			throw new Error(`Invalid bearer env reference: ${value}`)
		return name
	}

	const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)
	return match?.[1]
}

function resolveBearerCredential(credential: BearerCredential): string {
	if (credential.kind === 'literal') return credential.value
	const value = process.env[credential.name]
	if (!value) {
		throw new Error(`Bearer env reference "${credential.name}" is not set.`)
	}
	return value
}

function normalizeBearerToken(value: string): string {
	return value.startsWith('Bearer ') ? value : `Bearer ${value}`
}

async function selectRoundRobinCredential(
	serverUrl: string,
	auth: Extract<AuthDiscovery, { kind: 'bearer' }>,
): Promise<BearerCredential> {
	return withCursorLock(async () => {
		const state = await readCursorState()
		const key = cursorKey(serverUrl, auth)
		const current = state.cursors[key] ?? 0
		const index = current % auth.credentials.length
		state.cursors[key] = (index + 1) % auth.credentials.length
		await writeCursorState(state)
		const credential = auth.credentials[index]
		if (!credential)
			throw new Error('Bearer auth requires at least one credential.')
		return credential
	})
}

async function withCursorLock<T>(run: () => Promise<T>): Promise<T> {
	const lockPath = path.join(daemonDir(), LOCK_DIR)
	const deadline = Date.now() + LOCK_TIMEOUT_MS

	while (true) {
		try {
			await fs.mkdir(daemonDir(), { recursive: true, mode: 0o700 })
			await fs.mkdir(lockPath, { recursive: false })
			break
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error
			}
			if (await isStaleLock(lockPath)) {
				// A crashed CLI can leave the mkdir lock behind; reclaim it after the normal call window.
				await fs.rm(lockPath, { recursive: true, force: true })
				continue
			}
			if (Date.now() >= deadline) {
				throw new Error('Timed out waiting for bearer round-robin state lock.')
			}
			await sleep(LOCK_RETRY_MS)
		}
	}

	try {
		return await run()
	} finally {
		await fs.rm(lockPath, { recursive: true, force: true })
	}
}

async function isStaleLock(lockPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(lockPath)
		return Date.now() - stat.mtimeMs > LOCK_STALE_MS
	} catch {
		return false
	}
}

async function readCursorState(): Promise<BearerCursorState> {
	try {
		const raw = await fs.readFile(cursorPath(), 'utf8')
		const parsed = JSON.parse(raw) as BearerCursorState
		if (
			parsed.version !== 1 ||
			!parsed.cursors ||
			typeof parsed.cursors !== 'object'
		) {
			throw new Error(`Invalid bearer cursor state at ${cursorPath()}.`)
		}
		return { version: 1, cursors: parsed.cursors }
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
			return { version: 1, cursors: {} }
		throw error
	}
}

async function writeCursorState(state: BearerCursorState): Promise<void> {
	await fs.mkdir(daemonDir(), { recursive: true, mode: 0o700 })
	await fs.writeFile(cursorPath(), `${JSON.stringify(state, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600,
	})
}

function cursorPath(): string {
	return path.join(daemonDir(), CURSOR_FILE)
}

function cursorKey(
	serverUrl: string,
	auth: Extract<AuthDiscovery, { kind: 'bearer' }>,
): string {
	return createHash('sha256')
		.update(JSON.stringify({ serverUrl, credentials: bearerAuthRef(auth) }))
		.digest('hex')
}

function hashSecret(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function isEnvName(value: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms))
}
