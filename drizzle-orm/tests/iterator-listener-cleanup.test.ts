import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NoopCache } from '~/cache/core/index.ts';
import { NoopLogger } from '~/logger.ts';
import { MySql2PreparedQuery } from '~/mysql2/session.ts';
import { SingleStoreDriverPreparedQuery } from '~/singlestore/session.ts';

/**
 * Build a fake mysql2 stream that we can drive event-by-event and inspect
 * listener counts on. The fake intentionally only implements the surface
 * the iterator() function actually uses (`pause`, `resume`, `on`, `once`,
 * `off`, `emit`), so any new listener registration on the production path
 * shows up in `listenerCount`.
 */
function buildFakeStream(): EventEmitter & { pause: () => void; resume: () => void } {
	const stream = new EventEmitter() as EventEmitter & { pause: () => void; resume: () => void };
	stream.pause = () => {};
	stream.resume = () => {};
	return stream;
}

/**
 * Build a fake mysql2 client that:
 *   - Is NOT a Pool (no `getConnection`), so `isPool(client)` is false and
 *     `conn.end()` in the finally block is skipped.
 *   - Exposes `.connection.query(...)` which returns an object with a
 *     `.stream()` method that yields the supplied EventEmitter.
 */
function buildFakeClient(stream: EventEmitter) {
	const driverQuery = { stream: () => stream };
	const connection = { query: () => driverQuery } as any;
	return { connection } as any;
}

/**
 * Drive a fake stream through three data rows then 'end', mirroring the
 * row emission pattern of the real mysql2 driver. We schedule each emit
 * on its own microtask so the consumer's Promise.race has a chance to
 * settle before the next event fires.
 */
async function driveThreeRowsThenEnd(stream: EventEmitter): Promise<void> {
	const rows = [['1'], ['2'], ['3']];
	for (const row of rows) {
		await new Promise<void>((r) => setImmediate(r));
		stream.emit('data', row);
	}
	await new Promise<void>((r) => setImmediate(r));
	stream.emit('end');
}

