const OriginalConsole = console

// Send debug console output to STDERR
if (process.argv.includes('--debug')) {
	// Direct messages for both stdout and stderr to stderr
	globalThis.console = new OriginalConsole.Console(
		process.stderr,
		process.stderr,
	)

// No console output unless debugging
} else {
	// Stub out a subset of the API
	globalThis.console = Object.assign(Object.create(OriginalConsole), {
		clear() {},
		debug() {},
		dir() {},
		error() {},
		info() {},
		log() {},
		table() {},
		trace() {},
		warn() {},
	})
}
