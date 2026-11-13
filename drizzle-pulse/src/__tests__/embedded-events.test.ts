import { describe, expect, test } from 'bun:test';
import { createPulseEvents, type PulseEventsOptions } from '../client/embedded/events.js';
import type { PulseEvent } from '../client/embedded/pulse-events.js';
import { pulse } from '../pulse-table.js';
import { createPulseRegistry } from '../server/pulse-registry.js';
import type { WhereClause } from '../types.js';
import { asRuntime, makeMockRuntime, ordersTable } from './mock-runtime.js';

// ---------------------------------------------------------------------------
// No DB required: createPulseEvents is synchronous and stateless — no baseline,
// no merge core, no per-subscription error surface. Real WAL delivery order is
// covered by the integration suite.
// ---------------------------------------------------------------------------

const tableKey = 'public.orders';

type TestRow = Record<string, unknown>;
type TestCallback = (event: PulseEvent<TestRow>, lsn: string) => void;

// The mock's feed, narrowed to the queries the fixture registry serves — subscriptions
// get typed events instead of `any`.
function makeEvents(runtime: ReturnType<typeof makeMockRuntime>) {
	return createPulseEvents(asRuntime(runtime)) as unknown as {
		orders: (callback: TestCallback, options?: PulseEventsOptions) => () => void;
		nope: (callback: TestCallback) => () => void;
	};
}

describe('createPulseEvents — sync rejection paths', () => {
	test('an unknown query name throws synchronously', () => {
		const runtime = makeMockRuntime();
		runtime.registry = { ...runtime.registry, getPulseQuery: () => undefined };
		const events = makeEvents(runtime);
		expect(() => events.nope(() => {})).toThrow('Unknown query: "nope"');
	});

	test('subscribing before runtime.start() throws synchronously', () => {
		const runtime = makeMockRuntime({ isRunning: false });
		const events = makeEvents(runtime);
		expect(() => events.orders(() => {})).toThrow(/after runtime\.start\(\)/);
	});

	test('a .transform() query throws synchronously', () => {
		const runtime = makeMockRuntime({ hasTransform: true });
		const events = makeEvents(runtime);
		expect(() => events.orders(() => {})).toThrow(/\.transform\(\)/);
	});

	test('a .limit() query throws synchronously', () => {
		const runtime = makeMockRuntime({ limit: 2 });
		const events = makeEvents(runtime);
		expect(() => events.orders(() => {})).toThrow(/\.limit\(\)/);
	});

	test('a where on a column that .columns() excluded throws, as a live collection does', () => {
		const runtime = makeMockRuntime();
		const registry = createPulseRegistry({
			orders: pulse(ordersTable)
				.query()
				.columns({ id: true, status: true })
				// The typed builder rejects `price` here, so the cast stands for an untyped caller.
				.query((ctx) => ctx.query({ price: { gt: 5 } } as unknown as WhereClause)),
		});
		runtime.registry = registry as unknown as typeof runtime.registry;
		const events = makeEvents(runtime);
		expect(() => events.orders(() => {})).toThrow('Unsupported column: price');
	});

	test('a missing/wrong-arity callback throws synchronously instead of failing silently per event', () => {
		const runtime = makeMockRuntime();
		const events = makeEvents(runtime);
		// No-args query called as `events.orders(optionsObject)` — the "callback" is really options,
		// a misuse the type surface forbids, so the call goes through a deliberately-wrong shape.
		expect(() => (events.orders as unknown as (options: unknown) => void)({ onError: () => {} })).toThrow(
			'The CDC event stream for query "orders" needs a callback function, but got object',
		);
	});
});