describe('mysql2 iterator() listener cleanup (regression for #5839)', () => {
	beforeEach(() => {
		// Trip the warning into an error so an accumulating leak across
		// repeated calls would be impossible to silently miss.
		EventEmitter.defaultMaxListeners = 10;
	});

	afterEach(() => {
		EventEmitter.defaultMaxListeners = 10;
	});

	test('a fully-consumed iterator leaves zero listeners on the stream', async () => {
		const stream = buildFakeStream();
		const client = buildFakeClient(stream);

		const prepared = new MySql2PreparedQuery(
			client,
			'select 1',
			[],
			new NoopLogger(),
			new NoopCache(),
			undefined,
			undefined,
			undefined,
		);

		const consumed: unknown[] = [];
		const consumer = (async () => {
			for await (const row of prepared.iterator()) {
				consumed.push(row);
			}
		})();

		await driveThreeRowsThenEnd(stream);
		await consumer;

		expect(consumed).toHaveLength(3);
		expect(stream.listenerCount('data'), 'data listener leaked').toBe(0);
		expect(stream.listenerCount('end'), 'end listener leaked').toBe(0);
		expect(stream.listenerCount('error'), 'error listener leaked').toBe(0);
	});

	test('repeated iterator() calls on a shared stream do not accumulate listeners', async () => {
		const stream = buildFakeStream();
		const client = buildFakeClient(stream);

		const warnings: string[] = [];
		const onWarning = (w: Error) => {
			if (w.name === 'MaxListenersExceededWarning') {
				warnings.push(w.message);
			}
		};
		process.on('warning', onWarning);

		try {
			for (let i = 0; i < 20; i++) {
				const prepared = new MySql2PreparedQuery(
					client,
					'select 1',
					[],
					new NoopLogger(),
					new NoopCache(),
					undefined,
					undefined,
					undefined,
				);

				const consumer = (async () => {
					for await (const _ of prepared.iterator()) {
						/* drain */
					}
				})();

				await driveThreeRowsThenEnd(stream);
				await consumer;
			}
		} finally {
			process.off('warning', onWarning);
		}

		expect(warnings, 'iterator() leaked listeners on the shared stream').toEqual([]);
		expect(stream.listenerCount('data')).toBe(0);
		expect(stream.listenerCount('end')).toBe(0);
		expect(stream.listenerCount('error')).toBe(0);
	});

	test('iterator() that throws via an error event still cleans listeners', async () => {
		const stream = buildFakeStream();
		const client = buildFakeClient(stream);

		const prepared = new MySql2PreparedQuery(
			client,
			'select 1',
			[],
			new NoopLogger(),
			new NoopCache(),
			undefined,
			undefined,
			undefined,
		);

		const consumer = (async () => {
			try {
				for await (const _ of prepared.iterator()) {
					/* drain */
				}
			} catch {
				/* swallow */
			}
		})();

		await new Promise<void>((r) => setImmediate(r));
		stream.emit('error', new Error('boom'));
		await consumer;

		expect(stream.listenerCount('data')).toBe(0);
		expect(stream.listenerCount('end')).toBe(0);
		expect(stream.listenerCount('error')).toBe(0);
	});

	test('iterator() that exits via consumer break still cleans listeners', async () => {
		const stream = buildFakeStream();
		const client = buildFakeClient(stream);

		const prepared = new MySql2PreparedQuery(
			client,
			'select 1',
			[],
			new NoopLogger(),
			new NoopCache(),
			undefined,
			undefined,
			undefined,
		);

		const consumer = (async () => {
			for await (const _ of prepared.iterator()) {
				break; // exit on first row
			}
		})();

		await new Promise<void>((r) => setImmediate(r));
		stream.emit('data', ['1']);
		await consumer;

		expect(stream.listenerCount('data')).toBe(0);
		expect(stream.listenerCount('end')).toBe(0);
		expect(stream.listenerCount('error')).toBe(0);
	});
});

describe('singlestore iterator() listener cleanup (regression for #5839)', () => {
	test('a fully-consumed iterator leaves zero listeners on the stream', async () => {
		const stream = buildFakeStream();
		const client = buildFakeClient(stream);

		const prepared = new SingleStoreDriverPreparedQuery(
			client,
			'select 1',
			[],
			new NoopLogger(),
			new NoopCache(),
			undefined,
			undefined,
			undefined,
		);

		const consumed: unknown[] = [];
		const consumer = (async () => {
			for await (const row of prepared.iterator()) {
				consumed.push(row);
			}
		})();

		await driveThreeRowsThenEnd(stream);
		await consumer;

		expect(consumed).toHaveLength(3);
		expect(stream.listenerCount('data')).toBe(0);
		expect(stream.listenerCount('end')).toBe(0);
		expect(stream.listenerCount('error')).toBe(0);
	});

	test('repeated iterator() calls on a shared stream do not accumulate listeners', async () => {
		const stream = buildFakeStream();
		const client = buildFakeClient(stream);

		const warnings: string[] = [];
		const onWarning = (w: Error) => {
			if (w.name === 'MaxListenersExceededWarning') {
				warnings.push(w.message);
			}
		};
		process.on('warning', onWarning);

		try {
			for (let i = 0; i < 20; i++) {
				const prepared = new SingleStoreDriverPreparedQuery(
					client,
					'select 1',
					[],
					new NoopLogger(),
					new NoopCache(),
					undefined,
					undefined,
					undefined,
				);

				const consumer = (async () => {
					for await (const _ of prepared.iterator()) {
						/* drain */
					}
				})();

				await driveThreeRowsThenEnd(stream);
				await consumer;
			}
		} finally {
			process.off('warning', onWarning);
		}

		expect(warnings).toEqual([]);
		expect(stream.listenerCount('data')).toBe(0);
		expect(stream.listenerCount('end')).toBe(0);
		expect(stream.listenerCount('error')).toBe(0);
	});
});
