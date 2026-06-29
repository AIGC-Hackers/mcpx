import type {
	RefreshProgressEvent,
	ServerRefreshResult,
} from './schema-refresh'

const ESC = String.fromCharCode(27)
const ANSI_HIDE_CURSOR = ESC + '[?25l'
const ANSI_SHOW_CURSOR = ESC + '[?25h'
const ANSI_ERASE_LINE = ESC + '[2K'
const ANSI_CR = '\r'
const ANSI_DIM = ESC + '[2m'
const ANSI_RESET = ESC + '[0m'
const ANSI_GREEN = ESC + '[32m'
const ANSI_YELLOW = ESC + '[33m'
const ANSI_RED = ESC + '[31m'
const ANSI_CYAN = ESC + '[36m'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export type ProgressReporter = {
	handle: (event: RefreshProgressEvent) => void
	dispose: () => void
}

export function createRefreshProgressReporter(): ProgressReporter {
	const stream = process.stderr
	const isTTY = Boolean((stream as NodeJS.WriteStream).isTTY)

	if (!isTTY) {
		return createPlainReporter(stream)
	}
	return createTtyReporter(stream)
}

function createPlainReporter(stream: NodeJS.WriteStream): ProgressReporter {
	const write = (line: string) => {
		stream.write(line + '\n')
	}
	return {
		handle(event) {
			switch (event.type) {
				case 'start':
					write(`Refreshing ${event.total} server(s)...`)
					break
				case 'server-done':
					write(
						`  [${event.completed}/${event.total}] ${event.name}: ${describeResultStatus(event.result)}`,
					)
					break
				case 'reauth-start':
					write(`Re-authenticating ${event.name} (${event.remaining} left)...`)
					break
				case 'reauth-done':
					write(`  ${event.name}: ${describeResultStatus(event.result)}`)
					break
				case 'complete':
					write('Refresh complete.')
					break
			}
		},
		dispose() {},
	}
}

function createTtyReporter(stream: NodeJS.WriteStream): ProgressReporter {
	let total = 0
	let completed = 0
	let active: string[] = []
	let phase: 'idle' | 'refresh' | 'reauth' = 'idle'
	let reauthName: string | undefined
	let frameIndex = 0
	let interval: NodeJS.Timeout | undefined
	let disposed = false

	const cols = () => stream.columns || 80

	const writeStatusLine = () => {
		if (disposed) return
		const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]
		frameIndex += 1
		let line: string
		if (phase === 'reauth') {
			line = `${ANSI_CYAN}${frame}${ANSI_RESET} Re-authenticating ${ANSI_CYAN}${reauthName ?? ''}${ANSI_RESET}`
		} else if (phase === 'refresh') {
			const counter = `${ANSI_DIM}[${completed}/${total}]${ANSI_RESET}`
			const list = active.length > 0 ? active.join(', ') : 'finishing...'
			const max = Math.max(20, cols() - 12)
			const trimmed = list.length > max ? list.slice(0, max - 1) + '…' : list
			line = `${ANSI_CYAN}${frame}${ANSI_RESET} ${counter} ${trimmed}`
		} else {
			return
		}
		stream.write(ANSI_CR + ANSI_ERASE_LINE + line)
	}

	const clearLine = () => {
		stream.write(ANSI_CR + ANSI_ERASE_LINE)
	}

	const startSpinner = () => {
		if (interval) return
		stream.write(ANSI_HIDE_CURSOR)
		interval = setInterval(writeStatusLine, 80)
		writeStatusLine()
	}

	const stopSpinner = () => {
		if (interval) {
			clearInterval(interval)
			interval = undefined
		}
		clearLine()
	}

	const writeLine = (line: string) => {
		clearLine()
		stream.write(line + '\n')
		writeStatusLine()
	}

	return {
		handle(event) {
			switch (event.type) {
				case 'start': {
					total = event.total
					completed = 0
					active = []
					phase = 'refresh'
					stream.write(
						`${ANSI_DIM}↻${ANSI_RESET} Refreshing ${ANSI_CYAN}${total}${ANSI_RESET} server(s)...\n`,
					)
					if (total === 0) {
						phase = 'idle'
						return
					}
					startSpinner()
					break
				}
				case 'server-start': {
					active = event.active
					break
				}
				case 'server-done': {
					completed = event.completed
					active = event.active
					writeLine(
						`  ${statusIcon(event.result)} ${event.name} ${ANSI_DIM}${describeResultStatus(event.result)}${ANSI_RESET}`,
					)
					break
				}
				case 'reauth-start': {
					phase = 'reauth'
					reauthName = event.name
					writeLine(
						`${ANSI_YELLOW}!${ANSI_RESET} Re-auth required for ${ANSI_CYAN}${event.name}${ANSI_RESET} (${event.remaining}/${event.total})`,
					)
					break
				}
				case 'reauth-done': {
					reauthName = undefined
					writeLine(
						`  ${statusIcon(event.result)} ${event.name} ${ANSI_DIM}${describeResultStatus(event.result)}${ANSI_RESET}`,
					)
					break
				}
				case 'complete': {
					phase = 'idle'
					stopSpinner()
					const s = event.summary
					const parts: string[] = []
					if (s.refreshed.length > 0)
						parts.push(
							`${ANSI_GREEN}${s.refreshed.length} refreshed${ANSI_RESET}`,
						)
					if (s.unchanged.length > 0)
						parts.push(
							`${ANSI_DIM}${s.unchanged.length} unchanged${ANSI_RESET}`,
						)
					if (s.authRefreshed.length > 0)
						parts.push(
							`${ANSI_CYAN}${s.authRefreshed.length} auth-refreshed${ANSI_RESET}`,
						)
					if (s.reauthenticated.length > 0)
						parts.push(
							`${ANSI_CYAN}${s.reauthenticated.length} reauthenticated${ANSI_RESET}`,
						)
					if (s.reauthRequired.length > 0)
						parts.push(
							`${ANSI_YELLOW}${s.reauthRequired.length} reauth-required${ANSI_RESET}`,
						)
					if (s.unreachable.length > 0)
						parts.push(
							`${ANSI_RED}${s.unreachable.length} unreachable${ANSI_RESET}`,
						)
					stream.write(
						`${ANSI_GREEN}✓${ANSI_RESET} Done${parts.length ? ': ' + parts.join(', ') : ''}\n`,
					)
					break
				}
			}
		},
		dispose() {
			disposed = true
			stopSpinner()
			stream.write(ANSI_SHOW_CURSOR)
		},
	}
}

function statusIcon(result: ServerRefreshResult): string {
	switch (result.status) {
		case 'schema-refreshed':
		case 'auth-refreshed':
		case 'reauthenticated':
			return `${ANSI_GREEN}✓${ANSI_RESET}`
		case 'reauth-required':
			return `${ANSI_YELLOW}!${ANSI_RESET}`
		case 'unreachable':
			return `${ANSI_RED}✗${ANSI_RESET}`
	}
}

function describeResultStatus(result: ServerRefreshResult): string {
	switch (result.status) {
		case 'schema-refreshed':
			return result.schemaChanged ? 'schema updated' : 'no changes'
		case 'auth-refreshed':
			return result.schemaChanged ? 'auth + schema updated' : 'auth refreshed'
		case 'reauthenticated':
			return result.schemaChanged
				? 'reauthenticated + schema updated'
				: 'reauthenticated'
		case 'reauth-required':
			return 'reauth required'
		case 'unreachable':
			return result.message ? `unreachable: ${result.message}` : 'unreachable'
	}
}
