import fs from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const DAEMON_DIR = path.join('.agents', 'mcpx')
const LOG_DIR = 'logs'

export function daemonDir(): string {
	return path.join(process.env.MCPX_HOME ?? homedir(), DAEMON_DIR)
}

export function daemonSocketPath(): string {
	return path.join(daemonDir(), 'mcpxd.sock')
}

export function daemonLogPath(): string {
	return path.join(daemonDir(), LOG_DIR, 'daemon.log')
}

export function serverLogPath(serverKey: string): string {
	return path.join(daemonDir(), LOG_DIR, `${serverKey}.stderr.log`)
}

export async function ensureDaemonDir(): Promise<void> {
	await fs.mkdir(path.join(daemonDir(), LOG_DIR), {
		recursive: true,
		mode: 0o700,
	})
	await fs.chmod(daemonDir(), 0o700).catch(() => {})
}