describe('createPulseEvents — WHERE-filtered per-event delivery', () => {
	test('never calls readCollectionBaseline — the subscription needs no baseline', () => {
		const runtime = makeMockRuntime();
		runtime.readCollectionBaseline = async () => {
			throw new Error('readCollectionBaseline must never be called by createPulseEvents');
		};
		const events = makeEvents(runtime);
		const received: unknown[] = [];

		expect(() =>
			events.orders((event: unknown) => {
				received.push(event);
			})
		).not.toThrow();

		runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/100');
		expect(received).toHaveLength(1);
	});

	test('only rows matching the resolved WHERE produce callbacks', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: unknown[] = [];
		events.orders((event: unknown) => received.push(event));

		runtime.emitTap(tableKey, 'insert', { id: 1, status: 'requested', price: 10 }, null, '0/100');
		expect(received).toHaveLength(0);

		runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/200');
		expect(received).toHaveLength(1);
	});

	test('the callback receives (event, lsn) with lsn equal to the emitted payload lsn', () => {
		const runtime = makeMockRuntime();
		const events = makeEvents(runtime);
		const received: Array<[string, string]> = [];
		events.orders((event: any, lsn: string) => received.push([event.op, lsn]));

		runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/1A2B');
		expect(received).toEqual([['insert', '0/1A2B']]);
	});

	test('a delete whose old row does not match the where is suppressed', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: Array<{ op: string }> = [];
		events.orders((event: any) => received.push(event));

		runtime.emitTap(tableKey, 'delete', {}, { id: 1, status: 'completed', price: 10 }, '0/302');

		expect(received).toHaveLength(0);
	});

	test('a delete whose old row matches the where is delivered', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: Array<{ op: string }> = [];
		events.orders((event: any) => received.push(event));

		runtime.emitTap(tableKey, 'delete', {}, { id: 1, status: 'accepted', price: 10 }, '0/303');

		expect(received).toHaveLength(1);
		expect(received[0]!.op).toBe('delete');
	});

	test('an update where neither side matches the where is suppressed', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: unknown[] = [];
		events.orders((event: unknown) => received.push(event));

		runtime.emitTap(
			tableKey,
			'update',
			{ id: 1, status: 'requested', price: 10 },
			{ id: 1, status: 'completed', price: 5 },
			'0/304',
		);

		expect(received).toHaveLength(0);
	});

	test('an update that moves a row out of the result is a delete with the old row', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: PulseEvent<TestRow>[] = [];
		events.orders((event) => received.push(event));

		runtime.emitTap(
			tableKey,
			'update',
			{ id: 1, status: 'completed', price: 10 },
			{ id: 1, status: 'accepted', price: 10 },
			'0/305',
		);

		expect(received).toEqual([{ op: 'delete', oldRow: { id: 1, status: 'accepted', price: 10 }, pk: 1 }]);
	});

	test('an update that moves a row into the result is an insert without the out-of-scope old row', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: PulseEvent<TestRow>[] = [];
		events.orders((event) => received.push(event));

		runtime.emitTap(
			tableKey,
			'update',
			{ id: 1, status: 'accepted', price: 10 },
			{ id: 1, status: 'secret-other-scope', price: 999 },
			'0/306',
		);

		expect(received).toEqual([{ op: 'insert', row: { id: 1, status: 'accepted', price: 10 }, pk: 1 }]);
	});

	test('an update of a row that stays in the result carries the full new and old rows', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: PulseEvent<TestRow>[] = [];
		events.orders((event) => received.push(event));

		runtime.emitTap(
			tableKey,
			'update',
			{ id: 1, status: 'accepted', price: 20 },
			{ id: 1, status: 'accepted', price: 10 },
			'0/307',
		);

		expect(received).toEqual([{
			op: 'update',
			row: { id: 1, status: 'accepted', price: 20 },
			oldRow: { id: 1, status: 'accepted', price: 10 },
			pk: 1,
		}]);
	});

	test('a table delete of a matching row carries the old row', () => {
		const runtime = makeMockRuntime({ where: { status: { eq: 'accepted' } } });
		const events = makeEvents(runtime);
		const received: PulseEvent<TestRow>[] = [];
		events.orders((event) => received.push(event));

		runtime.emitTap(tableKey, 'delete', {}, { id: 1, status: 'accepted', price: 10 }, '0/308');

		expect(received).toEqual([{ op: 'delete', oldRow: { id: 1, status: 'accepted', price: 10 }, pk: 1 }]);
	});

	test('unsubscribe stops delivery and is idempotent', () => {
		const runtime = makeMockRuntime();
		const events = makeEvents(runtime);
		let count = 0;
		const unsub = events.orders(() => count++);

		runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/100');
		expect(count).toBe(1);

		unsub();
		unsub(); // idempotent — no throw, no double-detach error

		runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/200');
		expect(count).toBe(1);
	});

	test('the captured onStop listener tears the subscription down', () => {
		let stopListener: (() => void) | undefined;
		const runtime = makeMockRuntime();
		runtime.onStop = (listener: () => void) => {
			stopListener = listener;
			return () => {
				stopListener = undefined;
			};
		};

		const events = makeEvents(runtime);
		let count = 0;
		events.orders(() => count++);

		runtime.emitTap(tableKey, 'insert', { id: 1, status: 'accepted', price: 10 }, null, '0/100');
		expect(count).toBe(1);

		stopListener?.();

		runtime.emitTap(tableKey, 'insert', { id: 2, status: 'accepted', price: 20 }, null, '0/200');
		expect(count).toBe(1);
	});
});

describe('createPulseEvents — reconnect and failure callbacks', () => {
	test('onResync fires when a reconnect could not replay the outage, and not when the slot resumed', () => {
		let reconnectListener: ((snapshot: unknown) => void) | undefined;
		const runtime = makeMockRuntime();
		runtime.onReconnect = (listener: (snapshot: unknown) => void) => {
			reconnectListener = listener;
			return () => {
				reconnectListener = undefined;
			};
		};
		const events = makeEvents(runtime);
		let resyncs = 0;
		const unsub = events.orders(() => {}, { onResync: () => resyncs++ });

		reconnectListener?.(null);
		expect(resyncs).toBe(0);

		reconnectListener?.({ db: {}, watermark: '0/500' });
		expect(resyncs).toBe(1);

		unsub();
		expect(reconnectListener).toBeUndefined();
	});

	test('onError receives the error when replication fails permanently', () => {
		let terminalErrorListener: ((error: Error) => void) | undefined;
		const runtime = makeMockRuntime();
		runtime.onTerminalError = (listener: (error: Error) => void) => {
			terminalErrorListener = listener;
			return () => {
				terminalErrorListener = undefined;
			};
		};
		const events = makeEvents(runtime);
		const errors: Error[] = [];
		events.orders(() => {}, { onError: (error) => errors.push(error) });

		const failure = new Error('replication gave up');
		terminalErrorListener?.(failure);
		expect(errors).toEqual([failure]);
	});
});
