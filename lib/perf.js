const PERF = (process.argv.includes('--perf'));

const checkpoints = [];

checkpoint('perf-init');

export function checkpoint(label, sinceTimestamp) {
	if (!PERF) return;

	const now = Date.now();
	const sinceStart = sinceTimestamp === undefined ? checkpoints[checkpoints.length - 1]?.ts : sinceTimestamp
	const since = sinceStart ? now - sinceStart : undefined

	checkpoints.push({
		label,
		ts: now,
		since,
	});
}

export function total(label) {
	if (!PERF) return;

	checkpoint(label ?? 'total-runtime', checkpoints[0].ts);
}

export function results(sendToStderr = true) {
	if (!PERF) return;

	if (sendToStderr) {
		total();
	}

	const results = checkpoints.map(
		c => `${c.ts} (+${c.since ?? ''}) ${c.label}`
	).join('\n');

	if (sendToStderr) {
		process.stderr.write(new TextEncoder().encode(results));
	}

	return results;
}
